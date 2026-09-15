import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart3, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProducts } from "@/hooks/useProducts";
import { effectiveCost } from "@/lib/effectiveCost";
import { usePriceTiers, useCurrentTierPrices, margin, fmt } from "@/hooks/usePriceTiers";

type GroupBy = "category" | "tier" | "supplier";

const GROUP_LABEL: Record<GroupBy, string> = {
  category: "Produktkategori",
  tier: "Priskategori",
  supplier: "Leverantör",
};

/** Vad grossisten tjänar per produktkategori, priskategori och leverantör. */
export default function TierMarginOverview() {
  const { data: products = [] } = useProducts();
  const { data: tiers = [] } = usePriceTiers();
  const productIds = useMemo(() => products.map((p: any) => p.id), [products]);
  const { data: current } = useCurrentTierPrices(productIds);
  const [open, setOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>("category");

  const rows = useMemo(() => {
    if (!current) return [];
    const acc = new Map<
      string,
      { key: string; products: number; sumCost: number; sumPrice: number; locked: number; estimated: number }
    >();
    for (const p of products as any[]) {
      const cost = effectiveCost(p).value;
      if (!(cost > 0)) continue;
      for (const t of tiers) {
        const row = current.get(`${p.id}:${t.id}`);
        if (!row) continue;
        const key =
          groupBy === "category"
            ? p.category || "Utan kategori"
            : groupBy === "tier"
              ? t.name
              : p.suppliers?.name || "Utan leverantör";
        const entry =
          acc.get(key) || { key, products: 0, sumCost: 0, sumPrice: 0, locked: 0, estimated: 0 };
        entry.products += 1;
        entry.sumCost += cost;
        entry.sumPrice += Number(row.price);
        if (row.lock_mode === "locked") entry.locked += 1;
        else entry.estimated += 1;
        acc.set(key, entry);
      }
    }
    return Array.from(acc.values())
      .map((e) => ({
        ...e,
        avgCost: e.sumCost / e.products,
        avgPrice: e.sumPrice / e.products,
        marginPct: margin(e.sumCost, e.sumPrice),
        grossPerKg: (e.sumPrice - e.sumCost) / e.products,
      }))
      .sort((a, b) => a.marginPct - b.marginPct);
  }, [products, tiers, current, groupBy]);

  const exportCsv = () => {
    const head = [GROUP_LABEL[groupBy], "Produkter", "Snitt inköp", "Snitt pris", "Vinst/kg", "Marginal %"];
    const body = rows.map((r) => [
      r.key,
      r.products,
      r.avgCost.toFixed(2),
      r.avgPrice.toFixed(2),
      r.grossPerKg.toFixed(2),
      r.marginPct.toFixed(1),
    ]);
    const csv = [head, ...body].map((l) => l.join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `marginaler-${groupBy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <button className="flex w-full items-center justify-between" onClick={() => setOpen((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-sm font-heading">
            <BarChart3 className="h-4 w-4 text-primary" /> Marginalöversikt
            <span className="text-[11px] font-normal text-muted-foreground">sämsta marginal först</span>
          </CardTitle>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
              <Button
                key={g}
                size="sm"
                variant={groupBy === g ? "secondary" : "ghost"}
                className="h-7 text-[11px]"
                onClick={() => setGroupBy(g)}
              >
                {GROUP_LABEL[g]}
              </Button>
            ))}
            <Button size="sm" variant="outline" className="ml-auto h-7 text-[11px]" onClick={exportCsv} disabled={!rows.length}>
              Exportera CSV
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-1 text-left font-medium">{GROUP_LABEL[groupBy]}</th>
                  <th className="pb-1 text-right font-medium">Priser</th>
                  <th className="pb-1 text-right font-medium">Snitt inköp</th>
                  <th className="pb-1 text-right font-medium">Snitt pris</th>
                  <th className="pb-1 text-right font-medium">Vinst/kg</th>
                  <th className="pb-1 text-right font-medium">Marginal</th>
                  <th className="pb-1 text-right font-medium">Låsta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 font-medium text-foreground">{r.key}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">{r.products}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmt(r.avgCost)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmt(r.avgPrice)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmt(r.grossPerKg)}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-mono tabular-nums font-medium",
                        r.marginPct >= 20 ? "text-success" : r.marginPct > 0 ? "text-warning" : "text-destructive",
                      )}
                    >
                      {fmt(r.marginPct, 1)} %
                    </td>
                    <td className="py-1.5 text-right">
                      <Badge variant="outline" className="text-[9px]">
                        {r.locked} låsta · {r.estimated} cirka
                      </Badge>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      Inga priser satta per priskategori ännu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
