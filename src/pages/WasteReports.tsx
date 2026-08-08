import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Trash2, Plus } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useStorageLocations, useProductStockLocations } from "@/hooks/useStorageLocations";
import { useWasteReports } from "@/hooks/useTransferOrders";
import { createWasteReport, WASTE_REASON_LABEL, type WasteReason } from "@/lib/waste";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { EmptyState } from "@/components/EmptyState";
import { useQueryClient } from "@tanstack/react-query";

const NO_LOT = "__utan_parti__";

const nf = (v: any, dec = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/**
 * Svinn. Varje svinnrörelse kräver en rapport med orsak — databasen vägrar
 * bokföra svinn utan underlag, så det här är enda vägen in.
 */
export default function WasteReports() {
  const { activeStoreId, activeStoreName } = useSite();
  const qc = useQueryClient();
  const { data: locations = [] } = useStorageLocations(activeStoreId || "all");
  const locationIds = useMemo(
    () => (activeStoreId ? (locations as any[]).map((l: any) => l.id) : undefined),
    [locations, activeStoreId],
  );
  const { data: reports = [], isLoading } = useWasteReports(locationIds);

  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState<WasteReason>("kassation");
  const [comment, setComment] = useState("");
  const [picked, setPicked] = useState<Record<string, { qty: string; lotId: string }>>({});
  const [saving, setSaving] = useState(false);

  const { data: stock = [] } = useProductStockLocations(locationId || undefined);
  const rows = useMemo(
    () => (locationId ? (stock as any[]).filter((r) => Number(r.quantity) > 0) : []),
    [stock, locationId],
  );

  const { data: lotsByProduct = {} } = useQuery({
    queryKey: ["waste_lot_balances", locationId, rows.map((r) => r.product_id).join(",")],
    enabled: Boolean(locationId) && rows.length > 0,
    queryFn: async () => {
      const out: Record<string, any[]> = {};
      for (const row of rows) out[row.product_id] = await lotBalancesAtLocation(row.product_id, locationId);
      return out;
    },
  });

  const reset = () => {
    setPicked({});
    setComment("");
    setReason("kassation");
  };

  const submit = async () => {
    const lines = Object.entries(picked)
      .map(([productId, sel]) => ({
        productId,
        lotId: sel.lotId === NO_LOT ? null : sel.lotId,
        quantityKg: Number(String(sel.qty).replace(",", ".")) || 0,
      }))
      .filter((l) => l.quantityKg > 0);

    if (!locationId) return toast.error("Välj lagerplats där svinnet uppstod.");
    if (!lines.length) return toast.error("Markera minst en rad med kvantitet.");
    if (reason === "annat" && !comment.trim())
      return toast.error("Orsaken \"Annat\" kräver en kommentar.");

    setSaving(true);
    try {
      await createWasteReport({
        locationId,
        reason,
        comment: comment.trim() || null,
        lines,
      });
      toast.success("Svinnet är bokfört och rapporten sparad.");
      qc.invalidateQueries({ queryKey: ["waste_reports"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      reset();
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Svinnet kunde inte bokföras.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
            <Trash2 className="h-5 w-5 text-primary" /> Svinn
          </h1>
          <p className="text-xs text-muted-foreground">
            Varje svinnrörelse kräver orsak och rapport
            {activeStoreName ? ` — ${activeStoreName}` : ""}.
          </p>
        </div>
        <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setOpen(true)}>
          <Plus className="h-3 w-3" /> Rapportera svinn
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Hämtar svinnrapporter…</p>
          ) : (reports as any[]).length === 0 ? (
            <EmptyState
              bare
              title="Inget svinn rapporterat"
              description="Kassation, skadad vara och differens vid inleverans hamnar här med orsak och kvantitet."
              actionLabel="Rapportera svinn"
              onAction={() => setOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Datum</th>
                    <th className="p-2 text-left font-medium">Lagerplats</th>
                    <th className="p-2 text-left font-medium">Orsak</th>
                    <th className="p-2 text-left font-medium">Rader</th>
                    <th className="p-2 text-right font-medium">Kilo</th>
                    <th className="p-2 text-left font-medium">Kommentar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(reports as any[]).map((r) => {
                    const lines = (r.waste_report_lines ?? []) as any[];
                    const total = lines.reduce((s, l) => s + Math.abs(Number(l.quantity_kg || 0)), 0);
                    return (
                      <tr key={r.id} className="align-top hover:bg-muted/40">
                        <td className="p-2 text-muted-foreground">
                          {new Date(r.created_at).toLocaleString("sv-SE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="p-2">
                          {r.storage_locations?.name}
                          <span className="block text-[11px] text-muted-foreground">
                            {LEVEL_LABEL[r.storage_locations?.location_type as LocationLevel] ?? ""}
                          </span>
                        </td>
                        <td className="p-2">
                          {WASTE_REASON_LABEL[r.reason as WasteReason] ?? r.reason}
                        </td>
                        <td className="p-2">
                          {lines.map((l) => (
                            <span key={l.id} className="block">
                              {l.products?.name ?? "Produkt"}
                              {l.lots?.lot_number ? ` (${l.lots.lot_number})` : ""} —{" "}
                              {nf(Math.abs(Number(l.quantity_kg)))} kg
                            </span>
                          ))}
                        </td>
                        <td className="p-2 text-right font-mono tabular-nums">{nf(total)}</td>
                        <td className="p-2 text-muted-foreground">{r.comment ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : (reset(), setOpen(false)))}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Rapportera svinn</DialogTitle>
            <DialogDescription className="text-xs">
              Svinnet bokförs som en rörelse på lagerplatsen så snart rapporten sparas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Lagerplats</Label>
              <Select
                value={locationId}
                onValueChange={(v) => {
                  setLocationId(v);
                  setPicked({});
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Välj lagerplats" />
                </SelectTrigger>
                <SelectContent>
                  {(locations as any[]).map((l) => (
                    <SelectItem key={l.id} value={l.id} className="text-xs">
                      {l.name} — {LEVEL_LABEL[l.location_type as LocationLevel] ?? "okänd nivå"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Kommentar</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="text-xs"
              placeholder="Vad hände?"
            />
          </div>

          <div className="rounded-md border">
            {!locationId ? (
              <EmptyState
                bare
                title="Välj lagerplats"
                description="Raderna hämtas ur lagerplatsens saldo, så svinn kan bara bokföras på vara som finns."
              />
            ) : rows.length === 0 ? (
              <EmptyState
                bare
                title="Lagerplatsen är tom"
                description="Det finns inget saldo att skriva av här."
              />
            ) : (
              <div className="divide-y">
                {rows.map((row) => {
                  const sel = picked[row.product_id];
                  const lots = (lotsByProduct as any)[row.product_id] ?? [];
                  return (
                    <div key={row.id} className="flex flex-wrap items-center gap-2 p-2 text-xs">
                      <Checkbox
                        checked={Boolean(sel)}
                        onCheckedChange={(v) =>
                          setPicked((p) => {
                            const next = { ...p };
                            if (v) next[row.product_id] = { qty: "", lotId: NO_LOT };
                            else delete next[row.product_id];
                            return next;
                          })
                        }
                      />
                      <span className="min-w-[10rem] flex-1 truncate font-medium">
                        {row.products?.name ?? "Produkt"}
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {nf(row.quantity)} kg i lager
                      </span>
                      {sel && (
                        <>
                          <Input
                            value={sel.qty}
                            onChange={(e) =>
                              setPicked((p) => ({
                                ...p,
                                [row.product_id]: { ...sel, qty: e.target.value },
                              }))
                            }
                            placeholder="kg"
                            className="h-8 w-20 font-mono text-xs tabular-nums"
                            inputMode="decimal"
                          />
                          <Select
                            value={sel.lotId}
                            onValueChange={(v) =>
                              setPicked((p) => ({
                                ...p,
                                [row.product_id]: { ...sel, lotId: v },
                              }))
                            }
                          >
                            <SelectTrigger className="h-8 w-44 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_LOT} className="text-xs">
                                Utan parti
                              </SelectItem>
                              {lots.map((lot: any) => (
                                <SelectItem key={lot.lotId} value={lot.lotId} className="text-xs">
                                  {lot.lotNumber ?? "Parti"} — {lot.quantityKg} kg
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving ? "Bokför…" : "Bokför svinn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
