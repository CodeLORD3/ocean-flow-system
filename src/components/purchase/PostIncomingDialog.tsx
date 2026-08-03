import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, PackageCheck } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  buildPostingPlan,
  evenBatchSplit,
  postPurchaseReport,
  quantityToKg,
  type PostingLine,
  type PostingProduct,
} from "@/lib/purchaseReportPosting";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: {
    id: string;
    document_number?: string | null;
    document_date?: string | null;
    report_date: string;
    posted_at?: string | null;
  } | null;
  lines: PostingLine[];
  products: PostingProduct[];
}

const nf = (n: number) => n.toLocaleString("sv-SE", { maximumFractionDigits: 2 });

/**
 * Bokför en inköpsrapport till lagerledgern: partier, inleveransrörelse och
 * manuell fördelning över batchnummer när en rad bär flera partier.
 */
export default function PostIncomingDialog({ open, onOpenChange, report, lines, products }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  // Manuella justeringar per rad: { lineId: { batchnr: kg } }
  const [allocations, setAllocations] = useState<Record<string, Record<string, number>>>({});
  const [zeroConfirmed, setZeroConfirmed] = useState<Record<string, boolean>>({});

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const multiBatchLines = useMemo(
    () => lines.filter((l) => (l.lot_numbers ?? []).filter(Boolean).length > 1),
    [lines],
  );

  const zeroPriceLines = useMemo(
    () => lines.filter((l) => !(Number(l.unit_price ?? 0) > 0)),
    [lines],
  );

  const effectiveLines: PostingLine[] = useMemo(
    () =>
      lines.map((l) => ({
        ...l,
        batch_quantities: allocations[l.id] ?? l.batch_quantities ?? null,
        zero_price_confirmed: zeroConfirmed[l.id] || l.zero_price_confirmed || false,
      })),
    [lines, allocations, zeroConfirmed],
  );

  const plan = useMemo(
    () =>
      buildPostingPlan(effectiveLines, {
        products,
        documentNumber: report?.document_number ?? null,
        documentDate: report?.document_date ?? null,
        reportDate: report?.report_date ?? null,
      }),
    [effectiveLines, products, report],
  );

  const allocationFor = (line: PostingLine): Record<string, number> => {
    const numbers = (line.lot_numbers ?? []).filter(Boolean);
    if (allocations[line.id]) return allocations[line.id];
    if (line.batch_quantities && Object.keys(line.batch_quantities).length) return line.batch_quantities;
    const { kg } = quantityToKg(line, productById.get(line.product_id ?? ""));
    return evenBatchSplit(numbers, kg ?? 0);
  };

  const setAllocation = (lineId: string, batch: string, value: string) => {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const current = allocationFor(line);
    setAllocations((prev) => ({
      ...prev,
      [lineId]: { ...current, [batch]: Number(value.replace(",", ".")) || 0 },
    }));
  };

  const handlePost = async () => {
    if (!report) return;
    setSaving(true);
    try {
      // Manuella fördelningar sparas på raden så bokföringen kan granskas i efterhand.
      for (const [lineId, alloc] of Object.entries(allocations)) {
        await supabase
          .from("purchase_report_lines")
          .update({ batch_quantities: alloc } as any)
          .eq("id", lineId);
      }
      for (const [lineId, confirmed] of Object.entries(zeroConfirmed)) {
        if (!confirmed) continue;
        await supabase
          .from("purchase_report_lines")
          .update({ zero_price_confirmed: true } as any)
          .eq("id", lineId);
      }

      const { lotIds } = await postPurchaseReport({ reportId: report.id, plan });

      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      queryClient.invalidateQueries({ queryKey: ["product_stock_locations"] });
      queryClient.invalidateQueries({ queryKey: ["all_stock_locations"] });
      queryClient.invalidateQueries({ queryKey: ["lots"] });
      toast({
        title: "Inleverans bokförd",
        description: `${lotIds.length} partier skapades i Grossist Flytande med preliminärt pris.`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Bokföringen stoppades", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" /> Bokför inleverans
          </DialogTitle>
          <DialogDescription>
            Partier skapas med preliminärt pris från följesedeln och bokförs mot Grossist Flytande.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-5">
            {zeroPriceLines.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Nollpris — bekräfta manuellt innan bokföring
                </p>
                {zeroPriceLines.map((l) => (
                  <label key={l.id} className="flex min-h-[48px] items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={zeroConfirmed[l.id] || !!l.zero_price_confirmed}
                      onChange={(e) =>
                        setZeroConfirmed((prev) => ({ ...prev, [l.id]: e.target.checked }))
                      }
                    />
                    <span>{l.product_name} — pris 0 kr är korrekt</span>
                  </label>
                ))}
              </div>
            )}

            {multiBatchLines.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Fördelning över partinummer</p>
                {multiBatchLines.map((line) => {
                  const alloc = allocationFor(line);
                  const total = Object.values(alloc).reduce((s, v) => s + Number(v || 0), 0);
                  const { kg } = quantityToKg(line, productById.get(line.product_id ?? ""));
                  const diff = Math.abs(total - (kg ?? 0)) > 0.005;
                  return (
                    <div key={line.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{line.product_name}</span>
                        <span className={diff ? "text-destructive" : "text-muted-foreground"}>
                          {nf(total)} / {nf(kg ?? 0)} kg
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(line.lot_numbers ?? []).filter(Boolean).map((batch) => (
                          <div key={batch} className="space-y-1">
                            <Label className="text-xs">{batch}</Label>
                            <Input
                              className="h-12 tabular-nums"
                              inputMode="decimal"
                              value={String(alloc[batch] ?? 0)}
                              onChange={(e) => setAllocation(line.id, batch, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">Partier som skapas ({plan.lots.length})</p>
              <div className="rounded-md border divide-y">
                {plan.lots.map((lot) => (
                  <div key={lot.key} className="flex items-center justify-between gap-3 p-2 text-sm">
                    <span className="font-mono">{lot.lotNumber}</span>
                    <span className="text-muted-foreground">
                      {lot.lineIds.length > 1 ? `${lot.lineIds.length} rader` : "1 rad"}
                    </span>
                    <span className="font-mono tabular-nums">{nf(lot.quantityKg)} kg</span>
                    <span className="font-mono tabular-nums">{nf(lot.unitCost)} kr/kg</span>
                    <span className="text-muted-foreground">
                      {lot.bestBefore ? `BF ${lot.bestBefore}` : "BF saknas"}
                    </span>
                  </div>
                ))}
                {plan.lots.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">Inga rader kan bokföras ännu.</p>
                )}
              </div>
            </div>

            {plan.warnings.length > 0 && (
              <div className="space-y-1">
                {plan.warnings.map((w, i) => (
                  <p key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {plan.blockers.length > 0 && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                <p className="text-sm font-medium text-destructive">Hinder som måste åtgärdas</p>
                {plan.blockers.map((b, i) => (
                  <p key={i} className="text-sm text-destructive">
                    {b}
                  </p>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="items-center gap-2">
          {report?.posted_at && <Badge variant="secondary">Redan bokförd</Badge>}
          <Button variant="outline" className="min-h-[48px]" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            className="min-h-[48px]"
            onClick={handlePost}
            disabled={saving || !!report?.posted_at || plan.blockers.length > 0 || plan.lots.length === 0}
          >
            {saving ? "Bokför…" : `Bokför ${plan.lots.length} partier`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
