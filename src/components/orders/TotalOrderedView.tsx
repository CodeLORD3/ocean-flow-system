import { Fragment, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  Package,
  Printer,
  Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { ProductThumb } from "@/components/products/ProductThumb";

import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import { CustomerOrder, ORDER_TYPE_LABELS, isoWeekOf } from "@/lib/customerOrders";
import { PRODUCT_CATEGORIES, normalizeCategoryKey } from "@/lib/productCategories";
import { PrintTotalChecklistDialog, type PrintableGroup } from "@/components/orders/PrintTotalChecklistDialog";

/* ------------------------------------------------------------------ hjälpare */

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const parseIso = (s: string) => new Date(s + "T00:00:00");

/** Måndag i samma ISO-vecka som datumet. */
const mondayOf = (d: Date) => {
  const r = new Date(d);
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - (day - 1));
  return r;
};

const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** kg visas med en decimal, styck utan. */
const qtyText = (v: number, unit: string) =>
  Number(v || 0).toLocaleString("sv-SE", {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: unit === "kg" ? 1 : 0,
  });

const dayLabel = (s: string) =>
  parseIso(s)
    .toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .replace(/^./, (c) => c.toUpperCase());

const shortDay = (s: string) =>
  parseIso(s).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

const customerName = (o: CustomerOrder) =>
  o.customers_retail?.name || o.customer_name_snapshot || "Kund utan namn";

const typeLabel = (t?: string | null) =>
  (t && (ORDER_TYPE_LABELS as Record<string, string>)[t]) || "Övrigt";

type OrderLink = {
  orderNumber: string;
  customer: string;
  storeName: string;
  quantity: number;
  orderType: string;
  wantedDate: string;
};

type ProductRow = {
  key: string;
  name: string;
  unit: string;
  total: number;
  /** Summerat radvärde (kr) när priser finns på raderna. */
  value: number;
  category: string;
  productId: string | null;
  imageUrl: string | null;
  orders: OrderLink[];
};


type Group = { key: string; label: string; orderCount: number; rows: ProductRow[] };

const OTHER_CATEGORY = "Övrigt";

/** Kanonisk kategoriordning: skaldjur för sig, fisk för sig osv. Okända sist. */
const categoryRank = (name: string) => {
  const i = (PRODUCT_CATEGORIES as readonly string[]).findIndex(
    (c) => normalizeCategoryKey(c) === normalizeCategoryKey(name),
  );
  return i === -1 ? 999 : i;
};

const compareCategory = (a: string, b: string) =>
  categoryRank(a) - categoryRank(b) || a.localeCompare(b, "sv");

const moneyText = (v: number) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Summerar en produktrad per leveranssätt/hämtsätt. */
function byType(row: ProductRow) {
  const map = new Map<string, { qty: number; orders: number }>();
  for (const o of row.orders) {
    const k = typeLabel(o.orderType);
    const cur = map.get(k) ?? { qty: 0, orders: 0 };
    cur.qty += o.quantity;
    cur.orders += 1;
    map.set(k, cur);
  }
  return [...map.entries()].sort((a, b) => b[1].qty - a[1].qty);
}

/**
 * "Totalt beställt": summerar kundorderrader per produkt och enhet över valda
 * dagar eller veckor, med utfällbar lista över vilka ordrar som ligger bakom.
 * Kilo och styck summeras alltid separat — aldrig konverterat.
 */
export function TotalOrderedView({ storeId }: { storeId: string | null }) {
  const today = iso(new Date());
  const [mode, setMode] = useState<"day" | "week">("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(iso(addDays(new Date(), 7)));
  /** Ibockade enskilda dagar. Finns de, styr de urvalet istället för intervallet. */
  const [picked, setPicked] = useState<string[]>([]);
  const [orderType, setOrderType] = useState("all");
  const [productSearch, setProductSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<"name" | "qty" | "orders" | "value" | "date">("name");
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [showAll, setShowAll] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);


  const bounds = useMemo(() => {
    if (picked.length > 0) {
      const sorted = [...picked].sort();
      return { fromDate: sorted[0], toDate: sorted[sorted.length - 1] };
    }
    return { fromDate: from <= to ? from : to, toDate: to >= from ? to : from };
  }, [picked, from, to]);

  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId,
    orderType,
    fromDate: bounds.fromDate,
    toDate: bounds.toDate,
  });

  const quickRange = (kind: "today" | "thisWeek" | "lastWeek") => {
    setPicked([]);
    const now = new Date();
    if (kind === "today") {
      setFrom(iso(now));
      setTo(iso(now));
      return;
    }
    const monday = mondayOf(now);
    const start = kind === "thisWeek" ? monday : addDays(monday, -7);
    setFrom(iso(start));
    setTo(iso(addDays(start, 6)));
  };

  const { groups, orderCount, productCount, categoryOptions } = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const selected = picked.length > 0 ? new Set(picked) : null;
    const map = new Map<
      string,
      { label: string; sortKey: string; orderIds: Set<string>; rows: Map<string, ProductRow> }
    >();
    const orderIds = new Set<string>();
    const products = new Set<string>();
    const cats = new Set<string>();

    for (const o of orders) {
      if (selected && !selected.has(o.wanted_date)) continue;
      const { week, year } = isoWeekOf(o.wanted_date);
      const groupKey = mode === "day" ? o.wanted_date : `${year}-${String(week).padStart(2, "0")}`;
      const label = mode === "day" ? dayLabel(o.wanted_date) : `Vecka ${week}`;

      for (const l of o.customer_order_lines ?? []) {
        const name = l.products?.name || l.free_text_name || "Okänd vara";
        if (term && !name.toLowerCase().includes(term)) continue;
        const unit = l.unit || l.products?.unit || "st";
        const qty = Number(l.quantity_ordered || 0);
        if (!qty) continue;
        const cat = (l.products?.category || "").trim() || OTHER_CATEGORY;
        cats.add(cat);
        if (category !== "all" && normalizeCategoryKey(cat) !== normalizeCategoryKey(category)) continue;

        const perUnit = l.price_per_unit ?? l.estimated_price_per_unit ?? null;
        const lineValue = Number(l.line_total ?? (perUnit != null ? qty * Number(perUnit) : 0)) || 0;

        const group =
          map.get(groupKey) ??
          { label, sortKey: o.wanted_date, orderIds: new Set<string>(), rows: new Map<string, ProductRow>() };
        const rowKey = `${name}__${unit}`;
        const row: ProductRow =
          group.rows.get(rowKey) ??
          {
            key: rowKey,
            name,
            unit,
            total: 0,
            value: 0,
            category: cat,
            productId: null,
            imageUrl: null,
            orders: [],
          };
        row.productId = row.productId ?? l.products?.id ?? null;
        row.imageUrl = row.imageUrl ?? l.products?.image_url ?? null;
        row.total += qty;
        row.value += lineValue;

        const existing = row.orders.find((x) => x.orderNumber === o.order_number);
        if (existing) existing.quantity += qty;
        else
          row.orders.push({
            orderNumber: o.order_number,
            customer: customerName(o),
            storeName: o.stores?.name ?? "",
            quantity: qty,
            orderType: o.order_type ?? "",
            wantedDate: o.wanted_date,
          });
        group.rows.set(rowKey, row);
        group.orderIds.add(o.id);
        map.set(groupKey, group);
        orderIds.add(o.id);
        products.add(rowKey);
      }
    }

    const earliest = (r: ProductRow) =>
      r.orders.reduce((min, o) => (o.wantedDate < min ? o.wantedDate : min), "9999-12-31");

    const withinCategory = (a: ProductRow, b: ProductRow) => {
      if (sort === "qty") return b.total - a.total;
      if (sort === "orders") return b.orders.length - a.orders.length;
      if (sort === "value") return b.value - a.value;
      if (sort === "date") return earliest(a).localeCompare(earliest(b));
      return a.name.localeCompare(b.name, "sv");
    };

    const list: Group[] = [...map.entries()]
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([key, g]) => ({
        key,
        label: g.label,
        orderCount: g.orderIds.size,
        // Alltid kategori först: skaldjur för sig, fisk för sig — sedan valt sorteringssätt.
        rows: [...g.rows.values()].sort(
          (a, b) => compareCategory(a.category, b.category) || withinCategory(a, b),
        ),
      }));

    return {
      groups: list,
      orderCount: orderIds.size,
      productCount: products.size,
      categoryOptions: [...cats].sort(compareCategory),
    };
  }, [orders, picked, mode, productSearch, sort, category]);


  const exportCsv = () => {
    const rows: string[][] = [
      ["Period", "Kategori", "Produkt", "Enhet", "Mängd", "Värde", "Antal ordrar", "Leveranssätt", "Ordrar"],
    ];
    for (const g of groups)
      for (const r of g.rows)
        rows.push([
          g.label,
          r.category,
          r.name,
          r.unit,
          qtyText(r.total, r.unit),
          moneyText(r.value),
          String(r.orders.length),
          byType(r)
            .map(([t, v]) => `${t} ${qtyText(v.qty, r.unit)} ${r.unit} (${v.orders})`)
            .join(" | "),
          r.orders
            .map((o) => `${o.orderNumber} ${o.customer} (${qtyText(o.quantity, r.unit)} ${r.unit})`)
            .join(" | "),
        ]);
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `totalt-bestallt-${bounds.fromDate}_${bounds.toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Underlag till utskriftsdialogen: en post per dag eller vecka. */
  const printableGroups: PrintableGroup[] = useMemo(
    () =>
      groups.map((g) => ({
        key: g.key,
        label: g.label,
        orderCount: g.orderCount,
        rows: g.rows.map((r) => ({
          name: r.name,
          unit: r.unit,
          total: r.total,
          orderCount: r.orders.length,
          types: byType(r)
            .map(([t, v]) => `${t} ${qtyText(v.qty, r.unit)} (${v.orders})`)
            .join("\n"),
        })),
      })),
    [groups],
  );

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((x) => x !== key) : [...list, key]);

  return (
    <div className="space-y-4">
      <PrintTotalChecklistDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        groups={printableGroups}
        mode={mode}
      />
      {/* Framhävd rubrik: totallistan är första steget i packflödet */}
      <Card className="overflow-hidden border-primary/30 bg-primary/5 shadow-sm">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="rounded-xl bg-primary/15 p-2.5 ring-1 ring-inset ring-primary/25">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              Totallista — allt som är beställt
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              Steg 1: sortera och packa upp varorna i totala mängder per produkt. Steg 2: packa varje enskild
              beställning från orderlistan.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Kontrollpaneler: vygruppering, datumval, filter */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              1. Vygruppering
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as "day" | "week")}
              className="gap-1"
            >
              <ToggleGroupItem value="day" className="h-10 gap-1.5 px-3 text-xs">
                <CalendarDays className="h-4 w-4" /> Dagligen
              </ToggleGroupItem>
              <ToggleGroupItem value="week" className="h-10 gap-1.5 px-3 text-xs">
                <CalendarDays className="h-4 w-4" /> Veckovis
              </ToggleGroupItem>
            </ToggleGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              2. Datumval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => quickRange("today")}>
                Idag
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => quickRange("thisWeek")}>
                Denna vecka
              </Button>
              <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => quickRange("lastWeek")}>
                Förra veckan
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[140px] flex-1 space-y-1 sm:flex-none">
                <div className="text-[11px] text-muted-foreground">Från och med</div>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPicked([]);
                    setFrom(e.target.value);
                  }}
                  className="h-11 w-full text-xs sm:h-9 sm:w-[140px]"
                />
              </div>
              <div className="min-w-[140px] flex-1 space-y-1 sm:flex-none">
                <div className="text-[11px] text-muted-foreground">Till och med</div>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPicked([]);
                    setTo(e.target.value);
                  }}
                  className="h-11 w-full text-xs sm:h-9 sm:w-[140px]"
                />
              </div>

              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">Eller välj specifika dagar</div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
                      <CalendarDays className="h-4 w-4" />
                      {picked.length > 0 ? `${picked.length} dagar valda` : "Välj dagar"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <Calendar
                      mode="multiple"
                      weekStartsOn={1}
                      selected={picked.map(parseIso)}
                      onSelect={(dates) => setPicked((dates ?? []).map(iso).sort())}
                    />
                    {picked.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-8 w-full text-xs"
                        onClick={() => setPicked([])}
                      >
                        Rensa valda dagar
                      </Button>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {picked.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {picked.map((d) => (
                  <Badge key={d} variant="secondary" className="text-[11px]">
                    {shortDay(d)}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              3. Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Leveranssätt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla leveranssätt</SelectItem>
                <SelectItem value="upphamtning">Upphämtning</SelectItem>
                <SelectItem value="leverans">Leverans</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla kategorier</SelectItem>
                {categoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="h-10 text-xs">
                <SelectValue placeholder="Sortering" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Kategori → namn (A–Ö)</SelectItem>
                <SelectItem value="qty">Kategori → största mängd</SelectItem>
                <SelectItem value="orders">Kategori → flest ordrar</SelectItem>
                <SelectItem value="value">Kategori → högst värde</SelectItem>
                <SelectItem value="date">Kategori → tidigast datum</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Sök produkt…"
                className="h-10 pl-8 text-xs"
              />
            </div>

          </CardContent>
        </Card>
      </div>

      {/* Sammanfattning */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="flex flex-wrap items-center gap-4 py-4 sm:gap-8 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 ring-1 ring-inset ring-primary/20">
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Unika ordrar</div>
              <div className="font-mono text-2xl font-semibold leading-none tabular-nums">{orderCount} st</div>
              <div className="text-[11px] text-muted-foreground">i valt urval</div>
            </div>
          </div>
          <div className="hidden h-12 w-px bg-border/70 sm:block" />
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-accent/50 p-2.5 ring-1 ring-inset ring-border/60">
              <Package className="h-5 w-5 text-accent-foreground" />
            </div>
            <div className="space-y-0.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Olika produkter</div>
              <div className="font-mono text-2xl font-semibold leading-none tabular-nums">{productCount} st</div>
              <div className="text-[11px] text-muted-foreground">i valt urval</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-11 w-full gap-1.5 rounded-lg text-xs sm:ml-auto sm:h-10 sm:w-auto"
            onClick={exportCsv}
          >
            <Download className="h-4 w-4" /> Exportera till Excel/CSV
          </Button>
          <Button
            size="sm"
            className="h-12 w-full gap-2 rounded-lg text-sm font-semibold sm:h-11 sm:w-auto"
            onClick={() => setPrintOpen(true)}
            disabled={groups.length === 0}
          >
            <Printer className="h-5 w-5" /> Skriv ut lista
          </Button>

        </CardContent>
      </Card>



      {!isLoading && groups.length === 0 ? (
        <EmptyState
          title="Inget beställt i urvalet"
          description="Välj andra dagar eller ändra filtren för att se totalt beställda mängder."
        />
      ) : (
        groups.map((g) => {
          const groupOpen = !closedGroups.includes(g.key);
          return (
            <Card key={g.key} className="overflow-hidden border-border/60 shadow-sm">
              <CardHeader className="border-b border-border/60 bg-muted/30 py-3">
                <button
                  type="button"
                  onClick={() => toggle(closedGroups, setClosedGroups, g.key)}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <div className="rounded-lg bg-background p-1.5 ring-1 ring-inset ring-border/60">
                    <CalendarDays className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-base capitalize tracking-tight">{g.label}</CardTitle>
                  <Badge variant="secondary" className="rounded-full text-[11px] font-normal">
                    {g.orderCount} ordrar
                  </Badge>
                  {groupOpen ? (
                    <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </CardHeader>

              {groupOpen && (
                <CardContent className="space-y-0 px-3 pt-0 md:px-4">
                  {/* Kolumnrubriker */}
                  <div className="hidden items-center gap-2 border-b border-border/60 px-1 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground md:flex">
                    <span className="w-5" />
                    <span className="min-w-0 flex-1">Produkt</span>
                    <button
                      type="button"
                      onClick={() => setSort(sort === "qty" ? "name" : "qty")}
                      className="flex w-28 items-center justify-end gap-1 transition-colors hover:text-foreground"
                    >
                      Mängd {sort === "qty" ? "↓" : "↕"}
                    </button>
                    <span className="w-20 text-right">Ordrar</span>
                  </div>


                  {g.rows.map((r, i) => {
                    const key = `${g.key}-${r.key}`;
                    const isOpen = openRows.includes(key);
                    const types = byType(r);
                    const expanded = showAll.includes(key);
                    const visible = expanded ? r.orders : r.orders.slice(0, 5);
                    const newCategory = i === 0 || g.rows[i - 1].category !== r.category;
                    const catRows = g.rows.filter((x) => x.category === r.category);
                    return (
                      <Fragment key={key}>
                        {newCategory && (
                          <div className="mt-1 flex items-center gap-1.5 border-b border-border/40 bg-muted/25 px-1.5 py-0.5 first:mt-0">
                            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {r.category}
                            </span>
                            <span className="text-[9px] tabular-nums text-muted-foreground/70">
                              {catRows.length} varor
                            </span>
                            <span className="ml-auto font-mono text-[9px] tabular-nums text-muted-foreground/70">
                              {catRows.reduce((n, x) => n + x.orders.length, 0)} rader
                            </span>
                          </div>
                        )}
                      <div
                        className={`border-b border-border/50 ${isOpen ? "bg-muted/20" : ""}`}
                      >

                        <button
                          type="button"
                          onClick={() => toggle(openRows, setOpenRows, key)}
                          className="flex w-full items-center gap-2 overflow-hidden rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/40"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3 shrink-0 text-primary" />
                          ) : (
                            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          {/* Produktbilden alltid först på varan */}
                          <ProductThumb
                            src={r.imageUrl}
                            alt={r.name}
                            productId={r.productId}
                            static
                            className="h-6 w-8 shrink-0 rounded"
                          />
                          <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-tight md:text-xs">
                            {r.name}
                          </span>

                          <span className="shrink-0 whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular-nums text-primary md:w-28 md:text-xs">
                            {qtyText(r.total, r.unit)} {r.unit}
                          </span>
                          <span className="shrink-0 whitespace-nowrap text-right font-mono text-[10px] tabular-nums text-muted-foreground md:w-20 md:text-[11px]">
                            {r.orders.length} st
                          </span>

                        </button>




                        {isOpen && (
                          <div className="grid gap-3 pb-3 pl-2 pr-1 md:pl-6 lg:grid-cols-[1fr,280px]">
                            <div className="rounded-md border border-border/60">
                              <div className="border-b border-border/60 px-2 py-1.5 text-[11px] font-medium text-muted-foreground">
                                Detaljerade ordrar ({r.orders.length} st)
                              </div>
                              <div className="divide-y divide-border/40">
                                {visible.map((o) => (
                                  <div
                                    key={`${key}-${o.orderNumber}`}
                                    className="grid grid-cols-[auto,1fr] items-baseline gap-x-2 gap-y-0.5 px-2 py-2 text-xs md:flex md:flex-wrap md:py-1.5"
                                  >
                                    <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                                    <span className="min-w-0 truncate md:flex-1">{o.customer}</span>
                                    <span className="col-span-2 flex flex-wrap items-baseline gap-2 md:contents">
                                      <span className="font-mono tabular-nums">
                                        {qtyText(o.quantity, r.unit)} {r.unit}
                                      </span>
                                      <span className="text-muted-foreground">{typeLabel(o.orderType)}</span>
                                      <span className="font-mono text-muted-foreground">{o.wantedDate}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {r.orders.length > 5 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-full text-xs"
                                  onClick={() => toggle(showAll, setShowAll, key)}
                                >
                                  {expanded
                                    ? "Visa färre"
                                    : `Visa alla ${r.orders.length} ordrar`}
                                </Button>
                              )}
                            </div>

                            <div className="rounded-md border border-border/60 p-2">
                              <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                Summering för {r.name}
                              </div>
                              {types.map(([t, v]) => (
                                <div key={t} className="flex items-baseline justify-between gap-2 py-0.5 text-xs">
                                  <span>{t}</span>
                                  <span className="font-mono tabular-nums">
                                    {qtyText(v.qty, r.unit)} {r.unit}
                                  </span>
                                  <span className="text-muted-foreground">
                                    ({v.orders} {v.orders === 1 ? "order" : "ordrar"})
                                  </span>
                                </div>
                              ))}
                              <div className="mt-1 flex items-baseline justify-between gap-2 border-t border-border/60 pt-1 text-xs font-semibold">
                                <span>Totalt</span>
                                <span className="font-mono tabular-nums">
                                  {qtyText(r.total, r.unit)} {r.unit}
                                </span>
                                <span className="font-normal text-muted-foreground">
                                  ({r.orders.length} ordrar)
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      </Fragment>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })
      )}
    </div>
  );
}
