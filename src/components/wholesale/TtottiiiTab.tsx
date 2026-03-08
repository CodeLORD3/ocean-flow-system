import { useMemo, useState } from "react";
import { BarChart3, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useCategories } from "@/hooks/useCategories";

const DEFAULT_CATEGORIES = ["Färsk Fisk", "Skaldjur", "Varmkök", "Rökta Produkter", "Såser & Röror", "Frukt & Grönt"];

export default function TtottiiiTab() {
  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const { data: dbCategories = [] } = useCategories();
  const [filterCategory, setFilterCategory] = useState<string>("all");

  const CATEGORIES = dbCategories.length > 0 ? dbCategories.map(c => c.name) : DEFAULT_CATEGORIES;
  const retailStores = stores.filter(s => !s.is_wholesale);

  // Aggregate: per product, sum quantity_ordered per store
  const aggregated = useMemo(() => {
    const map = new Map<string, {
      name: string;
      unit: string;
      category: string;
      byStore: Record<string, number>;
      total: number;
    }>();

    for (const order of orders.filter((o: any) => o.status !== "Arkiverad")) {
      const storeId = (order as any).store_id;
      for (const line of ((order as any).shop_order_lines || [])) {
        const pName = line.products?.name || "Okänd";
        const key = pName;
        if (!map.has(key)) {
          map.set(key, {
            name: pName,
            unit: line.unit || line.products?.unit || "ST",
            category: line.category_section || line.products?.category || "",
            byStore: {},
            total: 0,
          });
        }
        const entry = map.get(key)!;
        entry.byStore[storeId] = (entry.byStore[storeId] || 0) + Number(line.quantity_ordered);
        entry.total += Number(line.quantity_ordered);
      }
    }

    return Array.from(map.values());
  }, [orders]);

  const grandTotal = aggregated.reduce((s, a) => s + a.total, 0);

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-heading">TTOTTIII — Total produktionsöversikt</CardTitle>
              <CardDescription className="text-xs">Summering av alla butikers beställningar — uppdateras automatiskt</CardDescription>
            </div>
          </div>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <ArrowUpDown className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Alla kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {CATEGORIES.map(cat => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {aggregated.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">Inga beställningar att summera ännu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">PRODUKT</th>
                  {retailStores.map(s => (
                    <th key={s.id} className="pb-2 text-right font-medium text-muted-foreground uppercase text-[10px]">{s.name?.split(" ").pop()}</th>
                  ))}
                  <th className="pb-2 text-right font-bold text-primary">TOTAL</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">ENHET</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">KATEGORI</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => {
                  const catItems = aggregated.filter(a => a.category === cat);
                  if (catItems.length === 0) return null;
                  return (
                    <> 
                      <tr key={cat}><td colSpan={retailStores.length + 4} className="pt-3 pb-1 text-[10px] font-bold text-muted-foreground">▸ {cat}</td></tr>
                      {catItems.map(item => (
                        <tr key={item.name} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-1.5 font-medium text-foreground">{item.name}</td>
                          {retailStores.map(s => (
                            <td key={s.id} className="py-1.5 text-right text-muted-foreground">
                              {item.byStore[s.id] ? item.byStore[s.id] : <span className="text-muted-foreground/40">0</span>}
                            </td>
                          ))}
                          <td className="py-1.5 text-right font-bold text-primary">{item.total}</td>
                          <td className="py-1.5 text-muted-foreground">{item.unit}</td>
                          <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{item.category}</Badge></td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td className="py-2 font-bold text-foreground">TOTALT ALLA PRODUKTER</td>
                  {retailStores.map(s => {
                    const storeTotal = aggregated.reduce((sum, a) => sum + (a.byStore[s.id] || 0), 0);
                    return <td key={s.id} className="py-2 text-right font-bold text-foreground">{storeTotal}</td>;
                  })}
                  <td className="py-2 text-right font-bold text-primary text-base">{grandTotal}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
