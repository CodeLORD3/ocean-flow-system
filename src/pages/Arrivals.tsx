import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Truck, PackageCheck, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { pendingArrivalLines, registerPurchaseArrival } from "@/lib/purchaseArrival";
import { createWasteReport, WASTE_REASON_LABEL, type WasteReason } from "@/lib/waste";
import { grossistStoreId, inkopslagerId } from "@/lib/locations";
import { openLotLabels } from "@/lib/lotLabelPdf";

const nf = (v: any, dec = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

interface DraftLine {
  lineId: string;
  productId: string;
  productName: string | null;
  lotId: string | null;
  lotNumber: string | null;
  expected: number;
  received: string;
  unitCost: number | null;
  catchArea?: string | null;
  vesselName?: string | null;
  bestBefore?: string | null;
  supplierLotNumber?: string | null;
}


/**
 * Registrera ankomst. Varan som bokförts på INKÖPSLAGRET flyttas fysiskt till
 * GROSSISTLAGRET med följesedeln som underlag. Skillnaden mellan förväntad och
 * mottagen kvantitet stannar inte kvar — den skrivs av som svinn på
 * inköpslagret med orsak, så saldot alltid stämmer mot verkligheten.
 */
export default function Arrivals() {
  const qc = useQueryClient();
  const [openReport, setOpenReport] = useState<any | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState<WasteReason>("saknas");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingLines, setLoadingLines] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [handled, setHandled] = useState<string[]>([]);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["pending_arrivals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_reports")
        .select(
          "id, display_name, file_name, document_number, document_date, delivery_date, report_date, supplier_name_raw, total_ex_vat, posted_at",
        )
        .not("posted_at", "is", null)
        .is("arrived_at", null)
        .is("archived_at", null)
        .order("posted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: purchaseLocationId } = useQuery({
    queryKey: ["inkopslager_id"],
    queryFn: async () => inkopslagerId(await grossistStoreId()),
  });

  /** Redan godkända följesedlar försvinner ur listan direkt. */
  const visibleReports = useMemo(
    () => (reports as any[]).filter((r) => !handled.includes(r.id)),
    [reports, handled],
  );


  const deviations = useMemo(
    () =>
      draft
        .map((l) => ({
          line: l,
          missing: Math.max(0, l.expected - (Number(String(l.received).replace(",", ".")) || 0)),
        }))
        .filter((d) => d.missing > 0.0001),
    [draft],
  );

  const totals = useMemo(() => {
    const expected = draft.reduce((s, l) => s + l.expected, 0);
    const received = draft.reduce(
      (s, l) => s + (Number(String(l.received).replace(",", ".")) || 0),
      0,
    );
    return { expected, received };
  }, [draft]);

  const openArrival = async (report: any) => {
    setOpenReport(report);
    setDraft([]);
    setComment("");
    setReason("saknas");
    setLoadingLines(true);
    try {
      const lines = await pendingArrivalLines(report.id);
      const lotIds = lines.map((l) => l.lotId).filter(Boolean) as string[];
      let lotNumbers: Record<string, string> = {};
      if (lotIds.length) {
        const { data } = await supabase
          .from("lots")
          .select("id, lot_number")
          .in("id", lotIds);
        lotNumbers = Object.fromEntries((data ?? []).map((l: any) => [l.id, l.lot_number]));
      }
      setDraft(
        lines.map((l) => ({
          lineId: l.lineId,
          productId: l.productId,
          productName: l.productName,
          lotId: l.lotId ?? null,
          lotNumber: l.lotId ? (lotNumbers[l.lotId] ?? null) : null,
          expected: Number(l.quantityExpected || 0),
          received: String(Number(l.quantityExpected || 0)).replace(".", ","),
          unitCost: l.unitCost ?? null,
        })),
      );
    } catch (e: any) {
      toast.error(e.message || "Kunde inte hämta partierna för följesedeln.");
    } finally {
      setLoadingLines(false);
    }
  };

  const submit = async () => {
    if (!openReport || saving) return;
    if (!draft.length) return toast.error("Följesedeln har inget kvar i inköpslagret.");
    if (deviations.length && !comment.trim())
      return toast.error("Avvikelse mot förväntad kvantitet kräver en kommentar.");

    const reportId = openReport.id as string;
    // Raden försvinner ur listan direkt så att ett andra klick inte kan
    // skapa ännu en uppsättning rörelser.
    setHandled((prev) => [...prev, reportId]);
    setSaving(true);
    try {
      await registerPurchaseArrival({
        reportId,
        lines: draft.map((l) => ({
          productId: l.productId,
          lotId: l.lotId,
          quantityExpected: l.expected,
          quantityReceived: Number(String(l.received).replace(",", ".")) || 0,
          unitCost: l.unitCost,
          deviationReason: comment.trim() || null,
        })),
      });

      if (deviations.length && purchaseLocationId) {
        await createWasteReport({
          locationId: purchaseLocationId,
          reason,
          comment:
            `Differens vid ankomstregistrering — ${openReport.document_number ?? openReport.display_name ?? "följesedel"}` +
            (comment.trim() ? `: ${comment.trim()}` : ""),
          lines: deviations.map((d) => ({
            productId: d.line.productId,
            lotId: d.line.lotId,
            quantityKg: d.missing,
            unitCost: d.line.unitCost,
          })),
        });
      }

      const movedKg = totals.received;
      setDone(
        `Klart. ${nf(movedKg)} kilo flyttades till grossistlagret.` +
          (deviations.length ? " Differensen är bokförd som svinn på inköpslagret." : ""),
      );
      toast.success(`Klart. ${nf(movedKg)} kilo flyttades till grossistlagret.`);

      // Vyn stängs när rörelserna är bokförda, inte innan.
      setOpenReport(null);
      setDraft([]);
      await qc.invalidateQueries({ queryKey: ["pending_arrivals"] });
      qc.invalidateQueries({ queryKey: ["transfer_orders"] });
      qc.invalidateQueries({ queryKey: ["waste_reports"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    } catch (e: any) {
      setHandled((prev) => prev.filter((id) => id !== reportId));
      toast.error(e.message || "Ankomsten kunde inte registreras.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
          <Truck className="h-5 w-5 text-primary" /> Registrera ankomst
        </h1>
        <p className="text-xs text-muted-foreground">
          Bokförda följesedlar ligger i inköpslagret tills varan kommit fram. Här flyttas den till
          grossistlagret och avvikelser skrivs av som svinn.
        </p>
      </div>

      {done && (
        <div className="flex items-start justify-between gap-3 rounded-md border border-success/40 bg-success/10 p-3">
          <p className="flex items-center gap-2 text-xs text-foreground">
            <PackageCheck className="h-4 w-4 text-success" /> {done}
          </p>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDone(null)}>
            Stäng
          </Button>
        </div>
      )}



      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Hämtar bokförda följesedlar…</p>
          ) : visibleReports.length === 0 ? (
            <EmptyState
              bare
              title="Inget väntar på ankomst"
              description="Följesedlar som bokförts i Inköpsrapportering hamnar här. Bokför en inleverans först."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Följesedel</th>
                    <th className="p-2 text-left font-medium">Leverantör</th>
                    <th className="p-2 text-left font-medium">Datum</th>
                    <th className="p-2 text-right font-medium">Belopp</th>
                    <th className="p-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibleReports.map((r: any) => (
                    <tr key={r.id} className="hover:bg-muted/40">
                      <td className="p-2 font-medium">
                        {r.document_number ?? r.display_name ?? r.file_name}
                      </td>
                      <td className="p-2 text-muted-foreground">{r.supplier_name_raw ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {r.delivery_date ?? r.document_date ?? r.report_date ?? "—"}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums">
                        {r.total_ex_vat ? nf(r.total_ex_vat, 2) : "—"}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => openArrival(r)}
                        >
                          <PackageCheck className="h-3 w-3" /> Registrera ankomst
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(openReport)} onOpenChange={(v) => !v && setOpenReport(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Ankomst — {openReport?.document_number ?? openReport?.display_name ?? "följesedel"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ange mottagen kvantitet per parti. Rörelserna bokförs från inköpslagret till
              grossistlagret med följesedeln som underlag.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border">
            {loadingLines ? (
              <p className="p-4 text-xs text-muted-foreground">Hämtar partier…</p>
            ) : draft.length === 0 ? (
              <EmptyState
                bare
                title="Inget kvar i inköpslagret"
                description="Partierna på den här följesedeln är redan flyttade vidare."
              />
            ) : (
              <div className="divide-y">
                {draft.map((l, i) => {
                  const received = Number(String(l.received).replace(",", ".")) || 0;
                  const missing = l.expected - received;
                  return (
                    <div key={l.lineId} className="flex flex-wrap items-center gap-2 p-2 text-xs">
                      <span className="min-w-[10rem] flex-1 truncate font-medium">
                        {l.productName ?? "Produkt"}
                        {l.lotNumber && (
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">
                            {l.lotNumber}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {nf(l.expected)} kg förväntat
                      </span>
                      <Input
                        value={l.received}
                        onChange={(e) =>
                          setDraft((d) =>
                            d.map((x, xi) => (xi === i ? { ...x, received: e.target.value } : x)),
                          )
                        }
                        inputMode="decimal"
                        className="h-8 w-24 font-mono text-xs tabular-nums"
                      />
                      {Math.abs(missing) > 0.0001 && (
                        <Badge variant="destructive" className="text-[11px]">
                          {missing > 0 ? `−${nf(missing)} kg` : `+${nf(-missing)} kg`}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {draft.length > 0 && (
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span>
                Förväntat:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {nf(totals.expected)} kg
                </span>
              </span>
              <span>
                Mottaget:{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {nf(totals.received)} kg
                </span>
              </span>
            </div>
          )}

          {deviations.length > 0 && (
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs text-foreground">
                {deviations.length} rad(er) avviker mot förväntad kvantitet. Differensen skrivs av
                som svinn på inköpslagret och kräver orsak och kommentar.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Orsak</Label>
                  <Select value={reason} onValueChange={(v) => setReason(v as WasteReason)}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(WASTE_REASON_LABEL).map(([key, label]) => (
                        <SelectItem key={key} value={key} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Kommentar</Label>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    className="text-xs"
                    placeholder="Vad avvek mot följesedeln?"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpenReport(null)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={submit} disabled={saving || draft.length === 0}>
              {saving ? "Registrerar…" : "Registrera ankomst"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
