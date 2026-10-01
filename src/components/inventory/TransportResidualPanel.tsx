import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Undo2, Trash2, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  fetchTransportResiduals,
  resolveTransportResidual,
  type ResidualAction,
  type TransportResidual,
} from "@/lib/receivingCorrections";

const fmtKg = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Det som blev kvar på transportlager efter butikens inleverans — att reda ut. */
export function TransportResidualPanel({ storeId }: { storeId?: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["transport-residuals", storeId ?? "all"],
    queryFn: () => fetchTransportResiduals(storeId),
  });

  if (!data.length) return null;

  const act = async (r: TransportResidual, action: ResidualAction) => {
    const label = action === "tillbaka" ? "tillbaka till grossistlagret" : "som svinn";
    if (!window.confirm(`Bokför ${fmtKg(r.totalKg)} ${r.unit} ${r.productName} ${label}?`)) return;
    const key = `${r.orderId}:${r.productId}`;
    setBusy(key);
    try {
      await resolveTransportResidual(r, action);
      toast({ title: "Bokfört", description: `${r.productName} ${label}.` });
      qc.invalidateQueries({ queryKey: ["transport-residuals"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    } catch (e: any) {
      toast({ title: "Kunde inte bokföra", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-warning/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" /> Att reda ut på transportlager
        </CardTitle>
        <CardDescription className="text-xs">
          Varor som inte togs emot i butiken. Välj vad som hände med dem, eller låt dem ligga kvar om de skickas senare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.map((r) => {
          const key = `${r.orderId}:${r.productId}`;
          return (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
              <div>
                <div className="font-medium">{r.productName}</div>
                <div className="text-muted-foreground">
                  {r.storeName} · leverans {r.orderLabel} ·{" "}
                  <span className="font-mono tabular-nums">{fmtKg(r.totalKg)} {r.unit}</span>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={busy === key} onClick={() => act(r, "tillbaka")}>
                  <Undo2 className="h-3 w-3" /> Tillbaka i grossistlagret
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={busy === key} onClick={() => act(r, "svinn")}>
                  <Trash2 className="h-3 w-3" /> Svinn
                </Button>
                <span className="flex items-center gap-1 text-muted-foreground px-1">
                  <Clock className="h-3 w-3" /> annars: skickas senare
                </span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
