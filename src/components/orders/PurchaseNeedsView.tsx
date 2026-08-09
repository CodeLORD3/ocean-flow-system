import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { usePurchaseNeeds } from "@/hooks/useCustomerOrders";

const nf = (v: any, d = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const dateLabel = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

/**
 * Sålt men inte köpt: kundorderrader som inte kunde reserveras ur butikens
 * lager. Grupperat per leveransdatum och produkt, summerat över alla butiker.
 */
export function PurchaseNeedsView() {
  const { data: rows = [], isLoading } = usePurchaseNeeds();

  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byDate.get(r.wanted_date) ?? [];
    list.push(r);
    byDate.set(r.wanted_date, list);
  }

  if (!isLoading && rows.length === 0) {
    return (
      <EmptyState
        title="Inget sålt som inte är köpt"
        description="Alla kundorder täcks av partier som redan finns i butikernas lager."
      />
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(byDate.entries()).map(([date, list]) => (
        <Card key={date}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base capitalize">{dateLabel(date)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {list.map((r) => (
              <div
                key={`${date}-${r.product_id}-${r.product_name}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-2 last:border-0 last:pb-0"
              >
                <div className="min-w-[160px] font-medium">{r.product_name}</div>
                <div className="flex flex-1 flex-wrap gap-2 text-xs text-muted-foreground">
                  {r.perStore.map((s) => (
                    <Badge key={s.storeId} variant="outline" className="font-mono tabular-nums">
                      {s.storeName} {nf(s.quantity)} {r.unit}
                    </Badge>
                  ))}
                </div>
                <div className="font-mono text-sm font-semibold tabular-nums">
                  totalt {nf(r.total)} {r.unit}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
