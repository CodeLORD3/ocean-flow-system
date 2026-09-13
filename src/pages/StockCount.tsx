import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardCheck, Lock, Printer, Download, Search, Plus, Package, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
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
import { type CountListProduct } from "@/lib/inventoryCountListPdf";
import CountListPrintDialog from "@/components/inventory/CountListPrintDialog";
import { setBalance } from "@/lib/stockLedger";


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

/** "ons 17/9" — veckodag + dag/månad, svensk tid. */
const dayLabel = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = new Intl.DateTimeFormat("sv-SE", { weekday: "short", timeZone: "Europe/Stockholm" })
    .format(d)
    .replace(".", "");
  return `${wd} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
};

/** "13/9 kl 10:24" — svensk tid för låsningstidpunkt. */
const stampLabel = (iso?: string | null) => {
  if (!iso) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date(iso))
    .replace(",", " kl");
};

/** Veckodag med versal, t.ex. "Fredag". */
const weekdayLong = (iso: string) => {
  if (!iso) return "";
  const wd = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "Europe/Stockholm" })
    .format(new Date(`${iso}T12:00:00Z`));
  return wd.charAt(0).toUpperCase() + wd.slice(1);
};

/** Antal hela dagar mellan två datum. */
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000,
  );

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
  costPrice: number;
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCategory = useCallback((cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }, []);

  const storeName =
    (stores as any[]).find((s: any) => s.id === effectiveStoreId)?.name || activeStoreName || "";

  // ── Tillfällen för dagen (flera inventeringar per dag är tillåtet) ─────────
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ["stock_count_sessions", effectiveStoreId, date],
    enabled: !!effectiveStoreId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_sessions")
        .select("*")
        .eq("store_id", effectiveStoreId)
        .eq("count_date", date)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const daySessions = sessionQuery.data ?? [];
  const session =
    daySessions.find((s: any) => s.id === selectedSessionId) ??
    daySessions.find((s: any) => s.status === "open") ??
    daySessions[daySessions.length - 1] ??
    null;
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

  // ── Historik: alla låsta inventeringar för butiken ─────────────────────────
  const historyQuery = useQuery({
    queryKey: ["stock_count_history", effectiveStoreId],
    enabled: !!effectiveStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_sessions")
        .select("id,count_date,status,label,locked_at,finished_at,stock_count_lines(count)")
        .eq("store_id", effectiveStoreId)
        .eq("status", "locked")
        .order("count_date", { ascending: false })
        .order("locked_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  /** Klockslag som namn på tillfället, t.ex. "10:42". */
  const clockNow = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

  const createSessionFor = useCallback(
    async (targetDate: string) => {
      if (!effectiveStoreId) return;
      const { data: existing } = await supabase
        .from("stock_count_sessions")
        .select("id,status")
        .eq("store_id", effectiveStoreId)
        .eq("count_date", targetDate)
        .eq("status", "open")
        .maybeSingle();
      setDate(targetDate);
      if (existing) {
        setSelectedSessionId((existing as any).id);
        await sessionQuery.refetch();
        toast({
          title: "En inventering är redan öppen",
          description: `Lås den först — ${storeName} ${targetDate}`,
        });
        return;
      }
      const { data: created, error } = await supabase
        .from("stock_count_sessions")
        .insert({
          store_id: effectiveStoreId,
          count_date: targetDate,
          started_at: new Date().toISOString(),
          label: clockNow(),
        } as any)
        .select("id")
        .maybeSingle();
      if (error) {
        toast({ title: "Kunde inte skapa inventeringen", description: error.message, variant: "destructive" });
        return;
      }
      if (created) setSelectedSessionId((created as any).id);
      await sessionQuery.refetch();
      toast({ title: "Ny inventering påbörjad", description: `${storeName} — ${targetDate}` });
    },
    [effectiveStoreId, sessionQuery, storeName, toast],
  );

  const createSession = useCallback(() => createSessionFor(date), [createSessionFor, date]);

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
        costPrice: Number(p.cost_price) || 0,
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

      // Hållbarhet slår igenom direkt som bäst före på lagerplatsen.
      if (patch.quality !== undefined) {
        const until = patch.quality ? holdsUntil(date, String(patch.quality)) : null;
        await supabase
          .from("product_stock_locations")
          .update({ expiry_date: until } as any)
          .eq("product_id", row.productId)
          .eq("location_id", row.locationId);
        qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
        qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      }
    },
    [session?.id, locked, qc, toast, date],
  );

  const categoryDone: Record<string, string> = (session?.category_done as any) ?? {};

  const toggleCategoryDone = useCallback(
    async (cat: string, done: boolean) => {
      if (!session?.id || locked) return;
      const current: Record<string, string> = { ...(((session as any).category_done as any) ?? {}) };
      if (done) current[cat] = new Date().toISOString();
      else delete current[cat];
      const { error } = await supabase
        .from("stock_count_sessions")
        .update({ category_done: current } as any)
        .eq("id", session.id);
      if (error) {
        toast({ title: "Kunde inte spara", description: error.message, variant: "destructive" });
        return;
      }
      await sessionQuery.refetch();
      if (done) setCollapsed((prev) => new Set(prev).add(cat));
    },
    [session, locked, sessionQuery, toast],
  );

  const lockSession = useCallback(async () => {
    if (!session?.id) return;

    // Räknade rader bokförs som lagerrörelser (inventering) innan låsningen.
    const counted = (linesQuery.data ?? []).filter(
      (l: any) => l.location_id && l.counted_qty !== null && l.counted_qty !== undefined,
    );
    let written = 0;
    let failed = 0;
    for (const l of counted as any[]) {
      try {
        await setBalance({
          productId: l.product_id,
          locationId: l.location_id,
          targetQuantityKg: Number(l.counted_qty),
          movementType: "inventering",
          note: `Inventering ${date} (${storeName})`,
        });
        written += 1;
      } catch {
        failed += 1;
      }

    }

    // Bäst före från vald hållbarhet skrivs till lagerplatsen (metadata, ej saldo)
    // för alla rader med hållbarhet – även de som inte räknats.
    for (const l of (linesQuery.data ?? []) as any[]) {
      if (!l.location_id || !l.quality) continue;
      const until = holdsUntil(date, String(l.quality));
      if (!until) continue;
      await supabase
        .from("product_stock_locations")
        .update({ expiry_date: until } as any)
        .eq("product_id", l.product_id)
        .eq("location_id", l.location_id);
    }

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
    qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
    qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    qc.invalidateQueries({ queryKey: ["stock_count_history", effectiveStoreId] });
    historyQuery.refetch();
    toast({
      title: "Inventeringen är låst",
      description: failed
        ? `${written} rader bokfördes i lagret, ${failed} misslyckades.`
        : `${written} rader bokfördes i lagret.`,
      variant: failed ? "destructive" : undefined,
    });
  }, [session?.id, sessionQuery, toast, linesQuery.data, date, storeName, qc, effectiveStoreId, historyQuery]);

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
            Flera inventeringar per dag går bra. Räkna per lagerplats, lås när allt är klart.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!session && effectiveStoreId && (
            <Button size="sm" className="gap-1.5 text-xs h-9 sm:h-8 font-semibold" onClick={createSession}>
              <Plus className="h-3.5 w-3.5" /> Påbörja inventering
            </Button>
          )}
          {session && effectiveStoreId && (
            <Button
              size="sm"
              className="gap-1.5 text-xs h-9 sm:h-8 font-semibold"
              onClick={() => createSessionFor(date)}
            >
              <Plus className="h-3.5 w-3.5" /> Ny inventering
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
            <Label className="text-xs flex items-center gap-1.5">
              Datum
              {date && (
                <span className="font-normal text-[10px] text-muted-foreground">
                  {weekdayLong(date)}
                </span>
              )}
            </Label>
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
        <Badge
          variant="outline"
          className="bg-amber-400/35 text-amber-900 border-amber-500/50 font-medium"
        >
          Idag: {weekdayLong(todayStockholm())} {todayStockholm()}
        </Badge>
        {date !== todayStockholm() && (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Inventering: {weekdayLong(date)} {date}
          </Badge>
        )}
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
        {daySessions.length > 1 && (
          <span className="flex items-center gap-1 flex-wrap">
            {daySessions.map((s: any, i: number) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedSessionId(s.id)}
                className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                  s.id === session?.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s.label || `#${i + 1}`} {s.status === "locked" ? "· låst" : "· öppen"}
              </button>
            ))}
          </span>
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

      {/* Inventeringshistorik — låsta tillfällen */}
      <Card>
        <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inventeringshistorik
          </span>
          <span className="text-[10px] text-muted-foreground">
            {(historyQuery.data ?? []).length} låsta inventeringar
          </span>
        </div>
        <CardContent className="p-1">
          {!(historyQuery.data ?? []).length ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              Ingen inventering är låst ännu för {storeName || "butiken"}.
            </p>
          ) : (
            <div className="divide-y">
              {(historyQuery.data ?? []).map((h: any) => {
                const lineCount = h.stock_count_lines?.[0]?.count ?? 0;
                const isCurrent = h.id === session?.id;
                return (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setDate(h.count_date);
                      setSelectedSessionId(h.id);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-1.5 py-1 text-left hover:bg-muted/50 ${
                      isCurrent ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-[11px] font-medium">
                        {dayLabel(h.count_date)} {h.count_date}
                        {h.label ? ` · ${h.label}` : ""}
                      </span>
                      <Badge
                        variant="outline"
                        className="h-4 bg-muted text-[9px] text-muted-foreground"
                      >
                        Låst
                      </Badge>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{lineCount} rader</span>
                      {h.locked_at && <span>låst {stampLabel(h.locked_at)}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>



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
        <div className="space-y-1.5">
          {groups.map((g) => {
            const doneAt = categoryDone[g.category];
            return (
            <Card
              key={g.category}
              className={`overflow-hidden ${doneAt ? "border-emerald-500/60" : ""}`}
            >
              <div
                className={`w-full px-2 py-1 border-b flex items-center justify-between gap-2 ${
                  doneAt ? "bg-emerald-500/20" : "bg-muted/50"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(g.category)}
                  className="flex items-center gap-1 min-w-0 flex-1 text-left"
                >
                  {collapsed.has(g.category) ? (
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide truncate ${
                      doneAt ? "text-emerald-700 dark:text-emerald-300" : ""
                    }`}
                  >
                    {g.category}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                    · {g.products.length} produkter
                  </span>
                </button>
                <span className="flex items-center gap-1.5 shrink-0">
                  {doneAt && (
                    <span className="text-[10px] text-emerald-700 dark:text-emerald-300 whitespace-nowrap">
                      Klar {new Date(doneAt).toLocaleString("sv-SE", {
                        timeZone: "Europe/Stockholm",
                        weekday: "short",
                        day: "numeric",
                        month: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={doneAt ? "outline" : "default"}
                    disabled={locked || !session}
                    onClick={() => toggleCategoryDone(g.category, !doneAt)}
                    className="h-5 px-2 text-[10px]"
                  >
                    {doneAt ? "Ångra" : "Färdig"}
                  </Button>
                </span>
              </div>
              {!collapsed.has(g.category) && (
              <CardContent className="p-0 divide-y divide-border/60">
                {g.products.map((prodRows) => {
                  const first = prodRows[0];
                  const countedTotal = prodRows.reduce((sum, r) => {
                    const l = linesByKey.get(r.key);
                    return sum + (l?.counted_qty != null ? Number(l.counted_qty) : 0);
                  }, 0);
                  const anyCounted = prodRows.some((r) => linesByKey.get(r.key)?.counted_qty != null);
                  return (
                    <div key={first.productId} className="px-2 py-1">
                      <div className="flex items-center gap-1.5">
                        {first.imageUrl ? (
                          <img
                            src={first.imageUrl}
                            alt={first.productName}
                            className="h-5 w-5 rounded object-cover border shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-5 w-5 rounded border bg-muted flex items-center justify-center shrink-0">
                            <Package className="h-2.5 w-2.5 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-[11px] font-medium truncate">{first.productName}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {first.sku ? `${first.sku} · ` : ""}
                          {first.unit}
                        </span>
                        {prodRows.length > 1 && anyCounted && (
                          <Badge
                            variant="outline"
                            className="ml-auto text-[10px] py-0 h-4 font-mono tabular-nums"
                          >
                            Totalt {fmtQty(countedTotal, first.unit)}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-0.5">
                        {prodRows.map((r) => {
                          const line = linesByKey.get(r.key);
                          const quality = (line?.quality ?? "") as string;
                          return (
                            <div
                              key={r.key}
                              className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_80px_136px_minmax(0,1fr)] gap-1 items-center"
                            >
                              <div className="text-[10px] text-muted-foreground truncate pl-6">
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
                                className="h-6 px-1.5 text-[11px] font-mono tabular-nums"
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
                                  className={`h-6 min-w-0 flex-1 rounded-md border px-1.5 text-[11px] font-medium disabled:opacity-50 ${qualityClass(quality)}`}
                                  title="Hållbarhet: antal dagar från inventeringsdatumet, med veckodag och datum"
                                >
                                  <option value="">Hållbarhet</option>
                                  <option
                                    value=""
                                    disabled
                                    className="font-semibold"
                                    style={{
                                      backgroundColor: "rgba(251, 191, 36, 0.45)",
                                      color: "#78350f",
                                    }}
                                  >
                                    — Idag {dayLabel(date)} —
                                  </option>
                                  {QUALITY_DAYS.map((d) => {
                                    const to = holdsUntil(date, d);
                                    return (
                                      <option key={d} value={d}>
                                        {d === "7+"
                                          ? "7+ dagar"
                                          : `${d} ${d === "1" ? "dag" : "dagar"}${to ? ` · ${dayLabel(to)}` : ""}`}
                                      </option>
                                    );
                                  })}
                                 </select>
                               </div>
                              <Input
                                disabled={locked || !session}
                                defaultValue={line?.comment ?? ""}
                                placeholder="Kommentar"
                                className="h-6 px-1.5 text-[11px]"
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
              )}
            </Card>
            );
          })}

        </div>
      )}

      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lås inventeringen?</DialogTitle>
            <DialogDescription>
              {storeName} — {date}. {countedCount} av {rows.length} rader är räknade. Vid låsning
              skrivs de räknade saldona in i lagret och raderna kan inte längre ändras.
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

      <CountListPrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        products={printProducts}
        storeName={storeName || undefined}
        date={date}
      />
    </motion.div>
  );
}
