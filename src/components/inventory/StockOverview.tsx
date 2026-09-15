import { useMemo, useState } from "react";
import {
  Search,
  ListFilter,
  Package,
  Coins,
  Boxes,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Rows3,
  Rows4,
  MoreHorizontal,
  Move,
  Trash2,
  Scissors,
  RefreshCw,
  ClipboardList,
  Snowflake,
  Fish,
  Sparkles,
  Package2,
  Camera,
} from "lucide-react";
import { format, parseISO, differenceInDays, startOfISOWeek, endOfISOWeek, getISOWeek } from "date-fns";
import { sv } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductThumb } from "@/components/products/ProductThumb";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import ProductTraceabilityInline from "@/components/inventory/ProductTraceabilityInline";
import ProductStockFlow from "@/components/inventory/ProductStockFlow";
import { ProductPhotosGallery } from "@/components/products/ProductPhotos";
import FamilyStockView from "@/components/inventory/FamilyStockView";
import { useProductFamilies, useOrderedByProduct } from "@/hooks/useProductFamilies";
import { usePackedByProduct } from "@/hooks/usePackedByProduct";
import { useNavigate } from "react-router-dom";
import { useProductPhotoCounts } from "@/hooks/useEntityImages";
import { useSite } from "@/contexts/SiteContext";
import { Layers } from "lucide-react";

/** En lagerrad från product_stock_locations (joinad med products + storage_locations). */
export interface StockRow {
  id: string;
  product_id: string;
  location_id: string;
  quantity: number | string;
  min_stock?: number | string | null;
  unit_cost?: number | string | null;
  arrival_date?: string | null;
  expiry_date?: string | null;
  products?: any;
  storage_locations?: any;
}

export type StockLineAction = "move" | "delete" | "split" | "count" | "waste" | "transform";

interface Props {
  rows: StockRow[];
  /** products från useProducts — används för bild + fallback-metadata */
  productsById: Map<string, any>;
  /** Formaterar belopp i butikens valuta */
  fmt: (v: number) => string;
  currency: string;
  onLineAction?: (action: StockLineAction, row: StockRow) => void;
  /** Rubrik-yta ovanför tabellen (t.ex. växla vy-knappar) */
  headerRight?: React.ReactNode;
  /** Butiksläget döljer kostnadsbaserat lagervärde. */
  showCosts?: boolean;
  /** Butiksportalen visar bara kvantitet + antal produkter, i mindre format. */
  compactKpis?: boolean;
  /** Åtgärd i tomt tillstånd, t.ex. gå till inleveranser. */
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
  /** Öppnar omvandlingsflödet direkt på en produkt (från familjevyn). */
  onTransformProduct?: (productId: string, targetProductId?: string) => void;
}

const CATEGORY_ICONS: Record<string, any> = {
  "Färsk Fisk": Fish,
  Skaldjur: Fish,
  Frys: Snowflake,
  Delikatesser: Sparkles,
  "Rökta Produkter": Sparkles,
};

/** Stabil färg per lagerplats (för de staplade lagerstaplarna). */
const BAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-fuchsia-500",
];

export function qtyToKg(quantity: number, product: any): number {
  if (!product) return quantity;
  const unit = (product.unit || "kg").toLowerCase();
  if (unit === "st" && Number(product.weight_per_piece) > 0) {
    return quantity * Number(product.weight_per_piece);
  }
  return quantity;
}

type Status = "ok" | "warning" | "critical" | "expired" | "low";

/**
 * Dagar kvar med veckodag när det är nära: "idag", "imorgon (tis)", "3 dagar (tors)".
 * Veckodagen visas bara inom 5 dagar, för då tänker man i veckodagar i butiken.
 */
function daysLeftLabel(daysLeft: number | null, expiry?: string | null, short = false): string {
  if (daysLeft === null) return "–";
  if (daysLeft < 0) return `${Math.abs(daysLeft)} d sen`;
  const wd = expiry && daysLeft <= 5 ? format(parseISO(expiry), "EEE", { locale: sv }) : "";
  if (daysLeft === 0) return wd ? `idag (${wd})` : "idag";
  const base = short ? `${daysLeft} d` : `${daysLeft} dag${daysLeft === 1 ? "" : "ar"}`;
  if (daysLeft === 1) return wd ? `imorgon (${wd})` : base;
  return wd ? `${base} (${wd})` : base;
}

function statusOf(daysLeft: number | null, low: boolean): Status {
  if (daysLeft !== null && daysLeft < 0) return "expired";
  if (daysLeft !== null && daysLeft <= 2) return "critical";
  if (daysLeft !== null && daysLeft <= 5) return "warning";
  if (low) return "low";
  return "ok";
}

const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  ok: { label: "Bra", dot: "bg-emerald-500", text: "text-emerald-600" },
  low: { label: "Lågt", dot: "bg-amber-500", text: "text-amber-600" },
  warning: { label: "Varning", dot: "bg-amber-500", text: "text-amber-600" },
  critical: { label: "Kritisk", dot: "bg-destructive", text: "text-destructive" },
  expired: { label: "Utgången", dot: "bg-destructive", text: "text-destructive" },
};

interface ProductGroup {
  product_id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  image_url: string | null;
  lines: StockRow[];
  /** Kvantitet i produktens egen enhet: antal för st, kilo för kg. */
  totalQty: number;
  totalKg: number;
  value: number;
  minStock: number;
  earliestExpiry: string | null;
  daysLeft: number | null;
  status: Status;
}

export default function StockOverview({
  rows,
  productsById,
  fmt,
  currency,
  onLineAction,
  headerRight,
  showCosts = true,
  compactKpis = false,
  onEmptyAction,
  emptyActionLabel = "Registrera inleverans",
  onTransformProduct,
}: Props) {
  const { activeStoreId, site } = useSite();
  const navigate = useNavigate();
  const { data: families = [] } = useProductFamilies();
  const { data: orderedByProduct } = useOrderedByProduct(activeStoreId || null);
  /** Packat till kundbeställningar — visas som gul andel i lagerstapeln. */
  const { data: packedByProduct } = usePackedByProduct(activeStoreId || null);
  /** Antal bilder per produkt — visas som kameraikon med siffra i raden. */
  const { data: photoCounts } = useProductPhotoCounts(
    useMemo(() => rows.map((r) => r.product_id), [rows]),
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dense, setDense] = useState(false);
  /** Familjevyn: samma vara i olika förpackningar summerad till kilo. */
  const [familyView, setFamilyView] = useState(
    () => typeof window !== "undefined" && localStorage.getItem("stock.familyView") === "1",
  );
  const toggleFamilyView = () =>
    setFamilyView((v) => {
      localStorage.setItem("stock.familyView", v ? "0" : "1");
      return !v;
    });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** Hopfällda kategorier i tabellen */
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const [showStats, setShowStats] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const locationColor = useMemo(() => {
    const map = new Map<string, string>();
    let i = 0;
    for (const r of rows) {
      if (!map.has(r.location_id)) {
        map.set(r.location_id, BAR_COLORS[i % BAR_COLORS.length]);
        i++;
      }
    }
    return map;
  }, [rows]);

  /** Gruppera lagerrader per produkt */
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>();
    for (const r of rows) {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) continue;
      const p = r.products || productsById.get(r.product_id) || {};
      const master = productsById.get(r.product_id) || p;
      let g = map.get(r.product_id);
      if (!g) {
        g = {
          product_id: r.product_id,
          name: p.name || master.name || "—",
          sku: p.sku || master.sku || "",
          category: p.category || master.category || "Övrigt",
          unit: p.unit || master.unit || "kg",
          image_url: master.image_url ?? p.image_url ?? null,
          lines: [],
          totalQty: 0,
          totalKg: 0,
          value: 0,
          minStock: 0,
          earliestExpiry: null,
          daysLeft: null,
          status: "ok",
        };
        map.set(r.product_id, g);
      }
      g.lines.push(r);
      g.totalQty += qty;
      g.totalKg += qtyToKg(qty, p);
      const unitPrice = Number(r.unit_cost) || 0;
      g.value += qty * unitPrice;
      g.minStock += Number(r.min_stock) || 0;
      if (r.expiry_date && (!g.earliestExpiry || r.expiry_date < g.earliestExpiry)) {
        g.earliestExpiry = r.expiry_date;
      }
    }
    const list = Array.from(map.values());
    for (const g of list) {
      g.daysLeft = g.earliestExpiry ? differenceInDays(parseISO(g.earliestExpiry), new Date()) : null;
      const low = g.minStock > 0 && g.totalQty < g.minStock;
      g.status = statusOf(g.daysLeft, low);
      g.lines.sort((a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999"));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [rows, productsById]);

  /** Saldo per produkt i produktens egen enhet — underlag för familjevyn. */
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const qty = Number(r.quantity) || 0;
      if (qty <= 0) continue;
      map.set(r.product_id, (map.get(r.product_id) || 0) + qty);
    }
    return map;
  }, [rows]);

  const allProductList = useMemo(() => Array.from(productsById.values()), [productsById]);

  const openTransform = (productId: string, targetProductId?: string) => {
    if (onTransformProduct) return onTransformProduct(productId, targetProductId);
    const row = rows.find((r) => r.product_id === productId);
    if (row) onLineAction?.("transform", row);
  };

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) counts.set(g.category, (counts.get(g.category) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [groups]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (category !== "__all__" && g.category !== category) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "low" && !(g.minStock > 0 && g.totalQty < g.minStock)) return false;
        if (statusFilter === "expiring" && !(g.daysLeft !== null && g.daysLeft <= 5)) return false;
        if (statusFilter === "expired" && !(g.daysLeft !== null && g.daysLeft < 0)) return false;
        if (statusFilter === "ok" && g.status !== "ok") return false;
      }
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.sku.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
      );
    });
  }, [groups, category, statusFilter, search]);

  // ── KPI:er ───────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const value = filtered.reduce((s, g) => s + g.value, 0);
    const qty = filtered.reduce((s, g) => s + g.totalKg, 0);
    const low = filtered.filter((g) => g.minStock > 0 && g.totalQty < g.minStock).length;
    const critical = filtered.filter((g) => g.daysLeft !== null && g.daysLeft <= 2).length;
    return { value, qty, count: filtered.length, low, critical };
  }, [filtered]);

  /**
   * Beställt av lagret — hur mycket av saldot som redan är uppbokat på order,
   * i kilo, i andel av lagret och i lagervärde, fördelat per leveransvecka.
   */
  const booked = useMemo(() => {
    let kg = 0;
    let value = 0;
    let packedKg = 0;
    let packedValue = 0;
    const weeks = new Map<string, { key: string; label: string; range: string; kg: number; value: number }>();
    const packedWeeks = new Map<string, { key: string; label: string; range: string; kg: number; value: number }>();
    for (const g of filtered) {
      const pk = packedByProduct?.get(g.product_id);
      if (!pk) continue;
      const p = productsById.get(g.product_id) || {};
      const unitCost = g.totalQty > 0 ? g.value / g.totalQty : 0;
      for (const o of pk.orders) {
        const qKg = qtyToKg(o.quantity, p);
        const qValue = o.quantity * unitCost;
        kg += qKg;
        value += qValue;
        if (o.kind === "packed") packedKg += qKg;
        const d = o.wantedDate ? parseISO(o.wantedDate) : null;
        const start = d ? startOfISOWeek(d) : null;
        const key = start ? format(start, "yyyy-MM-dd") : "utan-datum";
        const entry =
          weeks.get(key) ??
          {
            key,
            label: d ? `v. ${getISOWeek(d)}` : "Utan datum",
            range: start
              ? `${format(start, "d MMM", { locale: sv })} – ${format(endOfISOWeek(start), "d MMM", { locale: sv })}`
              : "Leveransdatum saknas",
            kg: 0,
            value: 0,
          };
        entry.kg += qKg;
        entry.value += qValue;
        weeks.set(key, entry);
      }
    }
    const list = Array.from(weeks.values()).sort((a, b) => a.key.localeCompare(b.key));
    const maxWeekKg = Math.max(1, ...list.map((w) => w.kg));
    return {
      kg,
      value,
      packedKg,
      restKg: Math.max(0, kg - packedKg),
      kgPct: kpis.qty > 0 ? Math.min(100, (kg / kpis.qty) * 100) : 0,
      valuePct: kpis.value > 0 ? Math.min(100, (value / kpis.value) * 100) : 0,
      weeks: list,
      maxWeekKg,
    };
  }, [filtered, packedByProduct, productsById, kpis.qty, kpis.value]);


  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  /** Gruppera sidans rader per kategori för kategori-rubriker i tabellen */
  const pageByCategory = useMemo(() => {
    const map = new Map<string, ProductGroup[]>();
    pageRows.forEach((g) => {
      const list = map.get(g.category) || [];
      list.push(g);
      map.set(g.category, list);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "sv"));
  }, [pageRows]);

  const maxKg = Math.max(1, ...pageRows.map((g) => g.totalKg));
  const rowH = dense ? "h-7" : "h-9";

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const locName = (r: StockRow) => {
    const loc = r.storage_locations;
    if (!loc) return "Lagerplats";
    return loc.name || "Lagerplats";
  };

  return (
    <div className="space-y-3">
      {/* Övertext: beställt av lagret — hela statistikvyn fälls ut vid klick */}
      <button
        type="button"
        onClick={() => setShowStats((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/[0.04] px-3 py-2 text-left transition-colors hover:bg-amber-500/[0.08]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <ClipboardList className="h-4 w-4 shrink-0 text-amber-500" />
          <span className="truncate text-sm font-semibold">Beställt av lagret</span>
          {booked.kg > 0.005 && (
            <span className="hidden font-mono text-xs tabular-nums text-amber-600 sm:inline">
              {booked.kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg ·{" "}
              {booked.kgPct.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} % av lagret
              {showCosts ? ` · ${fmt(booked.value)}` : ""}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          {showStats ? "Dölj statistik" : "Visa statistik"}
          {showStats ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
      </button>

      {/* KPI-kort — alltid synliga ovanför lagerlistan */}
      {compactKpis ? (
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <Card className="shadow-card">
            <CardContent className="p-2.5">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Boxes className="h-3 w-3 text-primary" /> Total kvantitet
              </p>
              <p className="text-base font-heading font-bold tabular-nums">
                {kpis.qty.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kg
              </p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-2.5">
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3 text-primary" /> Antal produkter
              </p>
              <p className="text-base font-heading font-bold tabular-nums">{kpis.count}</p>
            </CardContent>
          </Card>
        </div>
      ) : (
      <div className={cn("grid grid-cols-2 gap-1.5 sm:grid-cols-3", showCosts ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {showCosts && (
          <Card className="shadow-none">
            <CardContent className="px-2 py-1.5">
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                <Coins className="h-3 w-3 text-primary" /> Lagervärde
              </p>
              <p className="font-heading text-sm font-bold tabular-nums leading-tight">{fmt(kpis.value)}</p>
              <p className="text-[9px] text-muted-foreground">Kostnad ({currency})</p>
            </CardContent>
          </Card>
        )}
        <Card className="shadow-none">
          <CardContent className="px-2 py-1.5">
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <Boxes className="h-3 w-3 text-primary" /> Total kvantitet
            </p>
            <p className="font-heading text-sm font-bold tabular-nums leading-tight">
              {kpis.qty.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kg
            </p>
            <p className="text-[9px] text-muted-foreground">Omräknat till kg</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardContent className="px-2 py-1.5">
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <Package className="h-3 w-3 text-primary" /> Antal produkter
            </p>
            <p className="font-heading text-sm font-bold tabular-nums leading-tight">{kpis.count}</p>
            <p className="text-[9px] text-muted-foreground">{rows.length} lagerrader</p>
          </CardContent>
        </Card>
        <Card className={cn("shadow-none", kpis.low > 0 && "border-amber-500/30 bg-amber-500/5")}>
          <CardContent className="px-2 py-1.5">
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-3 w-3 text-amber-500" /> Lågt lager
            </p>
            <p
              className={cn(
                "font-heading text-sm font-bold tabular-nums leading-tight",
                kpis.low > 0 && "text-amber-600",
              )}
            >
              {kpis.low}
            </p>
            <p className="text-[9px] text-muted-foreground">under min</p>
          </CardContent>
        </Card>
        <Card className={cn("shadow-none", kpis.critical > 0 && "border-destructive/30 bg-destructive/5")}>
          <CardContent className="px-2 py-1.5">
            <p className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3 text-destructive" /> Utgångna/kritiska
            </p>
            <p
              className={cn(
                "font-heading text-sm font-bold tabular-nums leading-tight",
                kpis.critical > 0 && "text-destructive",
              )}
            >
              {kpis.critical}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {kpis.critical > 0 ? "Kräver åtgärd" : "Inga varningar"}
            </p>
          </CardContent>
        </Card>
      </div>
      )}

      {showStats && (
        <div className="space-y-3">


      {/* Beställt av lagret — kilo, andel och lagervärde per leveransvecka */}
      {booked.kg > 0.005 && (
        <Card className="shadow-card border-amber-500/30 bg-amber-500/[0.04]">
          <CardContent className="space-y-3 p-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ClipboardList className="h-3.5 w-3.5 text-amber-500" /> Beställt av lagret
                </p>
                <p className="text-2xl font-heading font-bold tabular-nums text-amber-600">
                  {booked.kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg
                  <span className="ml-2 text-sm font-semibold text-muted-foreground">
                    {booked.kgPct.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} % av lagret
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {booked.packedKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg packat ·{" "}
                  {booked.restKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg kvar att packa
                </p>
              </div>
              {showCosts && (
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">Orderbundet lagervärde</p>
                  <p className="text-xl font-heading font-bold tabular-nums text-amber-600">
                    {fmt(booked.value)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {booked.valuePct.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} % av{" "}
                    {fmt(kpis.value)}
                  </p>
                </div>
              )}
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${booked.kgPct}%` }} />
            </div>

            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Per leveransvecka
              </p>
              {booked.weeks.map((w) => {
                const pctOfStock = kpis.qty > 0 ? Math.min(100, (w.kg / kpis.qty) * 100) : 0;
                return (
                  <div
                    key={w.key}
                    className="grid grid-cols-[64px_1fr_84px_56px] items-center gap-2 rounded-md bg-card/70 px-2 py-1.5 text-xs sm:grid-cols-[64px_150px_1fr_92px_60px]"
                  >
                    <span className="font-semibold">{w.label}</span>
                    <span className="hidden truncate text-[10px] text-muted-foreground sm:block">
                      {w.range}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500/80"
                        style={{ width: `${Math.max(3, (w.kg / booked.maxWeekKg) * 100)}%` }}
                      />
                    </div>
                    <span className="text-right font-mono tabular-nums">
                      {w.kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg
                      {showCosts && (
                        <span className="ml-1 block text-[10px] text-muted-foreground">
                          {fmt(w.value)}
                        </span>
                      )}
                    </span>
                    <span className="text-right text-[10px] text-muted-foreground tabular-nums">
                      {pctOfStock.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} %
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
        </div>
      )}






      {/* Kategorisorterare + sök */}
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between">
        <div className="flex items-center gap-2">
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-full lg:w-56 text-xs">
              <SelectValue placeholder="Alla kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Alla produkter ({groups.length})</SelectItem>
              {categories.map(([cat, count]) => (
                <SelectItem key={cat} value={cat}>
                  {cat} ({count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>


        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Sök produkt, kategori eller SKU…"
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                <ListFilter className="h-3.5 w-3.5" /> Filter
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 space-y-2">
              <p className="text-xs font-semibold">Status</p>
              {[
                { v: "all", l: "Alla" },
                { v: "ok", l: "Bra" },
                { v: "low", l: "Lågt lager" },
                { v: "expiring", l: "Utgår inom 5 dagar" },
                { v: "expired", l: "Utgången" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={statusFilter === o.v}
                    onCheckedChange={() => {
                      setStatusFilter(o.v);
                      setPage(1);
                    }}
                  />
                  {o.l}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            <button
              onClick={() => setDense(false)}
              className={cn("h-9 px-2.5", !dense ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              title="Luftig vy"
            >
              <Rows3 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setDense(true)}
              className={cn("h-9 px-2.5", dense ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
              title="Kompakt vy"
            >
              <Rows4 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            variant={familyView ? "default" : "outline"}
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={toggleFamilyView}
            title="Summera samma vara i olika förpackningar"
          >
            <Layers className="h-3.5 w-3.5" /> Visa som familjer
          </Button>
          {headerRight}
        </div>
      </div>

      {familyView ? (
        <FamilyStockView
          products={allProductList as any}
          families={families}
          stockByProduct={stockByProduct}
          orderedByProduct={orderedByProduct}
          search={search}
          category={category}
          
        />
      ) : (
      /* Tabell */
      <Card className="shadow-card overflow-hidden sm:overflow-visible">
        <div className="overflow-x-auto sm:overflow-x-visible">
          <table className="w-full text-xs sm:min-w-[900px]">
            <thead className="sm:sticky sm:top-[var(--stock-subnav-h,52px)] z-20">
              <tr className="border-b border-border bg-background text-[9px] uppercase leading-tight tracking-wider text-muted-foreground shadow-[0_1px_0_0_hsl(var(--border)),0_8px_14px_-14px_hsl(var(--foreground)/0.4)]">
                <th className="hidden w-6 px-1.5 py-2 text-left align-middle font-semibold sm:table-cell">#</th>
                <th className="px-1.5 py-2 text-left align-middle font-semibold">Produkt</th>
                <th className="hidden px-1.5 py-2 text-left align-middle font-semibold sm:table-cell">Kategori</th>
                <th className="hidden px-1.5 py-2 text-left align-middle font-semibold sm:table-cell">Lager</th>
                <th className="px-1.5 py-2 text-right align-middle font-semibold">Totalt</th>
                {showCosts && <th className="hidden px-1.5 py-2 text-right align-middle font-semibold sm:table-cell">Lagervärde</th>}
                <th className="hidden whitespace-nowrap px-1.5 py-2 text-center align-middle font-semibold sm:table-cell">Bäst före</th>
                <th className="hidden whitespace-nowrap px-1.5 py-2 text-center align-middle font-semibold sm:table-cell">Dagar kvar</th>
                <th className="hidden px-1.5 py-2 text-center align-middle font-semibold sm:table-cell">Status</th>
                <th className="w-6 px-1.5 py-2"></th>
              </tr>
            </thead>

            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={showCosts ? 10 : 9} className="p-0">
                    <EmptyState
                      bare
                      icon={<Package2 className="h-4 w-4" />}
                      title="Inget lager att visa"
                      description="Saldo uppstår när en inleverans bokförs, en överföring tas emot eller ett lager inventeras. Rensa filtren om du väntar dig rader här."
                      actionLabel={onEmptyAction ? emptyActionLabel : undefined}
                      onAction={onEmptyAction}
                    />
                  </td>
                </tr>
              )}
              {pageByCategory.map(([cat, list]) => {
                const Icon = CATEGORY_ICONS[cat] || Package2;
                const catCollapsed = collapsedCats.has(cat);
                return [
                  <tr
                    key={`cat-${cat}`}
                    className="bg-muted border-x border-b border-grid-line cursor-pointer hover:bg-muted/70 transition-colors"
                    onClick={() => toggleCat(cat)}
                  >
                    <td colSpan={showCosts ? 10 : 9} className="px-1.5 py-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {catCollapsed ? (
                          <ChevronRight className="h-3 w-3 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3 w-3 shrink-0" />
                        )}
                        <Icon className="h-3 w-3 text-primary" />
                        {cat}
                        <span className="text-muted-foreground/60">{list.length}</span>
                      </span>
                    </td>
                  </tr>,
                  ...(catCollapsed ? [] : list).flatMap((g) => {
                    const idx = filtered.indexOf(g) + 1;
                    const st = STATUS_META[g.status];
                    const isOpen = expanded.has(g.product_id);
                    const rowNodes = [
                      <tr
                        key={g.product_id}
                        className={cn(
                          "border-x border-b border-grid-line bg-card hover:bg-primary/5 transition-colors cursor-pointer",
                          rowH,
                        )}
                        onClick={() => toggleExpand(g.product_id)}
                      >
                        <td className="hidden border-r border-grid-line/70 px-2 text-[11px] text-muted-foreground tabular-nums sm:table-cell">{idx}</td>
                        <td className="border-r border-grid-line/70 px-2">
                          <div className="flex items-center gap-2.5">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <ProductThumb
                              src={g.image_url}
                              alt={g.name}
                              productId={g.product_id}
                              className={cn("shrink-0 rounded-sm", dense ? "h-5 w-6" : "h-6 w-7 sm:h-6 sm:w-8")}
                            />

                            <div className="min-w-0 flex-1">
                              {/* Desktop: namn + SKU staplat */}
                              <div className="hidden sm:block">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="font-semibold text-foreground truncate">{g.name}</span>
                                  {!!photoCounts?.get(g.product_id) && (
                                    <span
                                      className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-primary"
                                      title={`${photoCounts.get(g.product_id)} bild(er)`}
                                    >
                                      <Camera className="h-3 w-3" />
                                      <span className="font-mono tabular-nums">{photoCounts.get(g.product_id)}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">
                                  SKU: {g.sku}
                                </div>
                              </div>
                              {/* Mobil: allt på en horisontell rad */}
                              <div className="flex sm:hidden items-center gap-1.5 min-w-0 whitespace-nowrap">
                                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", st.dot)} />
                                 <span className="font-semibold text-foreground truncate">{g.name}</span>
                                 {!!photoCounts?.get(g.product_id) && (
                                   <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-primary">
                                     <Camera className="h-3 w-3" />
                                     <span className="font-mono tabular-nums">{photoCounts.get(g.product_id)}</span>
                                   </span>
                                 )}
                                 <span className="text-[10px] text-muted-foreground truncate">{g.category}</span>
                                {g.daysLeft !== null && (
                                  <span
                                    className={cn(
                                      "shrink-0 text-[10px] font-medium",
                                      g.daysLeft < 0 || g.daysLeft <= 2
                                        ? "text-destructive"
                                        : g.daysLeft <= 5
                                          ? "text-amber-600"
                                          : "text-emerald-600",
                                    )}
                                  >
                                    {daysLeftLabel(g.daysLeft, g.earliestExpiry, true)}
                                  </span>
                                )}
                              </div>
                            </div>

                          </div>
                        </td>
                        <td className="hidden border-r border-grid-line/70 px-2 text-xs text-muted-foreground whitespace-nowrap sm:table-cell">{g.category}</td>
                        <td className="hidden border-r border-grid-line/70 px-2 sm:table-cell">
                          {(() => {
                          const pk = packedByProduct?.get(g.product_id);
                          const packedKg = pk ? qtyToKg(pk.packed, productsById.get(g.product_id)) : 0;
                          const orderedRestKg = pk ? qtyToKg(pk.ordered, productsById.get(g.product_id)) : 0;
                          const bookedKg = packedKg + orderedRestKg;
                          const packedPct =
                            g.totalKg > 0 ? Math.min(100, (packedKg / g.totalKg) * 100) : 0;
                          const bookedPct =
                            g.totalKg > 0 ? Math.min(100, (bookedKg / g.totalKg) * 100) : 0;
                          return (
                          <div className="min-w-[160px] space-y-1">
                            {/* Full bredd som spår, fyllnaden är andelen av största saldot */}
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/70">
                              <div
                                className="relative flex h-full items-stretch overflow-hidden rounded-full"
                                style={{ width: `${Math.max(4, (g.totalKg / maxKg) * 100)}%` }}
                              >
                                {g.lines.map((l) => {
                                  const kg = qtyToKg(Number(l.quantity) || 0, l.products);
                                  const pct = g.totalKg > 0 ? (kg / g.totalKg) * 100 : 100;
                                  return (
                                    <div
                                      key={l.id}
                                      className={cn(
                                        "h-full",
                                        locationColor.get(l.location_id) || "bg-primary",
                                      )}
                                      style={{ width: `${pct}%` }}
                                      title={`${locName(l)}: ${kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`}
                                    />
                                  );
                                })}
                                {bookedPct > 0 && (
                                  <span
                                    className="pointer-events-none absolute inset-y-0 left-0 z-[9] rounded-l-full bg-foreground/35"
                                    style={{ width: `${bookedPct}%` }}
                                    title={`Beställt: ${bookedKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`}
                                  />
                                )}
                                {packedPct > 0 && (
                                  <span
                                    className="pointer-events-none absolute inset-y-0 left-0 z-10 rounded-l-full bg-amber-400/85"
                                    style={{ width: `${packedPct}%` }}
                                    title={`Packat till order: ${packedKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg`}
                                  />
                                )}
                              </div>
                            </div>
                            {!dense && (
                              <div className="flex items-center justify-between gap-2 text-[10px] leading-none text-muted-foreground">
                                <span className="truncate">
                                  {g.lines.length} lagerplats{g.lines.length > 1 ? "er" : ""}
                                </span>
                                <span className="flex shrink-0 items-center gap-1">
                                  {packedPct > 0 && (
                                    <span className="rounded-sm bg-amber-400/20 px-1.5 py-0.5 font-mono font-semibold tabular-nums text-amber-700">
                                      {packedKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg packat
                                    </span>
                                  )}
                                  {pk && pk.ordered > 0.005 && (
                                    <span className="font-mono tabular-nums">
                                      {pk.ordered.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {pk.unit} best.
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>

                          );
                          })()}
                        </td>
                        <td className="border-r border-grid-line/70 px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          {g.totalQty.toLocaleString("sv-SE", { maximumFractionDigits: g.unit === "st" ? 0 : 1 })} {g.unit}
                        </td>
                        {showCosts && (
                          <td className="hidden border-r border-grid-line/70 px-2 text-right tabular-nums whitespace-nowrap sm:table-cell">{fmt(g.value)}</td>
                        )}
                        <td className="hidden border-r border-grid-line/70 px-2 text-center text-xs text-muted-foreground whitespace-nowrap sm:table-cell">
                          {g.earliestExpiry
                            ? format(parseISO(g.earliestExpiry), "d MMM", { locale: sv })
                            : "–"}
                        </td>
                        <td
                          className={cn(
                            "hidden px-2 text-center text-xs font-medium whitespace-nowrap sm:table-cell",
                            g.daysLeft === null
                              ? "text-muted-foreground"
                              : g.daysLeft < 0
                                ? "text-destructive"
                                : g.daysLeft <= 2
                                  ? "text-destructive"
                                  : g.daysLeft <= 5
                                    ? "text-amber-600"
                                    : "text-emerald-600",
                          )}
                        >
                          {daysLeftLabel(g.daysLeft, g.earliestExpiry)}
                        </td>
                        <td className="hidden px-2 text-center sm:table-cell">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
                              st.text,
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-2 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => toggleExpand(g.product_id)}>
                                {isOpen ? "Stäng lagerplatser" : "Visa lagerplatser"}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onLineAction?.("count", g.lines[0])}>
                                <ClipboardList className="h-3.5 w-3.5 mr-2" /> Inrapportera
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onLineAction?.("move", g.lines[0])}>
                                <Move className="h-3.5 w-3.5 mr-2" /> Flytta
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onLineAction?.("split", g.lines[0])}>
                                <Scissors className="h-3.5 w-3.5 mr-2" /> Splitta
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => onLineAction?.("delete", g.lines[0])}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Radera
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>,
                    ];

                    if (isOpen) {
                      rowNodes.push(
                        <tr key={`${g.product_id}-sub`} className="bg-muted/20 border-b">
                          <td colSpan={showCosts ? 10 : 9} className="px-2 py-2">
                             <div className="space-y-1 w-full max-w-[calc(100vw-2rem)] sm:max-w-none overflow-hidden">

                              {/* Stor lagerstapel — hela saldot per lagerplats, packat och kvar att sälja */}
                              {(() => {
                                const master = productsById.get(g.product_id) || {};
                                const pk = packedByProduct?.get(g.product_id);
                                const packedKg = pk ? qtyToKg(pk.packed, master) : 0;
                                const orderedKg = pk ? qtyToKg(pk.ordered, master) : 0;
                                const packedPct = g.totalKg > 0 ? Math.min(100, (packedKg / g.totalKg) * 100) : 0;
                                 const freeKg = Math.max(0, g.totalKg - packedKg);
                                 const bookedKg = packedKg + orderedKg;
                                 const bookedPct = g.totalKg > 0 ? Math.min(100, (bookedKg / g.totalKg) * 100) : 0;
                                const unitCost = g.totalQty > 0 ? g.value / g.totalQty : 0;
                                const nf = (v: number, d = 1) =>
                                  v.toLocaleString("sv-SE", { maximumFractionDigits: d });
                                return (
                                  <div className="rounded-md border border-border/60 bg-card px-3 py-2.5">
                                    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                                      <div>
                                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                          Lagerstapel
                                        </p>
                                        <p className="font-heading text-xl font-bold tabular-nums">
                                          {nf(g.totalKg)} kg
                                          <span className="ml-2 text-xs font-medium text-muted-foreground">
                                            {g.lines.length} lagerplats{g.lines.length > 1 ? "er" : ""}
                                          </span>
                                        </p>
                                      </div>
                                      {showCosts && (
                                        <span className="text-[11px] text-muted-foreground">
                                          Värde{" "}
                                          <span className="font-mono font-semibold tabular-nums">{fmt(g.value)}</span>
                                        </span>
                                      )}
                                    </div>

                                    {/* Nyckeltal: totalt, beställt, packat, kvar */}
                                    <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                      <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                          Totalt i lager
                                        </p>
                                        <p className="font-mono text-sm font-bold tabular-nums">{nf(g.totalKg)} kg</p>
                                      </div>
                                      <div className="rounded-md border border-foreground/20 bg-foreground/5 px-2 py-1.5">
                                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                                          Beställt totalt
                                        </p>
                                        <p className="font-mono text-sm font-bold tabular-nums">
                                          {nf(bookedKg)} kg
                                          <span className="ml-1 text-[10px] font-medium text-muted-foreground">
                                            {nf(bookedPct, 0)} %
                                          </span>
                                        </p>
                                      </div>
                                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5">
                                        <p className="text-[9px] uppercase tracking-wider text-amber-700">
                                          Packat
                                        </p>
                                        <p className="font-mono text-sm font-bold tabular-nums text-amber-700">
                                          {nf(packedKg)} kg
                                          <span className="ml-1 text-[10px] font-medium">
                                            {nf(packedPct, 0)} %
                                          </span>
                                        </p>
                                      </div>
                                      <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1.5">
                                        <p className="text-[9px] uppercase tracking-wider text-emerald-700">
                                          Kvar att sälja
                                        </p>
                                        <p className="font-mono text-sm font-bold tabular-nums text-emerald-700">
                                          {nf(Math.max(0, g.totalKg - bookedKg))} kg
                                        </p>
                                      </div>
                                    </div>

                                    <div className="relative flex h-9 w-full items-stretch overflow-hidden rounded-md ring-1 ring-border">
                                      {bookedPct > 0 && (
                                        <span
                                          className="pointer-events-none absolute inset-y-0 left-0 z-[9] border-r border-foreground/40 bg-foreground/30"
                                          style={{ width: `${bookedPct}%` }}
                                          title={`Beställt: ${nf(bookedKg)} kg`}
                                        />
                                      )}
                                      {packedPct > 0 && (
                                        <span
                                          className="pointer-events-none absolute inset-y-0 left-0 z-10 border-r-2 border-amber-600 bg-amber-400/80"
                                          style={{ width: `${packedPct}%` }}
                                          title={`Packat till order: ${nf(packedKg)} kg`}
                                        />
                                      )}
                                      {g.lines.map((l) => {
                                        const kg = qtyToKg(Number(l.quantity) || 0, l.products || master);
                                        const pct = g.totalKg > 0 ? (kg / g.totalKg) * 100 : 100;
                                        return (
                                          <div
                                            key={`bar-${l.id}`}
                                            className={cn(
                                              "flex flex-col items-center justify-center overflow-hidden border-r border-white/40 text-[10px] font-semibold leading-tight text-white last:border-r-0",
                                              locationColor.get(l.location_id) || "bg-primary",
                                            )}
                                            style={{ width: `${pct}%` }}
                                            title={`${locName(l)}: ${nf(kg)} kg`}
                                          >
                                            {pct > 12 && <span>{nf(kg, 0)} kg</span>}
                                            {pct > 24 && (
                                              <span className="max-w-full truncate px-1 font-normal opacity-90">
                                                {locName(l)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Förklaring till stapelns zoner */}
                                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Packat {nf(packedKg)} kg
                                      </span>
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2.5 w-2.5 rounded-sm bg-foreground/30" /> Beställt kvar{" "}
                                        {nf(orderedKg)} kg
                                      </span>
                                      <span className="flex items-center gap-1.5">
                                        <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Fritt{" "}
                                        {nf(Math.max(0, g.totalKg - bookedKg))} kg
                                      </span>
                                      <span className="ml-auto">
                                        Differans mot beställt:{" "}
                                        <span className="font-mono font-semibold tabular-nums text-foreground">
                                          {g.totalKg - bookedKg >= 0 ? "+" : "−"}
                                          {nf(Math.abs(g.totalKg - bookedKg))} kg
                                        </span>
                                      </span>
                                    </div>

                                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                      {g.lines.map((l) => {
                                        const qty = Number(l.quantity) || 0;
                                        const kg = qtyToKg(qty, l.products || master);
                                        const pct = g.totalKg > 0 ? (kg / g.totalKg) * 100 : 100;
                                        return (
                                          <div
                                            key={`legend-${l.id}`}
                                            className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1 text-[11px]"
                                          >
                                            <span
                                              className={cn(
                                                "h-2.5 w-2.5 shrink-0 rounded-sm",
                                                locationColor.get(l.location_id) || "bg-primary",
                                              )}
                                            />
                                            <span className="min-w-0 flex-1 truncate">{locName(l)}</span>
                                            <span className="font-mono font-semibold tabular-nums">{nf(kg)} kg</span>
                                            <span className="w-10 text-right text-muted-foreground tabular-nums">
                                              {nf(pct, 0)} %
                                            </span>
                                            {showCosts && (
                                              <span className="w-20 text-right font-mono text-muted-foreground tabular-nums">
                                                {fmt(qty * unitCost)}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })()}


                              {(() => {
                                const master = productsById.get(g.product_id) || {};
                                const famId = master.family_id;
                                const variants = famId
                                  ? allProductList.filter((p: any) => p.family_id === famId)
                                  : [master];
                                return (
                                  <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border/60 bg-card px-2.5 py-1.5">
                                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                                      Förpackningar
                                    </span>
                                    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                                      {variants.map((p: any) => (
                                        <Badge
                                          key={p.id || g.product_id}
                                          variant={p.id === g.product_id ? "default" : "outline"}
                                          className="h-5 shrink-0 whitespace-nowrap text-[10px]"
                                        >
                                          {p.name || g.name} · {p.unit || g.unit}
                                          {p.weight_per_piece ? ` · ${p.weight_per_piece} kg/st` : ""}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {/* Packat och beställt — samma bild som i totallistan. Klick öppnar ordern. */}
                              {(() => {
                                const pk = packedByProduct?.get(g.product_id);
                                if (!pk || pk.orders.length === 0) return null;
                                return (
                                  <div className="rounded-md border border-amber-500/40 bg-amber-400/10 px-2.5 py-1.5">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider text-amber-700">
                                      <span>
                                        Packat
                                        <span className="ml-1 font-mono text-[11px] font-semibold tabular-nums">
                                          {pk.packed.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {pk.unit}
                                        </span>
                                      </span>
                                      <span className="text-muted-foreground">
                                        Beställt
                                        <span className="ml-1 font-mono text-[11px] font-semibold tabular-nums">
                                          {pk.ordered.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {pk.unit}
                                        </span>
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-col gap-1">
                                      {pk.orders.map((o, i) => (
                                        <button
                                          type="button"
                                          key={`${o.orderId}-${o.kind}-${i}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const q = `order=${o.orderId}&line=${g.product_id}&from=stock&t=${Date.now()}`;
                                            navigate(
                                              site === "shop"
                                                ? `/customer-orders?${q}`
                                                : `/orders?${q}`,
                                            );
                                          }}
                                          className="flex w-full items-center gap-2 whitespace-nowrap rounded px-1 py-0.5 text-left text-xs hover:bg-amber-400/20"
                                          title="Öppna ordern"
                                        >
                                          <span
                                            className={cn(
                                              "h-1.5 w-1.5 rounded-full",
                                              o.kind === "packed" ? "bg-amber-500" : "bg-muted-foreground/50",
                                            )}
                                          />
                                          <span className="truncate font-semibold">{o.customerName}</span>
                                          {o.wantedDate && (
                                            <Badge variant="outline" className="h-5 text-[10px]">
                                              {format(parseISO(o.wantedDate), "d MMM", { locale: sv })}
                                            </Badge>
                                          )}
                                          <span className="text-[10px] text-muted-foreground">
                                            {o.kind === "packed" ? "packat" : "beställt"}
                                          </span>
                                          <span
                                            className={cn(
                                              "ml-auto font-mono font-semibold tabular-nums",
                                              o.kind === "packed" ? "text-amber-700" : "text-muted-foreground",
                                            )}
                                          >
                                            {o.quantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {o.unit}
                                          </span>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })()}

                              {g.lines.map((l) => {
                                const kg = qtyToKg(Number(l.quantity) || 0, l.products);
                                const store = l.storage_locations?.stores?.name;
                                return (
                                  <div
                                    key={l.id}
                                    className="flex items-center gap-2 overflow-x-auto whitespace-nowrap rounded-md border border-border/60 bg-card px-2.5 py-1.5"
                                  >

                                    <span
                                      className={cn(
                                        "h-2.5 w-2.5 rounded-full shrink-0",
                                        locationColor.get(l.location_id) || "bg-primary",
                                      )}
                                    />
                                    <span className="text-xs font-medium">{locName(l)}</span>
                                    {store && (
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {store}
                                      </Badge>
                                    )}
                                    {l.storage_locations?.zone && (
                                      <Badge variant="outline" className="text-[10px] h-5">
                                        {l.storage_locations.zone}
                                      </Badge>
                                    )}
                                    <span className="text-xs tabular-nums font-semibold">
                                      {kg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      Ank:{" "}
                                      {l.arrival_date
                                        ? format(parseISO(l.arrival_date), "d MMM", { locale: sv })
                                        : "–"}
                                    </span>
                                    <span className="text-[11px] text-muted-foreground">
                                      B.före:{" "}
                                      {l.expiry_date
                                        ? format(parseISO(l.expiry_date), "d MMM", { locale: sv })
                                        : "–"}
                                    </span>
                                    <div className="ml-auto flex items-center gap-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] gap-1"
                                        onClick={() => onLineAction?.("move", l)}
                                      >
                                        <Move className="h-3 w-3" /> Flytta
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] gap-1"
                                        onClick={() => onLineAction?.("split", l)}
                                      >
                                        <Scissors className="h-3 w-3" /> Splitta
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                        onClick={() => onLineAction?.("waste", l)}
                                      >
                                        <Trash2 className="h-3 w-3" /> Svinn
                                      </Button>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                        onClick={() => onLineAction?.("delete", l)}
                                      >
                                        <Trash2 className="h-3 w-3" /> Radera
                                      </Button>

                                    </div>
                                  </div>
                                );
                              })}

                              {/* Egentagna bilder på produkten */}
                              <div className="rounded-md border border-border/60 bg-card p-2.5">
                                <ProductPhotosGallery productId={g.product_id} productName={g.name} />
                              </div>

                              {/* In- och utflöde över tid för produkten */}
                              <ProductStockFlow
                                productId={g.product_id}
                                productName={g.name}
                                unit={g.unit}
                              />

                              {/* Spårbarhet som rullgardin inne i produkten */}
                              <ProductTraceabilityInline
                                productId={g.product_id}
                                product={productsById.get(g.product_id) || { unit: g.unit }}
                                showCosts={showCosts}
                                fmt={fmt}
                              />

                            </div>
                          </td>
                        </tr>,
                      );
                    }
                    return rowNodes;
                  }),
                ];
              })}
            </tbody>
          </table>
        </div>

        {/* Sidfot / paginering */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Visa
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[15, 30, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)} className="text-xs">
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            per sida
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {filtered.length === 0
                ? "0"
                : `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)}`}{" "}
              av {filtered.length} produkter
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            </Button>
            <span className="text-xs font-semibold tabular-nums px-1">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>
      )}
    </div>
  );
}
