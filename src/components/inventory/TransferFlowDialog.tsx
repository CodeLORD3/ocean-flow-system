import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Printer, ArrowRight, Check, X, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { openTransferPdf } from "@/lib/transferPdf";
import ExportDossierDialog from "@/components/inventory/ExportDossierDialog";
import {
  useApproveInbound,
  useApproveOutbound,
  useMarkPicklistPrinted,
  useRegisterPicking,
  useRejectTransfer,
  useSaveExportDocumentation,
  type TransferOrderRow,
} from "@/hooks/useTransferOrders";

interface TransferFlowDialogProps {
  order: TransferOrderRow | null;
  onOpenChange: (open: boolean) => void;
}

export const STATUS_LABEL: Record<string, string> = {
  skapad: "Skapad",
  plocklista_utskriven: "Plocklista utskriven",
  godkand_utleverans: "Utleverans godkänd",
  under_transport: "Under transport",
  delvis_levererad: "Delvis levererad",
  godkand_inleverans: "Inleverans godkänd",
  avvisad: "Avvisad",
};

const STEP_HINT: Record<string, string> = {
  skapad: "Skriv ut plocklistan. Papperet är alltid en kopia av systemet.",
  plocklista_utskriven:
    "Registrera plockad kvantitet per rad. Avvikelse mot beställd kvantitet kräver orsak.",
  under_transport:
    "Mottagaren registrerar mottagen kvantitet. Differens mot skickat bokförs som svinn hos avsändaren.",
  delvis_levererad: "Kvarstående rader kan tas emot i en andra inleverans.",
  godkand_inleverans: "Klar. Saldona är bokförda på mottagande lagerplats.",
  avvisad: "Avvisad. Inga saldon ändrades.",
};

const nf = (v: any, dec = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const levelName = (loc: any) =>
  LEVEL_LABEL[loc?.location_type as LocationLevel] ?? "okänd nivå";

/**
 * Guidat flöde för en överföring. Ett steg åt gången, i den ordning
 * lagerstrukturen kräver: plocklista → plockning → utleverans → inleverans.
 */
export default function TransferFlowDialog({ order, onOpenChange }: TransferFlowDialogProps) {
  const lines = useMemo(
    () =>
      ((order?.transfer_order_lines ?? []) as any[]).slice().sort(
        (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
      ),
    [order],
  );

  const [pick, setPick] = useState<Record<string, { qty: string; reason: string }>>({});
  const [recv, setRecv] = useState<Record<string, { qty: string; reason: string }>>({});
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!order) return;
    const p: Record<string, { qty: string; reason: string }> = {};
    const r: Record<string, { qty: string; reason: string }> = {};
    for (const l of lines) {
      p[l.id] = {
        qty: String(l.quantity_picked ?? l.quantity_ordered ?? 0),
        reason: l.pick_deviation_reason ?? "",
      };
      r[l.id] = {
        qty: String(l.quantity_received ?? l.quantity_shipped ?? 0),
        reason: l.receive_deviation_reason ?? "",
      };
    }
    setPick(p);
    setRecv(r);
    setRejectReason("");
  }, [order?.id, lines.length]);

  const printed = useMarkPicklistPrinted();
  const picking = useRegisterPicking();
  const outbound = useApproveOutbound();
  const inbound = useApproveInbound();
  const reject = useRejectTransfer();

  if (!order) return null;
  const status = order.status;

  const pdfLines = lines.map((l) => ({
    productName: l.products?.name ?? "Produkt",
    lotNumber: l.lots?.lot_number ?? null,
    quantityOrdered: Number(l.quantity_ordered ?? 0),
    quantityPicked: l.quantity_picked === null ? null : Number(l.quantity_picked),
    quantityShipped: l.quantity_shipped === null ? null : Number(l.quantity_shipped),
    deviationReason: l.pick_deviation_reason ?? l.receive_deviation_reason ?? null,
  }));

  const printDoc = (kind: "plocklista" | "foljesedel") =>
    openTransferPdf({
      kind,
      orderNumber: order.order_number,
      fromName: order.from_location?.name ?? "",
      fromLevel: levelName(order.from_location),
      toName: order.to_location?.name ?? "",
      toLevel: levelName(order.to_location),
      sourceDocumentLabel: order.source_document_type ?? null,
      createdAt: order.created_at,
      reason: order.reason ?? null,
      lines: pdfLines,
    });

  const doPrintPicklist = async () => {
    printDoc("plocklista");
    try {
      await printed.mutateAsync(order.id);
      toast.success("Plocklistan är utskriven och registrerad på ordern.");
    } catch (e: any) {
      toast.error(e.message || "Kunde inte registrera utskriften.");
    }
  };

  const doRegisterPicking = async () => {
    try {
      await picking.mutateAsync({
        orderId: order.id,
        lines: lines.map((l) => ({
          id: l.id,
          quantityPicked: Number(String(pick[l.id]?.qty ?? "0").replace(",", ".")) || 0,
          deviationReason: pick[l.id]?.reason?.trim() || null,
        })),
      });
      toast.success("Plockningen är registrerad.");
    } catch (e: any) {
      toast.error(e.message || "Plockningen kunde inte registreras.");
    }
  };

  const doApproveOutbound = async () => {
    try {
      await outbound.mutateAsync(order.id);
      printDoc("foljesedel");
      toast.success("Utleveransen är godkänd. Varan ligger under transport.");
    } catch (e: any) {
      toast.error(e.message || "Utleveransen kunde inte godkännas.");
    }
  };

  const doApproveInbound = async () => {
    try {
      const res = await inbound.mutateAsync({
        orderId: order.id,
        lines: lines.map((l) => ({
          id: l.id,
          quantityReceived: Number(String(recv[l.id]?.qty ?? "0").replace(",", ".")) || 0,
          deviationReason: recv[l.id]?.reason?.trim() || null,
        })),
      });
      toast.success(
        res?.outstanding
          ? "Delvis levererad. Kvarstående rader kan tas emot senare."
          : "Inleveransen är godkänd och saldona är bokförda.",
      );
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Inleveransen kunde inte godkännas.");
    }
  };

  const doReject = async () => {
    try {
      await reject.mutateAsync({ orderId: order.id, reason: rejectReason });
      toast.success("Leveransen är avvisad. Inga saldon ändrades.");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Kunde inte avvisa leveransen.");
    }
  };

  const showPicking = status === "plocklista_utskriven";
  const showReceiving = status === "under_transport" || status === "delvis_levererad";

  return (
    <Dialog open onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {order.order_number}
            <Badge variant="secondary" className="text-[11px]">
              {STATUS_LABEL[status] ?? status}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {order.from_location?.name} ({levelName(order.from_location)})
            {" → "}
            {order.to_location?.name} ({levelName(order.to_location)}) — {STEP_HINT[status] ?? ""}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-2 text-left font-medium">Produkt</th>
                <th className="p-2 text-left font-medium">Parti</th>
                <th className="p-2 text-right font-medium">Beställt</th>
                <th className="p-2 text-right font-medium">Plockat</th>
                <th className="p-2 text-right font-medium">Skickat</th>
                <th className="p-2 text-right font-medium">Mottaget</th>
                {(showPicking || showReceiving) && (
                  <th className="p-2 text-left font-medium">Orsak vid avvikelse</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="p-2">{l.products?.name ?? "Produkt"}</td>
                  <td className="p-2 font-mono text-[11px] text-muted-foreground">
                    {l.lots?.lot_number ?? "—"}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {nf(l.quantity_ordered)}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {showPicking ? (
                      <Input
                        value={pick[l.id]?.qty ?? ""}
                        onChange={(e) =>
                          setPick((p) => ({
                            ...p,
                            [l.id]: { ...(p[l.id] ?? { reason: "" }), qty: e.target.value },
                          }))
                        }
                        className="h-8 w-20 text-right font-mono text-xs tabular-nums"
                        inputMode="decimal"
                      />
                    ) : l.quantity_picked === null ? (
                      "—"
                    ) : (
                      nf(l.quantity_picked)
                    )}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {l.quantity_shipped === null ? "—" : nf(l.quantity_shipped)}
                  </td>
                  <td className="p-2 text-right font-mono tabular-nums">
                    {showReceiving ? (
                      <Input
                        value={recv[l.id]?.qty ?? ""}
                        onChange={(e) =>
                          setRecv((p) => ({
                            ...p,
                            [l.id]: { ...(p[l.id] ?? { reason: "" }), qty: e.target.value },
                          }))
                        }
                        className="h-8 w-20 text-right font-mono text-xs tabular-nums"
                        inputMode="decimal"
                      />
                    ) : l.quantity_received === null ? (
                      "—"
                    ) : (
                      nf(l.quantity_received)
                    )}
                  </td>
                  {(showPicking || showReceiving) && (
                    <td className="p-2">
                      <Input
                        value={(showPicking ? pick[l.id]?.reason : recv[l.id]?.reason) ?? ""}
                        onChange={(e) =>
                          showPicking
                            ? setPick((p) => ({
                                ...p,
                                [l.id]: { ...(p[l.id] ?? { qty: "0" }), reason: e.target.value },
                              }))
                            : setRecv((p) => ({
                                ...p,
                                [l.id]: { ...(p[l.id] ?? { qty: "0" }), reason: e.target.value },
                              }))
                        }
                        placeholder="Endast vid avvikelse"
                        className="h-8 min-w-[10rem] text-xs"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {showReceiving && (
          <div className="space-y-1">
            <Label className="text-xs">Avvisa hela leveransen (orsak krävs)</Label>
            <div className="flex gap-2">
              <Input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Till exempel: bruten kylkedja"
                className="h-8 text-xs"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={doReject}
                disabled={reject.isPending}
              >
                <X className="h-3 w-3" /> Avvisa
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {(status === "skapad" || status === "plocklista_utskriven") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={doPrintPicklist}
              disabled={printed.isPending}
            >
              <Printer className="h-3 w-3" /> Skriv ut plocklista
            </Button>
          )}
          {showPicking && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={doRegisterPicking}
                disabled={picking.isPending}
              >
                <Check className="h-3 w-3" /> Registrera plockning
              </Button>
              <Button
                size="sm"
                className="gap-1 text-xs"
                onClick={doApproveOutbound}
                disabled={outbound.isPending}
              >
                Godkänn utleverans <ArrowRight className="h-3 w-3" />
              </Button>
            </>
          )}
          {showReceiving && (
            <Button
              size="sm"
              className="gap-1 text-xs"
              onClick={doApproveInbound}
              disabled={inbound.isPending}
            >
              <Check className="h-3 w-3" /> Godkänn inleverans
            </Button>
          )}
          {(status === "godkand_inleverans" || status === "under_transport") && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => printDoc("foljesedel")}
            >
              <Printer className="h-3 w-3" /> Följesedel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
