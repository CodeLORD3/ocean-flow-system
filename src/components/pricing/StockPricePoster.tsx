import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, FileDown, LayoutTemplate, Search } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useStoreStockByProduct } from "@/hooks/useTotalListStock";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { generatePricePosterPdf, formatPosterPrice, type PosterSection } from "@/lib/pricePosterPdf";

interface ProductInfo {
  id: string;
  name: string;
  unit: string | null;
  category: string | null;
  retail_suggested: number | null;
  wholesale_price: number | null;
}

const unitLabel = (unit: string | null) => {
  const u = (unit || "kg").toLowerCase();
  if (u.startsWith("st")) return "kr/st";
  if (u.startsWith("l")) return "kr/l";
  return "kr/kg";
};

/**
 * Affischprislista för butiken: hämtar det som faktiskt finns i butikens lager,
 * låter personalen justera priser och skriva ut en tavla i samma stil som de
 * handskrivna prislistorna.
 */
export default function StockPricePoster() {
  const { activeStoreId, activeStoreName } = useSite();
  const { toast } = useToast();
  const { data: stock = [], isLoading } = useStoreStockByProduct(activeStoreId);

  const { data: products = [] } = useQuery({
    queryKey: ["poster_products"],
    queryFn: async (): Promise<ProductInfo[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, category, retail_suggested, wholesale_price")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const [title, setTitle] = useState("Fisk & Skaldjur");
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const info = new Map(products.map((p) => [p.id, p]));
    return stock
      .filter((s) => s.productId && s.quantity > 0)
      .map((s) => {
        const p = info.get(s.productId as string);
        return {
          id: s.productId as string,
          name: p?.name || s.name,
          unit: p?.unit ?? s.unit,
          category: p?.category || "Övrigt",
          quantity: s.quantity,
          suggested: Number(p?.retail_suggested || p?.wholesale_price || 0),
        };
      })
      .sort((a, b) => a.category.localeCompare(b.category, "sv") || a.name.localeCompare(b.name, "sv"));
  }, [stock, products]);

  useEffect(() => {
    setPrices((prev) => {
      const next = { ...prev };
      for (const r of rows) if (next[r.id] == null) next[r.id] = r.suggested;
      return next;
    });
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.category || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const sections: PosterSection[] = useMemo(() => {
    const map = new Map<string, PosterSection>();
    for (const r of rows) {
      if (excluded[r.id]) continue;
      const price = Number(prices[r.id] || 0);
      if (price <= 0) continue;
      const key = r.category || "Övrigt";
      const section = map.get(key) ?? { title: key, rows: [] };
      section.rows.push({ name: r.name, price, unitLabel: unitLabel(r.unit) });
      map.set(key, section);
    }
    return [...map.values()];
  }, [rows, prices, excluded]);

  const totalRows = sections.reduce((s, x) => s + x.rows.length, 0);

  const download = () => {
    if (!totalRows) {
      toast({ title: "Inga produkter med pris", description: "Sätt pris på minst en vara.", variant: "destructive" });
      return;
    }
    generatePricePosterPdf({
      title,
      subtitle: activeStoreName,
      sections,
      dateStr: format(new Date(), "yyyy-MM-dd"),
      footer: activeStoreName,
    });
    toast({ title: "Affisch skapad", description: `${totalRows} varor` });
  };

  const print = () => window.print();

  if (!activeStoreId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Prislista att sätta upp</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Välj en butik för att skapa en prislista ur lagret.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex flex-wrap items-center gap-2">
          <LayoutTemplate className="h-5 w-5 text-primary" />
          Prislista att sätta upp
          <Badge variant="outline">{totalRows} varor</Badge>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={print}>
              <Printer className="h-3.5 w-3.5" /> Skriv ut
            </Button>
            <Button size="sm" className="gap-1.5" onClick={download}>
              <FileDown className="h-3.5 w-3.5" /> PDF
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 max-w-xs"
            placeholder="Rubrik på prislistan"
          />
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
              placeholder="Sök vara eller kategori"
            />
          </div>
        </div>

        {/* Val och priser */}
        <div className="border rounded-md divide-y print:hidden max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-3">Laddar lagret…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3">
              Inget i lagret just nu — gör en inventeringsrapport först.
            </p>
          ) : (
            visible.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  checked={!excluded[r.id]}
                  onCheckedChange={(v) => setExcluded((p) => ({ ...p, [r.id]: !v }))}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.category} · {r.quantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {r.unit || "kg"} i lager
                  </div>
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={prices[r.id] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [r.id]: Number(e.target.value) }))}
                  className="h-8 w-24 text-right tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground w-12">{unitLabel(r.unit)}</span>
              </div>
            ))
          )}
        </div>

        {/* Förhandsgranskning i affischform */}
        <div className="rounded-md border bg-background p-6 print:border-0 print:p-0">
          <h2 className="text-center text-3xl font-black tracking-tight text-primary uppercase">{title}</h2>
          <div className="mx-auto mt-1 h-1 w-40 rounded bg-primary/60" />
          {activeStoreName && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{activeStoreName}</p>
          )}
          <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {sections.map((s) => (
              <div key={s.title}>
                <h3 className="text-xl font-black uppercase text-primary">{s.title}</h3>
                <div className="mt-1 h-0.5 w-24 bg-primary/50" />
                <ul className="mt-2">
                  {s.rows.map((row) => (
                    <li
                      key={row.name}
                      className="flex items-baseline gap-2 border-b border-primary/20 py-1.5"
                    >
                      <span className="flex-1 truncate text-sm">{row.name}</span>
                      <span className="font-mono text-lg font-bold tabular-nums text-destructive">
                        {formatPosterPrice(row.price)}
                      </span>
                      <span className="w-11 text-[10px] text-muted-foreground">{row.unitLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {totalRows === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Ingen vara med pris vald ännu.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
