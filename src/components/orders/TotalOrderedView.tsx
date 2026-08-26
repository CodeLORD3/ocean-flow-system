import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import { CustomerOrder, isoWeekOf } from "@/lib/customerOrders";

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
    .toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })
    .replace(/^./, (c) => c.toUpperCase());

const shortDay = (s: string) =>
  parseIso(s).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });

const customerName = (o: CustomerOrder) =>
  o.customers_retail?.name || o.customer_name_snapshot || "Kund utan namn";

type ProductRow = {
  key: string;
  name: string;
  unit: string;
  total: number;
  orders: { orderNumber: string; customer: string; storeName: string; quantity: number }[];
};

type Group = { key: string; label: string; rows: ProductRow[] };

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
  const [sort, setSort] = useState<"name" | "qty">("name");
  const [open, setOpen] = useState<string[]>([]);

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

  const togglePicked = (dates: Date[] | undefined) =>
    setPicked((dates ?? []).map(iso).sort());

  const { groups, orderCount, productCount } = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const selected = picked.length > 0 ? new Set(picked) : null;
    const map = new Map<string, { label: string; sortKey: string; rows: Map<string, ProductRow> }>();
    const orderIds = new Set<string>();
    const products = new Set<string>();

    for (const o of orders) {
      if (selected && !selected.has(o.wanted_date)) continue;
      const groupKey = mode === "day" ? o.wanted_date : `${isoWeekOf(o.wanted_date).year}-${String(isoWeekOf(o.wanted_date).week).padStart(2, "0")}`;
      const label =
        mode === "day"
          ? dayLabel(o.wanted_date)
          : `Vecka ${isoWeekOf(o.wanted_date).week}`;

      for (const l of o.customer_order_lines ?? []) {
        const name = l.products?.name || l.free_text_name || "Okänd vara";
        if (term && !name.toLowerCase().includes(term)) continue;
        const unit = l.unit || l.products?.unit || "st";
        const qty = Number(l.quantity_ordered || 0);
        if (!qty) continue;

        const group =
          map.get(groupKey) ?? { label, sortKey: o.wanted_date, rows: new Map<string, ProductRow>() };
        const rowKey = `${name}__${unit}`;
        const row =
          group.rows.get(rowKey) ?? { key: rowKey, name, unit, total: 0, orders: [] };
        row.total += qty;
        const existing = row.orders.find((x) => x.orderNumber === o.order_number);
        if (existing) existing.quantity += qty;
        else
          row.orders.push({
            orderNumber: o.order_number,
            customer: customerName(o),
            storeName: o.stores?.name ?? "",
            quantity: qty,
          });
        group.rows.set(rowKey, row);
        map.set(groupKey, group);
        orderIds.add(o.id);
        products.add(rowKey);
      }
    }

    const list: Group[] = [...map.entries()]
      .sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey))
      .map(([key, g]) => ({
        key,
        label: g.label,
        rows: [...g.rows.values()].sort((a, b) =>
          sort === "qty" ? b.total - a.total : a.name.localeCompare(b.name, "sv"),
        ),
      }));

    return { groups: list, orderCount: orderIds.size, productCount: products.size };
  }, [orders, picked, mode, productSearch, sort]);

  const exportCsv = () => {
    const rows: string[][] = [["Period", "Produkt", "Enhet", "Mängd", "Antal ordrar", "Ordrar"]];
    for (const g of groups)
      for (const r of g.rows)
        rows.push([
          g.label,
          r.name,
          r.unit,
          qtyText(r.total, r.unit),
          String(r.orders.length),
          r.orders.map((o) => `${o.orderNumber} ${o.customer} (${qtyText(o.quantity, r.unit)})`).join(" | "),
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

  const toggleOpen = (key: string) =>
    setOpen((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Urval</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              value={mode}
              onValueChange={(v) => v && setMode(v as "day" | "week")}
              className="gap-1"
            >
              <ToggleGroupItem value="day" className="h-10 px-3 text-xs">
                Dagligen
              </ToggleGroupItem>
              <ToggleGroupItem value="week" className="h-10 px-3 text-xs">
                Veckovis
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-10 text-xs" onClick={() => quickRange("today")}>
                Idag
              </Button>
              <Button variant="outline" size="sm" className="h-10 text-xs" onClick={() => quickRange("thisWeek")}>
                Denna vecka
              </Button>
              <Button variant="outline" size="sm" className="h-10 text-xs" onClick={() => quickRange("lastWeek")}>
                Förra veckan
              </Button>
            </div>

            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="h-10 w-[160px] text-xs">
                <SelectValue placeholder="Ordertyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla typer</SelectItem>
                <SelectItem value="upphamtning">Upphämtning</SelectItem>
                <SelectItem value="leverans">Leverans</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Sök produktnamn"
                className="h-10 pl-8 text-xs"
              />
            </div>

            <Button variant="outline" size="sm" className="h-10 gap-1.5 text-xs" onClick={exportCsv}>
              <Download className="h-4 w-4" /> Exportera CSV
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-[auto,1fr]">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                Bocka i enskilda dagar (styr urvalet)
              </div>
              <Calendar
                mode="multiple"
                weekStartsOn={1}
                selected={picked.map(parseIso)}
                onSelect={togglePicked}
                className="rounded-md border p-2"
              />
              {picked.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {picked.map((d) => (
                    <Badge key={d} variant="secondary" className="text-[11px]">
                      {shortDay(d)}
                    </Badge>
                  ))}
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPicked([])}>
                    Rensa dagar
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Datumintervall</div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => {
                    setPicked([]);
                    setFrom(e.target.value);
                  }}
                  className="h-10 w-[150px] text-xs"
                />
                <span className="text-xs text-muted-foreground">till</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => {
                    setPicked([]);
                    setTo(e.target.value);
                  }}
                  className="h-10 w-[150px] text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="font-mono tabular-nums">
                  {orderCount} ordrar
                </Badge>
                <Badge variant="outline" className="font-mono tabular-nums">
                  {productCount} produkter
                </Badge>
                {picked.length > 0 && (
                  <Badge variant="secondary">{picked.length} valda dagar</Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!isLoading && groups.length === 0 ? (
        <EmptyState
          title="Inget beställt i urvalet"
          description="Välj andra dagar eller ändra filtren för att se totalt beställda mängder."
        />
      ) : (
        groups.map((g) => (
          <Card key={g.key}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base capitalize">
                <span>{g.label}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] font-normal text-muted-foreground"
                  onClick={() => setSort(sort === "qty" ? "name" : "qty")}
                >
                  Mängd {sort === "qty" ? "↓" : "–"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {g.rows.map((r) => {
                const key = `${g.key}-${r.key}`;
                const isOpen = open.includes(key);
                return (
                  <div key={key} className="border-b border-border/60 pb-1 last:border-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() => toggleOpen(key)}
                      className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left hover:bg-muted/50"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                      <Badge variant="outline" className="shrink-0 text-[11px]">
                        {r.orders.length} ordrar
                      </Badge>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                        {qtyText(r.total, r.unit)} {r.unit}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="space-y-1 pb-2 pl-7 pr-1">
                        {r.orders.map((o) => (
                          <div
                            key={`${key}-${o.orderNumber}`}
                            className="flex flex-wrap items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                            <span className="min-w-0 flex-1 truncate">{o.customer}</span>
                            {o.storeName && (
                              <span className="text-muted-foreground">{o.storeName}</span>
                            )}
                            <span className="font-mono tabular-nums">
                              {qtyText(o.quantity, r.unit)} {r.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
