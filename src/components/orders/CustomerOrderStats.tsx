import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import { ORDER_TYPE_LABELS } from "@/lib/customerOrders";

const nf = (v: unknown, d = 0) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Statistik över kundbeställningar: antal, belopp, mest sålda varor och
 * hur ofta vägd vikt avviker från beställd. Underlag för inköpsplaneringen.
 */
export function CustomerOrderStats({ storeId }: { storeId?: string | null }) {
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const [from, setFrom] = useState(iso(start));
  const [to, setTo] = useState(iso(new Date()));
  const [customerType, setCustomerType] = useState<"all" | "company" | "private">("all");

  const { data: allOrders = [], isLoading } = useCustomerOrders({
    storeId: storeId ?? undefined,
    fromDate: from,
    toDate: to,
  });

  const orders = useMemo(
    () =>
      allOrders.filter((o) =>
        customerType === "all"
          ? true
          : customerType === "company"
            ? !!o.customers_retail?.is_company
            : !o.customers_retail?.is_company,
      ),
    [allOrders, customerType],
  );

  const stats = useMemo(() => {
    const live = orders.filter((o) => o.status !== "avbruten");
    const cancelled = orders.length - live.length;
    const companyOrders = live.filter((o) => o.customers_retail?.is_company).length;
    const companyValue = live
      .filter((o) => o.customers_retail?.is_company)
      .reduce((s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0), 0);
    const privateValue = live
      .filter((o) => !o.customers_retail?.is_company)
      .reduce((s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0), 0);

    const estimated = live.reduce((s, o) => s + Number(o.estimated_total || 0), 0);
    const actual = live.reduce((s, o) => s + Number(o.total_incl_vat || 0), 0);

    const byType = new Map<string, number>();
    const byProduct = new Map<string, { qty: number; value: number; count: number }>();
    let catering = 0;
    let packedLines = 0;
    let deviating = 0;

    for (const o of live) {
      byType.set(o.order_type, (byType.get(o.order_type) || 0) + 1);
      if (o.category === "catering") catering += 1;
      for (const l of o.customer_order_lines || []) {
        if (l.pack_status === "struken") continue;
        const name = l.is_free_text ? l.free_text_name || "Fritextrad" : l.products?.name || "Produkt";
        const prev = byProduct.get(name) || { qty: 0, value: 0, count: 0 };
        const qty = Number(l.quantity_packed ?? l.quantity_ordered ?? 0);
        prev.qty += qty;
        prev.value += Number(l.line_total ?? qty * Number(l.estimated_price_per_unit || 0));
        prev.count += 1;
        byProduct.set(name, prev);
        if (l.quantity_packed != null && Number(l.quantity_ordered) > 0) {
          packedLines += 1;
          const diff =
            Math.abs(Number(l.quantity_packed) - Number(l.quantity_ordered)) /
            Number(l.quantity_ordered);
          if (diff > 0.2) deviating += 1;
        }
      }
    }

    return {
      count: live.length,
      cancelled,
      catering,
      estimated,
      actual,
      byType: Array.from(byType.entries()),
      top: Array.from(byProduct.entries())
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 12),
      packedLines,
      deviating,
    };
  }, [orders]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Från</Label>
          <Input
            type="date"
            className="h-12 w-[160px]"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label className="text-xs">Till</Label>
          <Input
            type="date"
            className="h-12 w-[160px]"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Räknar…</p>
      ) : orders.length === 0 ? (
        <EmptyState
          title="Ingen statistik än"
          description="När kundbeställningar registreras visas antal, belopp och mest sålda varor för perioden här."
          icon={<BarChart3 className="h-8 w-8" />}
        />
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Order", value: nf(stats.count), sub: `${nf(stats.cancelled)} avbrutna` },
              {
                label: "Uppskattat belopp",
                value: `${nf(stats.estimated)} kr`,
                sub: "vid registrering",
              },
              {
                label: "Verkligt belopp",
                value: `${nf(stats.actual)} kr`,
                sub: "packat och prissatt",
              },
              {
                label: "Vikt avviker över 20 %",
                value: `${nf(stats.deviating)}`,
                sub: `av ${nf(stats.packedLines)} vägda rader`,
              },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="font-mono text-lg tabular-nums">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Fördelning</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {stats.byType.map(([t, n]) => (
                  <div key={t} className="flex justify-between">
                    <span>{ORDER_TYPE_LABELS[t as "leverans" | "upphamtning"] || t}</span>
                    <span className="font-mono tabular-nums">{nf(n)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1">
                  <span>Catering</span>
                  <span className="font-mono tabular-nums">{nf(stats.catering)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mest sålda varor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {stats.top.map(([name, v]) => (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{name}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {nf(v.qty, 1)} kg · {nf(v.value)} kr
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
