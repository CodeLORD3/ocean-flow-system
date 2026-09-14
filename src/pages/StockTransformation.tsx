import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCw, Search } from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import TransformDialog from "@/components/inventory/TransformDialog";
import { useProducts } from "@/hooks/useProducts";
import { useAllStockByLocation } from "@/hooks/useStorageLocations";
import { useSite } from "@/contexts/SiteContext";
import { useStockTransformations } from "@/hooks/useStockTransformations";
import { transformKindLabel } from "@/lib/stockTransform";

/**
 * Omvandling: bildgalleri med produkter som har lagersaldo på enheten. Klick på
 * ett kort öppnar omvandlingsflödet. Andra fliken visar omvandlingshistoriken.
 */
export default function StockTransformation() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: products = [] } = useProducts();
  const { data: allStock = [] } = useAllStockByLocation();
  const { data: history = [], isLoading: historyLoading } = useStockTransformations(activeStoreId || null);

  const [tab, setTab] = useState<"omvandla" | "historik">("omvandla");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("alla");
  const [target, setTarget] = useState<{ id: string; name: string; sku?: string | null; unit?: string | null } | null>(
    null,
  );

  /** Saldo per produkt på enhetens lagerplatser. */
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allStock as any[]) {
      if (activeStoreId && s.storage_locations?.store_id !== activeStoreId) continue;
      map.set(s.product_id, (map.get(s.product_id) || 0) + Number(s.quantity || 0));
    }
    return map;
  }, [allStock, activeStoreId]);

  const cards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (stockByProduct.get(p.id) || 0) > 0)
      .filter((p) => category === "alla" || (p.category || "Övrigt") === category)
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [products, stockByProduct, category, search]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if ((stockByProduct.get(p.id) || 0) > 0) set.add(p.category || "Övrigt");
    return [...set].sort((a, b) => a.localeCompare(b, "sv"));
  }, [products, stockByProduct]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-lg sm:text-2xl font-heading font-bold">
          Omvandling {activeStoreName ? `— ${activeStoreName}` : ""}
        </h2>
        <p className="text-xs text-muted-foreground">
          Dela upp, packa om eller bearbeta en produkt till en annan — på samma lagerplats, med spårbarhet.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="omvandla" className="text-xs">
            Omvandla
          </TabsTrigger>
          <TabsTrigger value="historik" className="text-xs">
            Omvandlingshistorik
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "omvandla" ? (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök produkt"
              className="h-10 pl-8 text-xs"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              variant={category === "alla" ? "default" : "outline"}
              className="h-7 px-2 text-[11px]"
              onClick={() => setCategory("alla")}
            >
              Alla
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={category === c ? "default" : "outline"}
                className="h-7 px-2 text-[11px]"
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>

          {cards.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga produkter med lagersaldo att omvandla.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {cards.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTarget({ id: p.id, name: p.name, sku: p.sku, unit: p.unit })}
                  className="text-left"
                >
                  <Card className="h-full overflow-hidden transition-colors hover:border-primary/50">
                    <ProductThumb
                      src={(p as any).image_url}
                      alt={p.name}
                      static
                      className="h-28 w-full rounded-none border-0 sm:h-32"
                    />
                    <CardContent className="space-y-1 p-2">
                      <p className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</p>
                      <div className="flex items-center justify-between gap-1">
                        <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                          {(stockByProduct.get(p.id) || 0).toLocaleString("sv-SE")} {p.unit?.toLowerCase() || "kg"}
                        </Badge>
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : historyLoading ? (
        <p className="text-xs text-muted-foreground">Hämtar…</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga omvandlingar är gjorda ännu.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Datum</TableHead>
                <TableHead className="text-[11px]">Från</TableHead>
                <TableHead className="text-[11px]">Till</TableHead>
                <TableHead className="text-right text-[11px]">Utbyte</TableHead>
                <TableHead className="text-right text-[11px]">Svinn</TableHead>
                <TableHead className="text-[11px]">Typ</TableHead>
                <TableHead className="text-[11px]">Av</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="py-1.5 text-[11px] whitespace-nowrap">
                    {new Date(r.performed_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                    {r.storage_locations?.name ? (
                      <span className="block text-[10px] text-muted-foreground">{r.storage_locations.name}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">
                    {r.source?.name || "—"}
                    <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                      {Number(r.source_quantity).toLocaleString("sv-SE")} {r.source?.unit?.toLowerCase() || "kg"}
                      {r.source_lot?.lot_number ? ` · ${r.source_lot.lot_number}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">
                    {r.target?.name || "—"}
                    <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                      {Number(r.target_quantity).toLocaleString("sv-SE")} {r.target?.unit?.toLowerCase() || "kg"}
                      {r.target_packages ? ` · ${Number(r.target_packages)} förp.` : ""}
                      {r.target_lot?.lot_number ? ` · ${r.target_lot.lot_number}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                    {r.yield_pct != null ? `${Number(r.yield_pct).toLocaleString("sv-SE")} %` : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-right font-mono text-[11px] tabular-nums">
                    {Number(r.waste_quantity) > 0 ? Number(r.waste_quantity).toLocaleString("sv-SE") : "—"}
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">
                    <Badge variant="outline" className="text-[10px]">
                      {transformKindLabel(r.transform_kind)}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-1.5 text-[11px]">{r.performed_by_name || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <TransformDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        product={target}
        storeId={activeStoreId || null}
        onDone={() => setTarget(null)}
      />
    </motion.div>
  );
}
