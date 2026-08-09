import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, ShoppingBasket, Store } from "lucide-react";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // 0 = monday
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

function fmt(n: number) {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
}

type Row = {
  key: string;
  name: string;
  unit: string;
  perDay: number[];
  total: number;
  stores: Record<string, number>;
};

/**
 * Enkelt veckoschema för inköp i grossistens översikt: visar vad butikerna
 * beställt per veckodag och totalen som ska köpas in.
 */
export function PurchaseWeekCard() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);

  const start = useMemo(() => {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + weekOffset * 7);
    return m;
  }, [weekOffset]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [start],
  );

  const from = iso(days[0]);
  const to = iso(days[6]);

  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["purchase-week-card", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_order_lines")
        .select(
          "id, quantity_ordered, unit, delivery_date, order_date, products(name, unit), shop_orders(store_id, stores(name))",
        )
        .or(
          `and(delivery_date.gte.${from},delivery_date.lte.${to}),and(order_date.gte.${from},order_date.lte.${to})`,
        );
      if (error) throw error;
      return data as any[];
    },
  });

  const { rows, dayTotals, grandTotal, storeCount } = useMemo(() => {
    const map = new Map<string, Row>();
    const dayTotals = Array(7).fill(0) as number[];
    const storeSet = new Set<string>();

    for (const l of lines as any[]) {
      const date: string | null = l.delivery_date || l.order_date;
      if (!date || date < from || date > to) continue;
      const idx = days.findIndex((d) => iso(d) === date);
      if (idx < 0) continue;

      const name = l.products?.name || "Okänd produkt";
      const unit = l.unit || l.products?.unit || "kg";
      const qty = Number(l.quantity_ordered) || 0;
      const storeName = l.shop_orders?.stores?.name || "Okänd butik";
      storeSet.add(storeName);

      const key = `${name}__${unit}`;
      const row =
        map.get(key) ||
        ({ key, name, unit, perDay: Array(7).fill(0), total: 0, stores: {} } as Row);
      row.perDay[idx] += qty;
      row.total += qty;
      row.stores[storeName] = (row.stores[storeName] || 0) + qty;
      map.set(key, row);

      dayTotals[idx] += qty;
    }

    const rows = Array.from(map.values()).sort((a, b) => b.total - a.total);
    return {
      rows,
      dayTotals,
      grandTotal: rows.reduce((s, r) => s + r.total, 0),
      storeCount: storeSet.size,
    };
  }, [lines, days, from, to]);

  const todayIso = iso(new Date());

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-heading flex items-center gap-1.5">
            <ShoppingBasket className="h-4 w-4 text-primary" /> Inköp — veckoschema
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Föregående vecka">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="min-w-[112px] text-center text-xs font-medium tabular-nums text-muted-foreground">
              {days[0].toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} –{" "}
              {days[6].toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}
            </span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Nästa vecka">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {weekOffset !== 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setWeekOffset(0)}>
                Denna vecka
              </Button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Totallista på vad butikerna beställt och vad som ska köpas in. Klicka på en rad för fördelning per butik.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Hämtar beställningar…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Inga beställningar från butikerna denna vecka.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/60 text-[10px] uppercase text-muted-foreground">
                  <th className="py-1.5 pr-2 text-left font-medium">Produkt</th>
                  {days.map((d, i) => (
                    <th
                      key={i}
                      className={`px-1 py-1.5 text-right font-medium ${iso(d) === todayIso ? "text-primary" : ""}`}
                    >
                      {WEEKDAYS[i]} {d.getDate()}
                    </th>
                  ))}
                  <th className="pl-2 py-1.5 text-right font-semibold text-foreground">Totalt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.key}>
                    <tr
                      className="cursor-pointer border-b border-border/30 hover:bg-muted/40"
                      onClick={() => setExpanded(expanded === r.key ? null : r.key)}
                    >
                      <td className="py-1.5 pr-2">
                        <span className="font-medium text-foreground">{r.name}</span>
                        <span className="ml-1 text-[10px] text-muted-foreground">({r.unit})</span>
                      </td>
                      {r.perDay.map((q, i) => (
                        <td key={i} className="px-1 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {q ? fmt(q) : "–"}
                        </td>
                      ))}
                      <td className="pl-2 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
                        {fmt(r.total)}
                      </td>
                    </tr>
                    {expanded === r.key && (
                      <tr className="border-b border-border/30 bg-muted/20">
                        <td colSpan={9} className="px-2 py-2">
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(r.stores)
                              .sort((a, b) => b[1] - a[1])
                              .map(([store, qty]) => (
                                <Badge key={store} variant="outline" className="gap-1 text-[10px] font-normal">
                                  <Store className="h-3 w-3" /> {store}
                                  <span className="font-mono tabular-nums">
                                    {fmt(qty)} {r.unit}
                                  </span>
                                </Badge>
                              ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border text-xs">
                  <td className="py-1.5 pr-2 font-semibold text-foreground">
                    Summa ({rows.length} artiklar · {storeCount} butiker)
                  </td>
                  {dayTotals.map((q, i) => (
                    <td key={i} className="px-1 py-1.5 text-right font-mono font-semibold tabular-nums text-foreground">
                      {q ? fmt(q) : "–"}
                    </td>
                  ))}
                  <td className="pl-2 py-1.5 text-right font-mono font-bold tabular-nums text-primary">
                    {fmt(grandTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
