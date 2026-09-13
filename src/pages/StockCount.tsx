import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardCheck, Lock, Printer, Download, Search, Plus, Package, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStores } from "@/hooks/useStores";
import { useProducts } from "@/hooks/useProducts";
import { useStorageLocations, useAllStockByLocation } from "@/hooks/useStorageLocations";
import { useSite } from "@/contexts/SiteContext";
import { laggTillSvenskaDagar } from "@/lib/swedishTime";
import {
  generateInventoryCountListPdf,
  type CountListProduct,
} from "@/lib/inventoryCountListPdf";


type Quality = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "7+";

const QUALITY_DAYS: Quality[] = ["1", "2", "3", "4", "5", "6", "7", "7+"];

const todayStockholm = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

const collator = new Intl.Collator("sv");

const unitOf = (unit?: string | null) => {
  const u = String(unit ?? "kg").toLowerCase().trim();
  return ["st", "stk", "styck", "pcs"].includes(u) ? "st" : u || "kg";
};

const fmtQty = (n: number, unit: string) =>
  `${n.toLocaleString("sv-SE", { maximumFractionDigits: unit === "st" ? 0 : 1 })} ${unit}`;

/** Håller tills: inventeringsdatum + valt antal dagar. */
const holdsUntil = (countDate: string, days: string | null) => {
  if (days === "7+") return null;
  const n = Number(days);
  if (!countDate || !Number.isFinite(n) || n <= 0) return null;
  return laggTillSvenskaDagar(countDate, n);
};

const qualityClass = (q?: string | null) => {
  if (q === "7+") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return "bg-muted text-muted-foreground border-border";
  if (n <= 2) return "bg-destructive/15 text-destructive border-destructive/30";
  if (n <= 4) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-700 border-emerald-500/30";
};


type Row = {
  key: string;
  productId: string;
  locationId: string;
  productName: string;
  sku: string | null;
  unit: string;
  category: string;
  imageUrl: string | null;
  locationName: string;
  systemQty: number;
};

/** FAS 2 — Digital inventering. Ett tillfälle per butik + datum, status öppen/låst. */
export default function StockCount() {
  const { activeStoreId, activeStoreName } = useSite();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const { data: allStock = [], isLoading: stockLoading } = useAllStockByLocation();

  const [storeId, setStoreId] = useState<string>(activeStoreId ?? "");
  const effectiveStoreId = storeId || activeStoreId || "";
  const { data: locations = [] } = useStorageLocations(effectiveStoreId || undefined);

  const [date, setDate] = useState<string>(todayStockholm());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const storeName =
    (stores as any[]).find((s: any) => s.id === effectiveStoreId)?.name || activeStoreName || "";

  // ── Tillfället ─────────────────────────────────────────────────────────────
  const sessionQuery = useQuery({
    queryKey: ["stock_count_session", effectiveStoreId, date],
    enabled: !!effectiveStoreId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_sessions")
        .select("*")
        .eq("store_id", effectiveStoreId)
        .eq("count_date", date)
        .maybeSingle();
      if (error) throw error;
      return data as any | null;
    },
  });
  const session = sessionQuery.data;
  const locked = session?.status === "locked";

  const linesQuery = useQuery({
    queryKey: ["stock_count_lines", session?.id],
    enabled: !!session?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_lines")
        .select("*")
        .eq("session_id", session!.id);
      if (error) throw error;
      return data as any[];
    },
  });
  const linesByKey = useMemo(() => {
    const m = new Map<string, any>();
    (linesQuery.data ?? []).forEach((l: any) => m.set(`${l.product_id}|${l.location_id ?? ""}`, l));
    return m;
  }, [linesQuery.data]);

  const createSession = useCallback(async () => {
    if (!effectiveStoreId) return;
    const { error } = await supabase.from("stock_count_sessions").insert({
      store_id: effectiveStoreId,
      count_date: date,
      started_at: new Date().toISOString(),
    } as any);
    if (error) {
      toast({ title: "Kunde inte skapa inventeringen", description: error.message, variant: "destructive" });
      return;
    }
    await sessionQuery.refetch();
    toast({ title: "Inventering påbörjad", description: `${storeName} — ${date}` });
  }, [effectiveStoreId, date, sessionQuery, storeName, toast]);

  // ── Rader ──────────────────────────────────────────────────────────────────
  const productsById = useMemo(() => {
    const m = new Map<string, any>();
    (products as any[]).forEach((p: any) => m.set(p.id, p));
    return m;
  }, [products]);

  const allRows = useMemo<Row[]>(() => {
    if (!effectiveStoreId) return [];
    const locIds = new Map<string, string>();
    (locations as any[]).forEach((l: any) => locIds.set(l.id, l.name || "Lager"));
    const seen = new Set<string>();
    const rows: Row[] = [];
    (allStock as any[]).forEach((s: any) => {
      if (!s.product_id || !locIds.has(s.location_id)) return;
      const p = productsById.get(s.product_id);
      if (!p || p.is_active === false) return;
      const key = `${s.product_id}|${s.location_id}`;
      const unit = unitOf(p.unit);
      if (seen.has(key)) {
        const existing = rows.find((r) => r.key === key);
        if (existing) existing.systemQty += Number(s.quantity) || 0;
        return;
      }
      seen.add(key);
      rows.push({
        key,
        productId: s.product_id,
        locationId: s.location_id,
        productName: p.name || "—",
        sku: p.sku ?? null,
        unit,
        category: p.category || "Övrigt",
        imageUrl: p.image_url ?? null,
        locationName: locIds.get(s.location_id) || "Lager",
        systemQty: Number(s.quantity) || 0,
      });
    });
    rows.sort(
      (a, b) =>
        collator.compare(a.category, b.category) ||
        collator.compare(a.productName, b.productName) ||
        collator.compare(a.locationName, b.locationName),
    );
    return rows;
  }, [allStock, locations, productsById, effectiveStoreId]);

  const categories = useMemo(
    () => [...new Set(allRows.map((r) => r.category))].sort(collator.compare),
    [allRows],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((r) => {
      if (category !== "all" && r.category !== category) return false;
      if (q && !(r.productName.toLowerCase().includes(q) || (r.sku ?? "").toLowerCase().includes(q)))
        return false;
      if (onlyUncounted) {
        const line = linesByKey.get(r.key);
        if (line && line.counted_qty !== null && line.counted_qty !== undefined) return false;
      }
      return true;
    });
  }, [allRows, category, search, onlyUncounted, linesByKey]);

  // Gruppering: kategori → produkt (en rad per lagerplats + Totalt-rad)
  const groups = useMemo(() => {
    const byCat = new Map<string, Map<string, Row[]>>();
    rows.forEach((r) => {
      if (!byCat.has(r.category)) byCat.set(r.category, new Map());
      const byProduct = byCat.get(r.category)!;
      if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
      byProduct.get(r.productId)!.push(r);
    });
    return [...byCat.entries()].map(([cat, byProduct]) => ({
      category: cat,
      products: [...byProduct.values()],
    }));
  }, [rows]);

  const countedCount = useMemo(
    () =>
      rows.filter((r) => {
        const l = linesByKey.get(r.key);
        return l && l.counted_qty !== null && l.counted_qty !== undefined;
      }).length,
    [rows, linesByKey],
  );

  // ── Spara rad ──────────────────────────────────────────────────────────────
  const saveLine = useCallback(
    async (row: Row, patch: { counted_qty?: number | null; quality?: Quality | null; comment?: string | null }) => {
      if (!session?.id || locked) return;
      const { error } = await supabase.from("stock_count_lines").upsert(
        {
          session_id: session.id,
          product_id: row.productId,
          location_id: row.locationId,
          unit: row.unit,
          system_qty: row.systemQty,
          counted_at: new Date().toISOString(),
          ...patch,
        } as any,
        { onConflict: "session_id,product_id,location_id" },
      );
      if (error) {
        toast({ title: "Kunde inte spara", description: error.message, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["stock_count_lines", session.id] });
    },
    [session?.id, locked, qc, toast],
  );

  const lockSession = useCallback(async () => {
    if (!session?.id) return;
    const { error } = await supabase
      .from("stock_count_sessions")
      .update({
        status: "locked",
        locked_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      } as any)
      .eq("id", session.id);
    setLockOpen(false);
    if (error) {
      toast({ title: "Kunde inte låsa", description: error.message, variant: "destructive" });
      return;
    }
    await sessionQuery.refetch();
    toast({ title: "Inventeringen är låst", description: "Raderna kan inte längre ändras." });
  }, [session?.id, sessionQuery, toast]);

  // ── Export / print ─────────────────────────────────────────────────────────
  const exportCsv = useCallback(() => {
    const header = ["Kategori", "Produkt", "SKU", "Lagerplats", "Enhet", "Systemsaldo", "Inventerat", "Hållbarhet", "Kommentar"];
    const lines = rows.map((r) => {
      const l = linesByKey.get(r.key);
      return [
        r.category,
        r.productName,
        r.sku ?? "",
        r.locationName,
        r.unit,
        String(r.systemQty).replace(".", ","),
        l?.counted_qty != null ? String(l.counted_qty).replace(".", ",") : "",
        l?.quality ?? "",
        (l?.comment ?? "").replace(/[\r\n;]+/g, " "),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";");
    });
    const blob = new Blob(["\uFEFF" + [header.join(";"), ...lines].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inventering_${storeName || "butik"}_${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rows, linesByKey, storeName, date]);

  const printProducts = useMemo<CountListProduct[]>(() => {
    const seen = new Set<string>();
    const list: CountListProduct[] = [];
    rows.forEach((r) => {
      if (seen.has(r.productId)) return;
      seen.add(r.productId);
      list.push({
        id: r.productId,
        name: r.productName,
        unit: r.unit,
        category: r.category,
        sku: r.sku,
        imageUrl: r.imageUrl,
      });
    });
    return list;
  }, [rows]);

  const openPrintDialog = useCallback(() => {
    if (!printProducts.length) {
      toast({ title: "Inga produkter att skriva ut", variant: "destructive" });
      return;
    }
    setPrintOpen(true);
  }, [printProducts, toast]);

  const loading = stockLoading || sessionQuery.isLoading;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 sm:space-y-2.5">
      {/* Rubrik + åtgärder */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-heading font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Inventering {storeName ? `— ${storeName}` : ""}
          </h2>

          <p className="text-xs text-muted-foreground">
            Ett tillfälle per butik och datum. Räkna per lagerplats, lås när allt är klart.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!session && effectiveStoreId && (
            <Button size="sm" className="gap-1.5 text-xs h-9 sm:h-8 font-semibold" onClick={createSession}>
              <Plus className="h-3.5 w-3.5" /> Påbörja inventering
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9 sm:h-8" onClick={openPrintDialog}>
            <Printer className="h-3 w-3" /> Skriv ut
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9 sm:h-8" onClick={exportCsv}>
            <Download className="h-3 w-3" /> Exportera
          </Button>
          {session && !locked && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-9 sm:h-8 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
              onClick={() => setLockOpen(true)}
            >
              <Lock className="h-3 w-3" /> Lås inventeringen
            </Button>
          )}
        </div>
      </div>

      {/* Filter */}
      <Card>
        <CardContent className="p-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Butik</Label>
            <Select value={effectiveStoreId} onValueChange={setStoreId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Välj butik" />
              </SelectTrigger>
              <SelectContent>
                {(stores as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Datum</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Kategori</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Alla kategorier
                </SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sök</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Namn eller SKU"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 pb-1">
            <Label className="text-xs">Endast ej räknade</Label>
            <Switch checked={onlyUncounted} onCheckedChange={setOnlyUncounted} />
          </div>
        </CardContent>
      </Card>

      {/* Status */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        {session ? (
          <Badge
            variant="outline"
            className={locked ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"}
          >
            {locked ? "Låst" : "Öppen"}
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Ingen inventering för datumet
          </Badge>
        )}
        <span className="text-muted-foreground">
          {countedCount} av {rows.length} rader räknade
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1"
          onClick={() => {
            sessionQuery.refetch();
            linesQuery.refetch();
          }}
        >
          <RefreshCw className="h-3 w-3" /> Uppdatera
        </Button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Inga produkter i butikens lager matchar filtret.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <Card key={g.category} className="overflow-hidden">
              <div className="px-2 py-1 bg-muted/50 border-b flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide">{g.category}</span>
                <span className="text-[10px] text-muted-foreground">{g.products.length} produkter</span>
              </div>
              <CardContent className="p-0 divide-y divide-border/60">
                {g.products.map((prodRows) => {
                  const first = prodRows[0];
                  const countedTotal = prodRows.reduce((sum, r) => {
                    const l = linesByKey.get(r.key);
                    return sum + (l?.counted_qty != null ? Number(l.counted_qty) : 0);
                  }, 0);
                  const anyCounted = prodRows.some((r) => linesByKey.get(r.key)?.counted_qty != null);
                  return (
                    <div key={first.productId} className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        {first.imageUrl ? (
                          <img
                            src={first.imageUrl}
                            alt={first.productName}
                            className="h-6 w-6 rounded object-cover border shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded border bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-xs font-medium truncate">{first.productName}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {first.sku ? `${first.sku} · ` : ""}
                          {first.unit}
                        </span>
                        {prodRows.length > 1 && anyCounted && (
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] py-0 h-5 font-mono tabular-nums"
                          >
                            Totalt {fmtQty(countedTotal, first.unit)}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-0.5 space-y-0.5">
                        {prodRows.map((r) => {
                          const line = linesByKey.get(r.key);
                          const quality = (line?.quality ?? "") as string;
                          const until = holdsUntil(date, quality || null);
                          return (
                            <div
                              key={r.key}
                              className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_96px_170px_minmax(0,1fr)] gap-1.5 items-center"
                            >
                              <div className="text-[11px] text-muted-foreground truncate pl-7">
                                {r.locationName}
                                <span className="ml-1 font-mono tabular-nums">
                                  ({fmtQty(r.systemQty, r.unit)})
                                </span>
                              </div>
                              <Input
                                type="number"
                                inputMode="decimal"
                                step="any"
                                disabled={locked || !session}
                                defaultValue={line?.counted_qty ?? ""}
                                placeholder="Antal"
                                className="h-7 px-2 text-xs font-mono tabular-nums"
                                onBlur={(e) => {
                                  const raw = e.target.value.replace(",", ".").trim();
                                  const val = raw === "" ? null : Number(raw);
                                  if (val !== null && Number.isNaN(val)) return;
                                  if ((line?.counted_qty ?? null) === val) return;
                                  saveLine(r, { counted_qty: val });
                                }}
                              />
                              <div className="flex items-center gap-1 min-w-0">
                                <select
                                  disabled={locked || !session}
                                  value={quality}
                                  onChange={(e) =>
                                    saveLine(r, {
                                      quality: (e.target.value || null) as Quality | null,
                                    })
                                  }
                                  className={`h-7 rounded-md border px-1.5 text-[11px] font-medium disabled:opacity-50 ${qualityClass(quality)}`}
                                  title="Hållbarhet i dagar från inventeringsdatumet"
                                >
                                   <option value="">Hållbarhet</option>
                                   {QUALITY_DAYS.map((d) => (
                                     <option key={d} value={d}>
                                       {d} {d === "1" ? "dag" : "dagar"}
                                     </option>
                                   ))}
                                </select>
                                {until && (
                                  <span className="text-[10px] text-muted-foreground font-mono tabular-nums truncate">
                                    t.o.m. {until.slice(5)}
                                  </span>
                                )}
                              </div>
                              <Input
                                disabled={locked || !session}
                                defaultValue={line?.comment ?? ""}
                                placeholder="Kommentar"
                                className="h-7 px-2 text-xs"
                                onBlur={(e) => {
                                  const val = e.target.value.trim() || null;
                                  if ((line?.comment ?? null) === val) return;
                                  saveLine(r, { comment: val });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}

        </div>
      )}

      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lås inventeringen?</DialogTitle>
            <DialogDescription>
              {storeName} — {date}. {countedCount} av {rows.length} rader är räknade. Efter låsning kan
              raderna inte ändras.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLockOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={lockSession} className="gap-1.5">
              <Lock className="h-3.5 w-3.5" /> Lås
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
