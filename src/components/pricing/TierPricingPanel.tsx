import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Search, Tags } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { effectiveCost } from "@/lib/effectiveCost";
import TierPriceSetter from "./TierPriceSetter";
import { usePriceTiers, useCurrentTierPrices, fmt } from "@/hooks/usePriceTiers";

/**
 * Grossistens prislista per priskategori. Varje produkt kan fällas ut och
 * prissättas för Göteborg/Väst, Stockholm och Schweiz.
 */
export default function TierPricingPanel() {
  const { data: products = [] } = useProducts();
  const { data: tiers = [] } = usePriceTiers();
  const productIds = useMemo(() => products.map((p: any) => p.id), [products]);
  const { data: current } = useCurrentTierPrices(productIds);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p: any) =>
            p.name?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q),
        )
      : products;
    return list.slice(0, 60);
  }, [products, search]);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <button className="flex w-full items-center justify-between" onClick={() => setOpen((v) => !v)}>
          <CardTitle className="flex items-center gap-2 text-sm font-heading">
            <Tags className="h-4 w-4 text-primary" /> Priser per priskategori
            <span className="text-[11px] font-normal text-muted-foreground">
              {tiers.map((t) => t.name).join(" · ")}
            </span>
          </CardTitle>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Sök produkt, SKU eller kategori…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="pb-1 text-left font-medium">Produkt</th>
                  <th className="pb-1 text-right font-medium">Inköp/kg</th>
                  {tiers.map((t) => (
                    <th key={t.id} className="pb-1 text-right font-medium">{t.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p: any) => {
                  const eff = effectiveCost(p);
                  const isOpen = expanded === p.id;
                  return (
                    <>
                      <tr
                        key={p.id}
                        className="cursor-pointer border-b border-border/50 hover:bg-muted/30"
                        onClick={() => setExpanded(isOpen ? null : p.id)}
                      >
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            <span className="font-medium text-foreground">{p.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                          {fmt(eff.value)} kr
                        </td>
                        {tiers.map((t) => {
                          const row = current?.get(`${p.id}:${t.id}`);
                          return (
                            <td key={t.id} className="py-1.5 text-right">
                              {row ? (
                                <span className="inline-flex items-center gap-1">
                                  <span className="font-mono tabular-nums text-foreground">
                                    {fmt(Number(row.price))} {row.currency}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] ${row.lock_mode === "locked" ? "border-success/40 text-success" : "text-muted-foreground"}`}
                                  >
                                    {row.lock_mode === "locked" ? "Låst" : "Cirka"}
                                  </Badge>
                                </span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                      {isOpen && (
                        <tr key={`${p.id}-edit`}>
                          <td colSpan={2 + tiers.length} className="py-2">
                            <TierPriceSetter product={p} />
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={2 + tiers.length} className="py-6 text-center text-muted-foreground">
                      Inga produkter hittades
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {products.length > filtered.length && !search && (
            <p className="text-[10px] text-muted-foreground">
              Visar {filtered.length} av {products.length} produkter — sök för att hitta fler.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
