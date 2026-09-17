import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { analyzeOrderBatches, commitOrderBatches, type BatchRepairLine } from "@/lib/exportBatchRepair";

/**
 * Kopplar parti per rad på en skickad exportleverans, så fakturan till Fortnox
 * kan visa partinummer. Färskaste partiet är förvalt enligt exportregeln.
 */
export function ShopOrderBatchRepairDialog({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const lines = useQuery({
    queryKey: ["shop_order_batch_repair", orderId],
    queryFn: () => analyzeOrderBatches(orderId),
    enabled: open,
  });

  useEffect(() => {
    if (!lines.data) return;
    const next: Record<string, string> = {};
    for (const line of lines.data) if (line.suggestedLotId) next[line.productId] = line.suggestedLotId;
    setChoice(next);
  }, [lines.data]);

  const rows: BatchRepairLine[] = lines.data ?? [];
  const withoutCandidate = rows.filter((r) => !r.candidates.length);
  const ready = rows.filter((r) => choice[r.productId]);

  const save = async () => {
    setSaving(true);
    try {
      await commitOrderBatches(
        orderId,
        ready.map((r) => ({ productId: r.productId, lotId: choice[r.productId], quantity: r.quantity })),
      );
      toast.success(`Parti kopplat på ${ready.length} rader`);
      qc.invalidateQueries({ queryKey: ["shop_order_batch_repair", orderId] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte bokföra partierna");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Koppla parti före fakturering</DialogTitle>
          <DialogDescription>
            Varje rad på exportfakturan måste bära parti. Färskaste partiet är förvalt.
          </DialogDescription>
        </DialogHeader>

        {lines.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Läser leveransen…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Alla rader har redan parti.</p>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {rows.map((line) => (
              <div key={line.productId} className="rounded-lg border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{line.productName}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {line.quantity} {line.unit}
                  </span>
                </div>
                {line.candidates.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {line.candidates.slice(0, 6).map((c) => {
                      const active = choice[line.productId] === c.lotId;
                      return (
                        <button
                          key={c.lotId}
                          type="button"
                          onClick={() => setChoice((p) => ({ ...p, [line.productId]: c.lotId }))}
                          className={`rounded-md border px-2 py-1 text-left text-[11px] ${
                            active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <span className="font-mono">{c.lotNumber}</span>
                          {c.bestBefore && <span className="ml-1.5">bäst före {c.bestBefore}</span>}
                          {c.availableKg > 0.001 ? (
                            <span className="ml-1.5 text-emerald-500">i lager</span>
                          ) : (
                            <span className="ml-1.5">utan saldo</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Badge variant="outline" className="mt-2 text-[11px]">
                    Inget parti registrerat — bokför inleveransen eller produktionen först
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-[11px] text-muted-foreground">
            {ready.length} av {rows.length} rader klara
            {withoutCandidate.length > 0 && ` · ${withoutCandidate.length} saknar registrerat parti`}
          </span>
          <Button size="sm" disabled={saving || !ready.length} onClick={save}>
            {saving ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <PackageCheck className="mr-1 h-3.5 w-3.5" />
            )}
            Bokför partier
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
