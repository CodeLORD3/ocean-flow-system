import { useMemo, useState } from "react";
import { Printer, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import { allergenLabel } from "@/lib/catering";
import { ORDER_TYPE_LABELS } from "@/lib/customerOrders";

const nf = (v: any, d = 3) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * Kökslistan "Att förbereda". Summerar allt som ska tillredas ett visst datum
 * per vara, med orderraderna under. Allergier står alltid först.
 */
export function CateringKitchenList({ storeId }: { storeId?: string | null }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId,
    fromDate: date,
    toDate: date,
  });

  const active = useMemo(
    () => orders.filter((o) => !["avbruten", "forfragan"].includes(o.status)),
    [orders],
  );

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        unit: string;
        total: number;
        rows: { orderNumber: string; customer: string; qty: number; note: string | null; time: string | null }[];
      }
    >();
    for (const o of active) {
      for (const l of o.customer_order_lines || []) {
        if (l.pack_status === "struken") continue;
        const name = (l.products?.name || l.free_text_name || "Vara") as string;
        const key = `${name}|${l.unit}`;
        const entry = map.get(key) ?? { name, unit: l.unit, total: 0, rows: [] };
        const qty = Number(l.quantity_packed ?? l.quantity_ordered ?? 0);
        entry.total += qty;
        entry.rows.push({
          orderNumber: o.order_number,
          customer: o.customers_retail?.name || o.customer_name_snapshot || "Kund",
          qty,
          note: l.note ?? null,
          time: o.wanted_time ?? null,
        });
        map.set(key, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [active]);

  const allergyOrders = active.filter(
    (o) => o.allergy_note || (o.excluded_allergens || []).length > 0,
  );

  const printList = () => window.print();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="text-xs text-muted-foreground">Datum</label>
          <Input
            type="date"
            className="h-11 w-[170px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button variant="outline" className="h-11" onClick={printList}>
          <Printer className="mr-2 h-4 w-4" /> Skriv ut kökslistan
        </Button>
      </div>

      {allergyOrders.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Allergier denna dag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {allergyOrders.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs tabular-nums">{o.order_number}</span>
                <span className="font-semibold">
                  {o.customers_retail?.name || o.customer_name_snapshot || "Kund"}
                </span>
                {(o.excluded_allergens || []).map((a) => (
                  <Badge key={a} variant="destructive">
                    Undvik {allergenLabel(a).toLowerCase()}
                  </Badge>
                ))}
                {o.allergy_note && <span>{o.allergy_note}</span>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isLoading && grouped.length === 0 ? (
        <EmptyState
          title="Inget att förbereda"
          description="När en beställning ligger på det valda datumet summeras varorna här som en kökslista."
        />
      ) : (
        <div className="space-y-2">
          {grouped.map((g) => (
            <Card key={g.name}>
              <CardContent className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ChefHat className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{g.name}</span>
                  <span className="ml-auto font-mono text-lg tabular-nums">
                    {nf(g.total)} {g.unit}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {g.rows.map((r, i) => (
                    <div
                      key={`${r.orderNumber}-${i}`}
                      className="flex flex-wrap items-center gap-2 rounded bg-muted/60 px-2 py-1 text-xs"
                    >
                      <span className="font-mono tabular-nums">{r.orderNumber}</span>
                      <span>{r.customer}</span>
                      {r.time && <span className="text-muted-foreground">kl {r.time.slice(0, 5)}</span>}
                      <span className="ml-auto font-mono tabular-nums">
                        {nf(r.qty)} {g.unit}
                      </span>
                      {r.note && <span className="w-full text-muted-foreground">{r.note}</span>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {active.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {active.length} order denna dag ·{" "}
          {active.filter((o) => o.order_type === "leverans").length}{" "}
          {ORDER_TYPE_LABELS.leverans.toLowerCase()}
        </p>
      )}
    </div>
  );
}
