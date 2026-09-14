import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ClipboardCheck, Check, Lock, Printer, Download, Search, Plus, Package, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
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
import { setBalance, setExpiryDate } from "@/lib/stockLedger";
import CountStartPanel from "@/components/inventory/CountStartPanel";
import { useIsMobile } from "@/hooks/use-mobile";


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
  const isMobile = useIsMobile();

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

  // ── Butikens inskickade inventeringsrapporter (dagsrapporter) ─────────────
  const reportsQuery = useQuery({
    queryKey: ["stock_report_history", effectiveStoreId],
    enabled: !!effectiveStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_stock_sheets")
        .select("id,sheet_date,status,line_count,counted_total_kg,closed_at,closed_by")
        .eq("store_id", effectiveStoreId)
        .is("location_id", null)
        .order("sheet_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const [openReportId, setOpenReportId] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // Raden i inventeringslistan är kompakt; redigering öppnas först vid klick.
  const [editKey, setEditKey] = useState<string | null>(null);
  const reportLinesQuery = useQuery({
    queryKey: ["stock_report_lines", openReportId],
    enabled: !!openReportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_stock_sheet_lines")
        .select("id,product_name,unit,counted_qty_kg")
        .eq("sheet_id", openReportId!)
        .order("sort_order");
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

  const locationIds = useMemo(
    () => (locations as any[]).map((l: any) => l.id as string),
    [locations],
  );

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

  /** Inventeringslistan: varor som fått ett värde, senast inmatad först. */
  const countedRows = useMemo(
    () =>
      allRows
        .filter((r) => linesByKey.get(r.key)?.counted_qty != null)
        .sort((a, b) => {
          const ta = linesByKey.get(a.key)?.counted_at ?? "";
          const tb = linesByKey.get(b.key)?.counted_at ?? "";
          return tb.localeCompare(ta);
        }),
    [allRows, linesByKey],
  );

  /** Underlag inför låsning: räknat, ej räknat med saldo, och skillnad i kg och kronor. */
  const lockSummary = useMemo(() => {
    let diffKg = 0;
    let diffValue = 0;
    const skipped: Row[] = [];
    for (const r of rows) {
      const l = linesByKey.get(r.key);
      const counted = l?.counted_qty;
      if (counted === null || counted === undefined) {
        if (Math.abs(r.systemQty) > 0.005) skipped.push(r);
        continue;
      }
      const d = Number(counted) - r.systemQty;
      diffKg += d;
      diffValue += d * r.costPrice;
    }
    return { diffKg, diffValue, skipped };
  }, [rows, linesByKey]);


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
        await setExpiryDate({ productId: row.productId, locationId: row.locationId, expiryDate: until });
        qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
        qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      }
    },
    [session?.id, locked, qc, toast, date],
  );

  /** Ej räknade rader med saldo nollas i ett svep — inget lämnas tyst. */
  const zeroSkippedRows = useCallback(async () => {
    if (!session?.id || locked || !lockSummary.skipped.length) return;
    for (const r of lockSummary.skipped) {
      await saveLine(r, { counted_qty: 0, comment: "Nollad vid låsning — varan var slut" });
    }
    toast({
      title: "Ej räknade rader nollade",
      description: `${lockSummary.skipped.length} rader satta till 0.`,
    });
  }, [session?.id, locked, lockSummary.skipped, saveLine, toast]);



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
          referenceType: "stock_count_session",
          referenceId: session.id,
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
      await setExpiryDate({ productId: l.product_id, locationId: l.location_id, expiryDate: until });
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
      title: "Inventeringsrapporten är klar",
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
            {session
              ? "Räkna kategori för kategori och lås rapporten när allt är klart."
              : "Starta en rapport, räkna av lagret och lås. Du kan göra flera per dag."}
          </p>
        </div>
        {session && !locked && effectiveStoreId && (
          <div className="flex items-center gap-1.5 flex-nowrap w-full sm:w-auto">
            <Button size="sm" variant="outline" className="gap-1 text-[11px] sm:text-xs h-8 px-2 flex-1 sm:flex-none" onClick={openPrintDialog}>
              <Printer className="h-3 w-3" /> Skriv ut
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-[11px] sm:text-xs h-8 px-2 flex-1 sm:flex-none" onClick={exportCsv}>
              <Download className="h-3 w-3" /> Export
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0 shrink-0"
              aria-label="Uppdatera"
              onClick={() => {
                sessionQuery.refetch();
                linesQuery.refetch();
              }}
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
            {!locked && (
              <Button
                size="sm"
                className="gap-1 text-[11px] sm:text-xs h-8 px-2 font-semibold flex-1 sm:flex-none"
                onClick={() => setLockOpen(true)}
              >
                <Check className="h-3 w-3" /> Klar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Klar rapport — tom sida med stor startknapp, rapporten ligger i listan nedan */}
      {session && locked && effectiveStoreId && (
        <Button
          className="h-12 w-full gap-2 text-sm font-semibold"
          onClick={() => createSessionFor(date)}
        >
          <Plus className="h-4 w-4" /> Skapa inventeringsrapport
        </Button>
      )}

      {/* Start — guidat läge när ingen rapport är igång för datumet */}
      {!session && (
        <CountStartPanel
          stores={stores as any[]}
          storeId={effectiveStoreId}
          onStoreChange={setStoreId}
          date={date}
          onDateChange={setDate}
          dayName={weekdayLong(date)}
          productCount={allRows.length}
          onStart={createSession}
          onPrint={openPrintDialog}
        />
      )}

      {session && !locked && (
      <>
      {/* Pågående inventering — tydlig status och färdigställ-knapp */}
      <div className="flex flex-col gap-2 rounded-lg border border-amber-400/60 bg-amber-50 p-3 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-500" />
            Inventering pågår
          </p>
          <p className="text-[11px] leading-snug text-amber-800/80 dark:text-amber-200/80">
            Skriv in mängden för varje vara. När du är klar färdigställer du rapporten — då blir de räknade
            värdena det nya lagersaldot.
          </p>
        </div>
        <Button
          className="h-11 w-full shrink-0 gap-2 bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 sm:w-auto"
          onClick={() => setLockOpen(true)}
        >
          <Check className="h-4 w-4" /> Färdigställ inventeringsrapport
        </Button>
      </div>

      {/* Liten statusrad: dag, läge, ev. flera rapporter */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">
          {weekdayLong(date)} {date}
        </span>
        <span className={locked ? "text-muted-foreground" : "font-medium text-emerald-600"}>
          · {locked ? "Låst" : "Öppen"}
        </span>
        {storeName && <span className="hidden sm:inline">· {storeName}</span>}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[11px]"
          onClick={() => {
            sessionQuery.refetch();
            linesQuery.refetch();
          }}
        >
          <RefreshCw className="h-3 w-3" /> Uppdatera
        </Button>
      </div>

      {/* Rad 1: kategoriknapp och filter. Rad 2: sökfältet direkt över listorna. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-8 w-auto min-w-[130px] gap-1 text-xs">
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
        <button
          type="button"
          onClick={() => setOnlyUncounted(!onlyUncounted)}
          className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-medium transition-colors ${
            onlyUncounted
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          Ej räknade
        </button>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök produkt — namn eller SKU"
          className="h-9 w-full pl-8 text-sm"
        />
      </div>
      </>
      )}

      {/* Lista — delad vy: alla varor till vänster, inventerade till höger */}
      {!session || locked ? null : loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Vänster (dator) / sökträffar (mobil): alla varor per kategori */}
          {(!isMobile || !!search.trim()) && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {isMobile ? "Sökträffar" : "Alla varor"} · {rows.length} rader
              </p>
              {!rows.length ? (
                <Card>
                  <CardContent className="p-6 text-center text-xs text-muted-foreground">
                    Ingen vara matchar sökningen.
                  </CardContent>
                </Card>
              ) : (
                groups.map((g) => {
                  const doneAt = categoryDone[g.category];
                  const isCollapsed = collapsed.has(g.category);
                  return (
                    <Card
                      key={g.category}
                      className={`overflow-hidden ${doneAt ? "border-emerald-500/60" : ""}`}
                    >
                      <div
                        className={`flex w-full items-center justify-between gap-2 border-b px-2 py-1.5 ${
                          doneAt ? "bg-emerald-500/20" : "bg-muted/50"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategory(g.category)}
                          className="flex min-w-0 flex-1 items-center gap-1 text-left"
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className={`truncate text-[11px] font-semibold uppercase tracking-wide ${
                              doneAt ? "text-emerald-700 dark:text-emerald-300" : ""
                            }`}
                          >
                            {g.category}
                          </span>
                          <span className="ml-1 shrink-0 text-[10px] text-muted-foreground">
                            · {g.products.length} varor
                          </span>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant={doneAt ? "outline" : "ghost"}
                          disabled={locked || !session}
                          onClick={() => toggleCategoryDone(g.category, !doneAt)}
                          className="h-6 px-2 text-[10px]"
                        >
                          {doneAt ? "Ångra" : "Färdig"}
                        </Button>
                      </div>
                      {!isCollapsed && (
                        <CardContent className="divide-y divide-border/60 p-0">
                          {g.products.flatMap((prodRows) =>
                            prodRows.map((r) => {
                              const line = linesByKey.get(r.key);
                              const isCounted = line?.counted_qty != null;
                              return (
                                <div
                                  key={r.key}
                                  className={`flex items-center gap-2 px-2 py-1.5 transition-colors ${
                                    isCounted ? "bg-emerald-500/15" : ""
                                  }`}
                                >
                                  {r.imageUrl ? (
                                    <img
                                      src={r.imageUrl}
                                      alt={r.productName}
                                      className="h-7 w-7 shrink-0 rounded border object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border bg-muted">
                                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
                                  )}
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className={`block truncate text-[13px] font-medium ${
                                        isCounted ? "text-emerald-800 dark:text-emerald-200" : ""
                                      }`}
                                    >
                                      {r.productName}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground">
                                      {prodRows.length > 1 ? `${r.locationName} · ` : ""}
                                      Lager{" "}
                                      <span className="font-mono tabular-nums">
                                        {fmtQty(r.systemQty, r.unit)}
                                      </span>
                                    </span>
                                  </span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    pattern="[0-9]*[.,]?[0-9]*"
                                    autoComplete="off"
                                    enterKeyHint="done"
                                    disabled={locked || !session}
                                    defaultValue={line?.counted_qty ?? ""}
                                    placeholder={r.unit}
                                    className="h-10 w-[92px] shrink-0 px-1.5 text-right font-mono text-base tabular-nums sm:h-8 sm:text-sm"
                                    onFocus={(e) => e.currentTarget.select()}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.currentTarget.blur();
                                    }}
                                    onBlur={(e) => {
                                      const raw = e.target.value.replace(",", ".").trim();
                                      const val = raw === "" ? null : Number(raw);
                                      if (val !== null && Number.isNaN(val)) return;
                                      if ((line?.counted_qty ?? null) === val) return;
                                      saveLine(r, { counted_qty: val });
                                    }}
                                  />
                                </div>
                              );
                            }),
                          )}
                        </CardContent>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          )}

          {/* Höger (dator) / listan som byggs upp (mobil): inventerade varor */}
          <div className="space-y-1.5 lg:sticky lg:top-2 lg:self-start">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Inventeringslistan · {countedRows.length} varor
            </p>
            <div className="overflow-hidden rounded-md border-t border-grid-line">
              {!countedRows.length ? (
                <div className="border-x border-b border-grid-line bg-card p-6 text-center text-xs text-muted-foreground">
                  Skriv in ett värde på en vara — den hamnar här och blir grön i listan.
                </div>
              ) : (
                <div>
                  <div className="flex items-center border-x border-b border-grid-line bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="min-w-0 flex-1 border-r border-grid-line/70 pr-2">Produkt</span>
                    <span className="hidden w-16 shrink-0 border-r border-grid-line/70 px-2 text-center sm:block">
                      Hållb.
                    </span>
                    <span className="w-14 shrink-0 border-r border-grid-line/70 px-2 text-right">Diff</span>
                    <span className="w-20 shrink-0 px-2 text-right">Antal</span>
                  </div>
                  {countedRows.map((r) => {
                    const line = linesByKey.get(r.key);
                    const counted = Number(line?.counted_qty ?? 0);
                    const diff = counted - r.systemQty;
                    const quality = (line?.quality ?? "") as string;
                    return (
                      <div key={r.key} className="border-x border-b border-grid-line bg-card">
                        <button
                          type="button"
                          onClick={() => setEditKey(editKey === r.key ? null : r.key)}
                          className="flex w-full items-center px-2 py-1 text-left hover:bg-muted/50"
                        >
                          <span className="min-w-0 flex-1 truncate border-r border-grid-line/70 pr-2 text-[12px] font-medium">
                            {r.productName}
                          </span>
                          <span className="hidden w-16 shrink-0 border-r border-grid-line/70 px-2 text-center text-[10px] text-muted-foreground sm:block">
                            {quality ? (quality === "7+" ? "7+ d" : `${quality} d`) : "—"}
                          </span>
                          <span className="w-14 shrink-0 border-r border-grid-line/70 px-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                            {diff === 0
                              ? "±0"
                              : `${diff > 0 ? "+" : ""}${diff.toLocaleString("sv-SE", {
                                  maximumFractionDigits: 1,
                                })}`}
                          </span>
                          <span className="w-20 shrink-0 px-2 text-right font-mono text-[12px] font-semibold tabular-nums">
                            {fmtQty(counted, r.unit)}
                          </span>
                        </button>
                        {editKey === r.key && (
                          <div className="flex items-center gap-1 bg-muted/30 px-2 py-1.5">
                            <select
                              disabled={locked || !session}
                              value={quality}
                              onChange={(e) =>
                                saveLine(r, { quality: (e.target.value || null) as Quality | null })
                              }
                              className={`h-7 min-w-0 flex-1 rounded-md border px-1.5 text-[11px] font-medium disabled:opacity-50 ${qualityClass(quality)}`}
                            >
                              <option value="">Hållbarhet</option>
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
                            <Input
                              disabled={locked || !session}
                              defaultValue={line?.comment ?? ""}
                              placeholder="Kommentar"
                              className="h-7 flex-1 px-1.5 text-[11px]"
                              onBlur={(e) => {
                                const val = e.target.value.trim() || null;
                                if ((line?.comment ?? null) === val) return;
                                saveLine(r, { comment: val });
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={locked || !session}
                              className="h-7 shrink-0 px-1.5 text-[10px] text-destructive"
                              onClick={() => {
                                saveLine(r, { counted_qty: null });
                                setEditKey(null);
                              }}
                            >
                              Ta bort
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tidigare inventeringar — låsta tillfällen + inskickade rapporter, gömda bakom en utfällning */}
      <Card>
        <button
          type="button"
          onClick={() => setArchiveOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1.5 text-left hover:bg-muted"
        >
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {archiveOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Inventeringsrapporter
          </span>
          <span className="text-[10px] text-muted-foreground">
            {(historyQuery.data ?? []).length} låsta ·{" "}
            {(reportsQuery.data ?? []).length} rapporter
          </span>
        </button>
        {archiveOpen && (
        <CardContent className="space-y-2 p-1">
          <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Låsta inventeringar
          </p>
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
                      
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="px-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Inskickade rapporter från butiken
          </p>
          {!(reportsQuery.data ?? []).length ? (
            <p className="px-1 py-2 text-[11px] text-muted-foreground">
              Inga inventeringsrapporter har skickats in för {storeName || "butiken"}.
            </p>
          ) : (
            <div className="divide-y">
              {(reportsQuery.data ?? []).map((r: any) => {
                const isOpen = openReportId === r.id;
                return (
                  <div key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpenReportId(isOpen ? null : r.id)}
                      className="flex w-full items-center justify-between gap-2 px-1.5 py-1 text-left hover:bg-muted/50"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {isOpen ? (
                          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                        <span className="truncate text-[11px] font-medium">
                          {dayLabel(r.sheet_date)} {r.sheet_date}
                        </span>
                        <Badge
                          variant="outline"
                          className={`h-4 text-[9px] ${
                            r.status === "godkand"
                              ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-700"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {r.status === "godkand" ? "Inskickad" : "Utkast"}
                        </Badge>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{Number(r.line_count) || 0} rader</span>
                        <span className="font-mono tabular-nums">
                          {(Number(r.counted_total_kg) || 0).toLocaleString("sv-SE", {
                            maximumFractionDigits: 1,
                          })}{" "}
                          kg
                        </span>
                        
                      </span>
                    </button>
                    {isOpen && (
                      <div className="bg-muted/30 px-3 py-1.5">
                        {reportLinesQuery.isLoading ? (
                          <p className="text-[11px] text-muted-foreground">Laddar rader…</p>
                        ) : !(reportLinesQuery.data ?? []).length ? (
                          <p className="text-[11px] text-muted-foreground">Inga rader.</p>
                        ) : (
                          <div className="divide-y divide-border/50">
                            {(reportLinesQuery.data ?? []).map((l: any) => (
                              <div key={l.id} className="flex justify-between gap-2 py-0.5 text-[11px]">
                                <span className="truncate">{l.product_name}</span>
                                <span className="shrink-0 font-mono tabular-nums">
                                  {fmtQty(Number(l.counted_qty_kg) || 0, unitOf(l.unit))}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        )}
      </Card>





      {/* Mobil: fast åtgärdsrad längst ned */}
      {effectiveStoreId && (
        <>
          <div className="h-16 sm:hidden" aria-hidden />
          <div
            className="sm:hidden fixed bottom-14 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur px-3 py-2 flex items-center justify-between gap-2"
            style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
          >
            {!session || locked ? (
              <Button
                className="h-11 w-full gap-1.5 text-sm font-semibold"
                onClick={() => (session ? createSessionFor(date) : createSession())}
              >
                <Plus className="h-4 w-4" /> Skapa inventeringsrapport
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-10 gap-1.5 text-xs font-semibold"
                onClick={() => setLockOpen(true)}
              >
                <Check className="h-4 w-4" /> Klar
              </Button>
            )}
          </div>
        </>
      )}



      <Dialog open={lockOpen} onOpenChange={setLockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Klar med inventeringen?</DialogTitle>
            <DialogDescription>
              {storeName} — {date}. Inventeringsrapporten skapas, de räknade saldona blir det nya
              lagret och raderna kan inte längre ändras.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-border bg-muted/40 p-2.5 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span>Räknade rader</span>
              <span className="font-mono tabular-nums">
                {countedCount} av {rows.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Skillnad mot lagret</span>
              <span className="font-mono tabular-nums">
                {lockSummary.diffKg >= 0 ? "+" : "−"}
                {Math.abs(lockSummary.diffKg).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg
                {" · "}
                {lockSummary.diffValue >= 0 ? "+" : "−"}
                {Math.abs(Math.round(lockSummary.diffValue)).toLocaleString("sv-SE")} kr
              </span>
            </div>
            {lockSummary.skipped.length > 0 && (
              <div className="pt-1 border-t border-border/60 space-y-1">
                <div className="flex items-center justify-between gap-2 text-amber-700">
                  <span className="font-medium">
                    {lockSummary.skipped.length} rader med saldo är inte räknade
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[11px]"
                    onClick={zeroSkippedRows}
                  >
                    Nolla dem
                  </Button>
                </div>
                <p className="text-muted-foreground">
                  Låser du nu står deras saldo kvar oförändrat. Nolla dem om varan är slut, annars
                  räkna dem först.
                </p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {lockSummary.skipped.slice(0, 12).map((r) => (
                    <div key={r.key} className="flex justify-between gap-2 text-[11px]">
                      <span className="truncate">
                        {r.productName}
                        <span className="text-muted-foreground"> · {r.locationName}</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {r.systemQty.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {r.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setLockOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={lockSession} className="gap-1.5">
              <Check className="h-3.5 w-3.5" /> Klar
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
