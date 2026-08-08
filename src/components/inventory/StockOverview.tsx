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
  ClipboardList,
  Snowflake,
  Fish,
  Sparkles,
  Package2,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
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

export type StockLineAction = "move" | "delete" | "split" | "count";

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
  /** Åtgärd i tomt tillstånd, t.ex. gå till inleveranser. */
  onEmptyAction?: () => void;
  emptyActionLabel?: string;
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

function qtyToKg(quantity: number, product: any): number {
  if (!product) return quantity;
  const unit = (product.unit || "kg").toLowerCase();
  if (unit === "st" && Number(product.weight_per_piece) > 0) {
    return quantity * Number(product.weight_per_piece);
  }
  return quantity;
}

type Status = "ok" | "warning" | "critical" | "expired" | "low";

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
  onEmptyAction,
  emptyActionLabel = "Registrera inleverans",
}: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("__all__");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dense, setDense] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
      g.totalKg += qtyToKg(qty, p);
      const unitPrice = Number(r.unit_cost) || Number(p.cost_price) || Number(master.cost_price) || 0;
      g.value += qty * unitPrice;
      g.minStock += Number(r.min_stock) || 0;
      if (r.expiry_date && (!g.earliestExpiry || r.expiry_date < g.earliestExpiry)) {
        g.earliestExpiry = r.expiry_date;
      }
    }
    const list = Array.from(map.values());
    for (const g of list) {
      g.daysLeft = g.earliestExpiry ? differenceInDays(parseISO(g.earliestExpiry), new Date()) : null;
      const low = g.minStock > 0 && g.totalKg < g.minStock;
      g.status = statusOf(g.daysLeft, low);
      g.lines.sort((a, b) => (a.expiry_date || "9999").localeCompare(b.expiry_date || "9999"));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [rows, productsById]);

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
        if (statusFilter === "low" && !(g.minStock > 0 && g.totalKg < g.minStock)) return false;
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
    const low = filtered.filter((g) => g.minStock > 0 && g.totalKg < g.minStock).length;
    const critical = filtered.filter((g) => g.daysLeft !== null && g.daysLeft <= 2).length;
    return { value, qty, count: filtered.length, low, critical };
  }, [filtered]);

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
  const rowH = dense ? "h-9" : "h-[52px]";

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
      {/* KPI-kort */}
      <div className={cn("grid grid-cols-2 gap-3", showCosts ? "lg:grid-cols-5" : "lg:grid-cols-4")}>
        {showCosts && (
          <Card className="shadow-card">
            <CardContent className="p-3 space-y-1">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-primary" /> Totalt lagervärde
              </p>
              <p className="text-2xl font-heading font-bold tabular-nums">{fmt(kpis.value)}</p>
              <p className="text-[10px] text-muted-foreground">Kostnadsbaserat ({currency})</p>
            </CardContent>
          </Card>
        )}
        <Card className="shadow-card">
          <CardContent className="p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Boxes className="h-3.5 w-3.5 text-primary" /> Total kvantitet
            </p>
            <p className="text-2xl font-heading font-bold tabular-nums">
              {kpis.qty.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kg
            </p>
            <p className="text-[10px] text-muted-foreground">Omräknat till kg</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5 text-primary" /> Antal produkter
            </p>
            <p className="text-2xl font-heading font-bold tabular-nums">{kpis.count}</p>
            <p className="text-[10px] text-muted-foreground">{rows.length} lagerrader</p>
          </CardContent>
        </Card>
        <Card className={cn("shadow-card", kpis.low > 0 && "border-amber-500/30 bg-amber-500/5")}>
          <CardContent className="p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> Lågt lager
            </p>
            <p className={cn("text-2xl font-heading font-bold tabular-nums", kpis.low > 0 && "text-amber-600")}>
              {kpis.low}
            </p>
            <p className="text-[10px] text-muted-foreground">{kpis.low} produkter under min</p>
          </CardContent>
        </Card>
        <Card className={cn("shadow-card", kpis.critical > 0 && "border-destructive/30 bg-destructive/5")}>
          <CardContent className="p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-destructive" /> Utgångna/kritiska
            </p>
            <p
              className={cn(
                "text-2xl font-heading font-bold tabular-nums",
                kpis.critical > 0 && "text-destructive",
              )}
            >
              {kpis.critical}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {kpis.critical > 0 ? "Kräver åtgärd" : "Inga varningar"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Kategoriflikar + sök */}
      <div className="flex flex-col lg:flex-row gap-2 lg:items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => {
              setCategory("__all__");
              setPage(1);
            }}
            className={cn(
              "shrink-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors border",
              category === "__all__"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-card text-foreground border-border hover:bg-muted",
            )}
          >
            Alla produkter
            <span
              className={cn(
                "text-xs tabular-nums",
                category === "__all__" ? "text-primary-foreground/70" : "text-muted-foreground",
              )}
            >
              {groups.length}
            </span>
          </button>
          {categories.map(([cat, count]) => {
            const Icon = CATEGORY_ICONS[cat] || Package2;
            const active = category === cat;
            return (
              <button
                key={cat}
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors border",
                  active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-foreground border-border hover:bg-muted",
                )}
              >
                <Icon className="h-3.5 w-3.5 opacity-70" />
                {cat}
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    active ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
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
          {headerRight}
        </div>
      </div>

      {/* Tabell */}
      <Card className="shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-2 py-2 text-left font-medium">#</th>
                <th className="px-2 py-2 text-left font-medium">Produkt</th>
                <th className="px-2 py-2 text-left font-medium">Kategori</th>
                <th className="px-2 py-2 text-left font-medium">Lager (kg)</th>
                <th className="px-2 py-2 text-right font-medium">Totalt</th>
                {showCosts && <th className="px-2 py-2 text-right font-medium">Lagervärde</th>}
                <th className="px-2 py-2 text-center font-medium">Bäst före</th>
                <th className="px-2 py-2 text-center font-medium">Dagar kvar</th>
                <th className="px-2 py-2 text-center font-medium">Status</th>
                <th className="w-8 px-2 py-2"></th>
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
                return [
                  <tr key={`cat-${cat}`} className="bg-muted/30 border-b">
                    <td colSpan={showCosts ? 10 : 9} className="px-2 py-1.5">
                      <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {cat}
                        <span className="text-muted-foreground/60">{list.length}</span>
                      </span>
                    </td>
                  </tr>,
                  ...list.flatMap((g) => {
                    const idx = filtered.indexOf(g) + 1;
                    const st = STATUS_META[g.status];
                    const isOpen = expanded.has(g.product_id);
                    const rowNodes = [
                      <tr
                        key={g.product_id}
                        className={cn(
                          "border-b border-border/50 hover:bg-primary/5 transition-colors cursor-pointer",
                          rowH,
                        )}
                        onClick={() => toggleExpand(g.product_id)}
                      >
                        <td className="px-2 text-[11px] text-muted-foreground tabular-nums">{idx}</td>
                        <td className="px-2">
                          <div className="flex items-center gap-2.5">
                            {isOpen ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            {!dense && (
                              <ProductThumb src={g.image_url} alt={g.name} className="w-11 h-8" />
                            )}
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground truncate">{g.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate">
                                SKU: {g.sku}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 text-xs text-muted-foreground whitespace-nowrap">{g.category}</td>
                        <td className="px-2">
                          <div className="min-w-[180px]">
                            <div
                              className="flex items-stretch gap-0.5 h-5 rounded-sm overflow-hidden"
                              style={{ width: `${Math.max(12, (g.totalKg / maxKg) * 100)}%` }}
                            >
                              {g.lines.map((l) => {
                                const kg = qtyToKg(Number(l.quantity) || 0, l.products);
                                const pct = g.totalKg > 0 ? (kg / g.totalKg) * 100 : 100;
                                return (
                                  <div
                                    key={l.id}
                                    className={cn(
                                      "flex items-center justify-center text-[9px] font-semibold text-white overflow-hidden",
                                      locationColor.get(l.location_id) || "bg-primary",
                                    )}
                                    style={{ width: `${pct}%` }}
                                    title={`${locName(l)}: ${kg.toLocaleString("sv-SE")} kg`}
                                  >
                                    {pct > 18
                                      ? `${kg.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kg`
                                      : ""}
                                  </div>
                                );
                              })}
                            </div>
                            {!dense && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {g.lines.length} lagerplats{g.lines.length > 1 ? "er" : ""}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-2 text-right font-semibold tabular-nums whitespace-nowrap">
                          {g.totalKg.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} kg
                        </td>
                        {showCosts && (
                          <td className="px-2 text-right tabular-nums whitespace-nowrap">{fmt(g.value)}</td>
                        )}
                        <td className="px-2 text-center text-xs text-muted-foreground whitespace-nowrap">
                          {g.earliestExpiry
                            ? format(parseISO(g.earliestExpiry), "d MMM", { locale: sv })
                            : "–"}
                        </td>
                        <td
                          className={cn(
                            "px-2 text-center text-xs font-medium whitespace-nowrap",
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
                          {g.daysLeft === null
                            ? "–"
                            : g.daysLeft < 0
                              ? `${Math.abs(g.daysLeft)} d sen`
                              : `${g.daysLeft} dag${g.daysLeft === 1 ? "" : "ar"}`}
                        </td>
                        <td className="px-2 text-center">
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
                        </td>
                      </tr>,
                    ];

                    if (isOpen) {
                      rowNodes.push(
                        <tr key={`${g.product_id}-sub`} className="bg-muted/20 border-b">
                          <td></td>
                          <td colSpan={9} className="px-2 py-2">
                            <div className="space-y-1">
                              {g.lines.map((l) => {
                                const kg = qtyToKg(Number(l.quantity) || 0, l.products);
                                const store = l.storage_locations?.stores?.name;
                                return (
                                  <div
                                    key={l.id}
                                    className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 bg-card px-2.5 py-1.5"
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
                                        onClick={() => onLineAction?.("delete", l)}
                                      >
                                        <Trash2 className="h-3 w-3" /> Radera
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
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
    </div>
  );
}
