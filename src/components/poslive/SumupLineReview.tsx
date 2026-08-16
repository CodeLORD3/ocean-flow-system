import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { useSumupReviewLines } from "@/hooks/useSumupHealth";

const money = (minor: number, currency: string) =>
  `${(minor / 100).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`;

const STATUS_LABEL: Record<string, string> = {
  unmatched: "Omatchad artikel",
  unknown_quantity: "Okänd kvantitet",
};

/**
 * Granskningsvy för SumUp-rader som bokförts men behöver mänskligt beslut:
 * artikeln saknar produktkoppling eller kvantiteten kunde inte härledas.
 * Kvittot bokförs alltid — raden flaggas här istället för att tappas bort.
 */
export function SumupLineReview() {
  const { data: lines = [], isLoading } = useSumupReviewLines();

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          SumUp — rader att granska
          {lines.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
              {lines.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs">
        {isLoading ? (
          <p className="text-muted-foreground">Hämtar…</p>
        ) : lines.length === 0 ? (
          <p className="text-muted-foreground">Inga rader behöver granskas.</p>
        ) : (
          <div className="divide-y divide-border/60">
            {lines.map((l) => {
              const tx = l.pos_transactions ?? {};
              const currency = (tx.currency ?? "CHF").toUpperCase();
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{l.product_name || "—"}</p>
                    <p className="font-mono tabular-nums text-[11px] text-muted-foreground">
                      {tx.occurred_at ? new Date(tx.occurred_at).toLocaleString("sv-SE") : "—"}
                      {tx.external_receipt_no ? ` · kvitto ${tx.external_receipt_no}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono tabular-nums text-foreground">
                      {Number(l.quantity ?? 0).toLocaleString("sv-SE", {
                        maximumFractionDigits: 3,
                      })}{" "}
                      {l.unit ?? ""} · {money(l.line_total_ore ?? 0, currency)}
                    </p>
                    <Badge
                      variant="outline"
                      className="mt-0.5 text-[10px] text-warning border-warning/40"
                    >
                      <AlertTriangle className="mr-1 h-3 w-3" />
                      {STATUS_LABEL[l.review_status] ?? l.review_status}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
