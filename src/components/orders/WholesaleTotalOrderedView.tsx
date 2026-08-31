import { Fragment, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  ListChecks,
  Package,
  Printer,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { ProductThumb } from "@/components/products/ProductThumb";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const parseIso = (value: string) => new Date(`${value}T00:00:00`);
const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};
const mondayOf = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setDate(next.getDate() - day + 1);
  return next;
};
const orderDate = (order: any) =>
  order.desired_delivery_date || order.shop_order_lines?.find((line: any) => line.delivery_date)?.delivery_date || order.created_at?.slice(0, 10) || "";
const dayLabel = (value: string) => {
  if (!value) return "Utan leveransdatum";
  const text = parseIso(value).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const qtyText = (value: number, unit: string) =>
  Number(value || 0).toLocaleString("sv-SE", { minimumFractionDigits: unit?.toLowerCase() === "kg" ? 1 : 0, maximumFractionDigits: 1 });
const moneyText = (value: number) => Number(value || 0).toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const isoWeek = (value: string) => {
  const date = parseIso(value || iso(new Date()));
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7), year: utc.getUTCFullYear() };
};

type OrderLink = {
  id: string;
  orderNumber: string;
  storeName: string;
  quantity: number;
  value: number;
  wantedDate: string;
};
type ProductRow = {
  key: string;
  productId: string | null;
  imageUrl: string | null;
  name: string;
  category: string;
  unit: string;
  total: number;
  value: number;
  lineIds: string[];
  statuses: string[];
  orders: OrderLink[];
};
type Group = { key: string; label: string; orderCount: number; rows: ProductRow[] };

const statusOptions = ["", "Pågående", "Beställd", "Producerad", "Packad", "Skickad", "Ej tillgänglig"];

export function WholesaleTotalOrderedView({
  orders,
  onOpenOrder,
  onStatusChange,
}: {
  orders: any[];
  onOpenOrder?: (orderId: string, productName: string) => void;
  onStatusChange?: (product: { product_name: string; lineIds: string[] }, status: string) => void;
}) {
  const today = iso(new Date());
  const [mode, setMode] = useState<"day" | "week">("day");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(iso(addDays(new Date(), 7)));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [store, setStore] = useState("all");
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [closedGroups, setClosedGroups] = useState<string[]>([]);
  const [showAll, setShowAll] = useState<string[]>([]);

  const stores = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((order) => order.stores?.name && map.set(order.store_id, order.stores.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "sv"));
  }, [orders]);

  const activeOrders = useMemo(() => orders.filter((order) => !["Avbruten", "Levererad", "Klar / Levererad", "Arkiverad"].includes(order.status)), [orders]);
  const rangeOrders = useMemo(() => activeOrders.filter((order) => {
    const date = orderDate(order);
    return (!from || date >= from) && (!to || date <= to) && (store === "all" || order.store_id === store);
  }), [activeOrders, from, to, store]);

  const { groups, categories, productCount, totalValue, orderCount } = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("sv");
    const categorySet = new Set<string>();
    const map = new Map<string, { label: string; sortKey: string; orderIds: Set<string>; rows: Map<string, ProductRow> }>();
    const countedOrders = new Set<string>();
    let value = 0;

    rangeOrders.forEach((order) => {
      const date = orderDate(order);
      const week = isoWeek(date);
      const groupKey = mode === "day" ? date : `${week.year}-${String(week.week).padStart(2, "0")}`;
      const group = map.get(groupKey) ?? { label: mode === "day" ? dayLabel(date) : `Vecka ${week.week}`, sortKey: date, orderIds: new Set<string>(), rows: new Map<string, ProductRow>() };
      let hasVisibleLine = false;
      (order.shop_order_lines || []).forEach((line: any) => {
        const name = line.products?.name || "Okänd vara";
        const lineCategory = line.products?.category || "Övrigt";
        categorySet.add(lineCategory);
        if (term && !name.toLocaleLowerCase("sv").includes(term)) return;
        if (category !== "all" && lineCategory !== category) return;
        const quantity = Number(line.quantity_ordered || 0);
        if (!quantity) return;
        hasVisibleLine = true;
        const unit = line.unit || line.products?.unit || "st";
        const price = Number(line.products?.wholesale_price || line.cost_at_order || 0);
        const lineValue = quantity * price;
        value += lineValue;
        const key = `${line.product_id || name}__${unit}`;
        const row = group.rows.get(key) ?? {
          key,
          productId: line.products?.id || line.product_id || null,
          imageUrl: line.products?.image_url || null,
          name,
          category: lineCategory,
          unit,
          total: 0,
          value: 0,
          lineIds: [],
          statuses: [],
          orders: [],
        };
        row.total += quantity;
        row.value += lineValue;
        row.lineIds.push(line.id);
        if (line.status && !row.statuses.includes(line.status)) row.statuses.push(line.status);
        const previous = row.orders.find((item) => item.id === order.id);
        if (previous) {
          previous.quantity += quantity;
          previous.value += lineValue;
        } else {
          row.orders.push({ id: order.id, orderNumber: order.order_number || order.id.slice(0, 8), storeName: order.stores?.name || "Okänd butik", quantity, value: lineValue, wantedDate: date });
        }
        group.rows.set(key, row);
      });
      if (hasVisibleLine) {
        group.orderIds.add(order.id);
        countedOrders.add(order.id);
        map.set(groupKey, group);
      }
    });

    const sortedGroups: Group[] = [...map.entries()].sort((a, b) => a[1].sortKey.localeCompare(b[1].sortKey)).map(([key, group]) => ({
      key,
      label: group.label,
      orderCount: group.orderIds.size,
      rows: [...group.rows.values()].sort((a, b) => a.category.localeCompare(b.category, "sv") || b.total - a.total || a.name.localeCompare(b.name, "sv")),
    }));
    return { groups: sortedGroups, categories: [...categorySet].sort((a, b) => a.localeCompare(b, "sv")), productCount: new Set(sortedGroups.flatMap((group) => group.rows.map((row) => row.key))).size, totalValue: value, orderCount: countedOrders.size };
  }, [rangeOrders, mode, search, category]);

  const toggle = (list: string[], set: (value: string[]) => void, key: string) => set(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  const quickRange = (kind: "today" | "week") => {
    const now = new Date();
    if (kind === "today") { setFrom(iso(now)); setTo(iso(now)); return; }
    const start = mondayOf(now);
    setFrom(iso(start));
    setTo(iso(addDays(start, 6)));
  };

  const exportCsv = () => {
    const rows = [["Period", "Kategori", "Produkt", "Enhet", "Mängd", "Värde", "Antal ordrar", "Butiker"], ...groups.flatMap((group) => group.rows.map((row) => [group.label, row.category, row.name, row.unit, qtyText(row.total, row.unit), moneyText(row.value), String(row.orders.length), row.orders.map((order) => `${order.storeName} (${qtyText(order.quantity, row.unit)})`).join(" | ")]))];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `grossist-totallista-${from}_${to}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const printList = () => {
    const rows = groups.flatMap((group) => group.rows.map((row) => `<tr><td>${group.label}</td><td>${row.category}</td><td>${row.name}</td><td>${qtyText(row.total, row.unit)} ${row.unit}</td><td>${moneyText(row.value)} kr</td></tr>`)).join("");
    const windowRef = window.open("", "_blank", "width=900,height=700");
    if (!windowRef) return;
    windowRef.document.write(`<html><head><title>Grossistens totallista</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#111}h1{margin:0 0 4px}p{color:#555}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:8px;border-bottom:1px solid #bbb;text-align:left}th{background:#222;color:#fff;font-size:11px;text-transform:uppercase}</style></head><body><h1>Grossistens totallista</h1><p>${from} – ${to}</p><table><thead><tr><th>Period</th><th>Kategori</th><th>Produkt</th><th>Mängd</th><th>Värde</th></tr></thead><tbody>${rows}</tbody></table><script>window.onload=function(){window.print();window.close()}<\/script></body></html>`);
    windowRef.document.close();
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-primary/30 bg-primary/5 shadow-sm">
        <CardContent className="flex items-start gap-3 py-4">
          <div className="rounded-xl bg-primary/15 p-2.5 ring-1 ring-inset ring-primary/25"><ListChecks className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0"><div className="text-base font-semibold tracking-tight sm:text-lg">Totallista — butikernas samlade beställningar</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">Klicka på en produkt för att se vilka butiker och ordrar som ligger bakom mängden.</p></div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-2xl border-border/60 shadow-sm"><CardHeader className="p-3 pb-1.5"><CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">1. Vygruppering</CardTitle></CardHeader><CardContent className="p-3 pt-0"><ToggleGroup type="single" value={mode} onValueChange={(value) => value && setMode(value as "day" | "week")} className="grid w-full grid-cols-2 gap-1.5"><ToggleGroupItem value="day" className="h-10 gap-1.5 rounded-xl text-xs"><CalendarDays className="h-4 w-4" /> Dagligen</ToggleGroupItem><ToggleGroupItem value="week" className="h-10 gap-1.5 rounded-xl text-xs"><CalendarDays className="h-4 w-4" /> Veckovis</ToggleGroupItem></ToggleGroup></CardContent></Card>
        <Card className="rounded-2xl border-border/60 shadow-sm"><CardHeader className="p-3 pb-1.5"><CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">2. Datumval</CardTitle></CardHeader><CardContent className="space-y-2 p-3 pt-0"><div className="grid grid-cols-2 gap-1.5"><Button variant="outline" size="sm" className="h-9 rounded-xl text-[11px]" onClick={() => quickRange("today")}>Idag</Button><Button variant="outline" size="sm" className="h-9 rounded-xl text-[11px]" onClick={() => quickRange("week")}>Denna vecka</Button></div><div className="grid grid-cols-2 gap-2"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="h-10 rounded-xl text-xs" /><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-xl text-xs" /></div></CardContent></Card>
        <Card className="rounded-2xl border-border/60 shadow-sm"><CardHeader className="p-3 pb-1.5"><CardTitle className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">3. Filter</CardTitle></CardHeader><CardContent className="space-y-2 p-3 pt-0"><Select value={store} onValueChange={setStore}><SelectTrigger className="h-10 rounded-xl text-xs"><SelectValue placeholder="Alla butiker" /></SelectTrigger><SelectContent><SelectItem value="all">Alla butiker</SelectItem>{stores.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select><Select value={category} onValueChange={setCategory}><SelectTrigger className="h-10 rounded-xl text-xs"><SelectValue placeholder="Alla kategorier" /></SelectTrigger><SelectContent><SelectItem value="all">Alla kategorier</SelectItem>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök produkt…" className="h-10 rounded-xl pl-8 text-xs" /></div></CardContent></Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm"><CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4"><div className="grid flex-1 grid-cols-3 gap-2"><div className="rounded-xl bg-muted/25 p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Ordrar</div><div className="font-mono text-xl font-semibold tabular-nums">{orderCount}</div></div><div className="rounded-xl bg-muted/25 p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Produkter</div><div className="font-mono text-xl font-semibold tabular-nums">{productCount}</div></div><div className="rounded-xl bg-muted/25 p-2.5"><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Samlade värden</div><div className="truncate font-mono text-xl font-semibold tabular-nums text-primary">{moneyText(totalValue)} kr</div></div></div><div className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" size="sm" className="h-11 gap-1.5 rounded-xl text-xs sm:h-10" onClick={exportCsv}><Download className="h-4 w-4" /> Excel/CSV</Button><Button size="sm" className="h-11 gap-1.5 rounded-xl text-xs sm:h-10" onClick={printList} disabled={!groups.length}><Printer className="h-4 w-4" /> Skriv ut</Button></div></CardContent></Card>

      {groups.length === 0 ? <EmptyState title="Inget beställt i urvalet" description="Välj andra dagar eller ändra filtren för att se butikernas samlade beställningar." /> : groups.map((group) => {
        const groupOpen = !closedGroups.includes(group.key);
        return <Card key={group.key} className="overflow-hidden rounded-2xl border-border/60 shadow-sm"><CardHeader className="border-b border-border/50 bg-muted/20 px-3 py-2.5"><button type="button" onClick={() => toggle(closedGroups, setClosedGroups, group.key)} className="flex w-full items-center gap-2.5 text-left"><div className="rounded-lg bg-background p-1.5 ring-1 ring-inset ring-border/50"><CalendarDays className="h-3.5 w-3.5 text-primary" /></div><CardTitle className="text-[15px] font-semibold tracking-tight">{group.label}</CardTitle><Badge variant="secondary" className="rounded-full text-[10px] font-normal">{group.orderCount} ordrar</Badge>{groupOpen ? <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" /> : <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />}</button></CardHeader>{groupOpen && <CardContent className="space-y-0 px-2 pb-2 pt-0 md:px-3"><div className="hidden items-center gap-3 px-2 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 md:flex"><span className="w-3" /><span className="w-8" /><span className="min-w-0 flex-1">Produkt</span><span className="w-28 text-right">Samlade värden</span><span className="w-24 text-right">Mängd</span><span className="w-16 text-right">Ordrar</span></div>{group.rows.map((row, index) => {
          const rowKey = `${group.key}-${row.key}`;
          const isOpen = openRows.includes(rowKey);
          const visibleOrders = showAll.includes(rowKey) ? row.orders : row.orders.slice(0, 5);
          const newCategory = index === 0 || group.rows[index - 1].category !== row.category;
          const categoryRows = group.rows.filter((item) => item.category === row.category);
          const currentStatus = row.statuses.length === 1 ? row.statuses[0] : "";
          return <Fragment key={rowKey}>{newCategory && <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1 first:mt-0"><span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{row.category}</span><span className="font-mono text-[9px] tabular-nums text-muted-foreground/70">{categoryRows.length} varor</span></div>}<div className={`relative ${isOpen ? "my-1 rounded-xl bg-primary/[0.04] ring-1 ring-inset ring-primary/15" : "border-b border-border/40"}`}>{isOpen && <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-primary/70" />}<button type="button" onClick={() => toggle(openRows, setOpenRows, rowKey)} className="flex w-full items-center gap-3 overflow-hidden rounded-xl px-2 py-2 text-left transition-colors hover:bg-muted/40">{isOpen ? <ChevronDown className="h-3 w-3 shrink-0 text-primary" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/70" />}<ProductThumb src={row.imageUrl} alt={row.name} productId={row.productId} static className="h-8 w-10 shrink-0 rounded-md" /><span className={`min-w-0 flex-1 truncate tracking-tight ${isOpen ? "text-xs font-semibold md:text-[13px]" : "text-[11px] font-medium md:text-xs"}`}>{row.name}</span><span className="hidden shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:block sm:w-28">{moneyText(row.value)} kr</span><span className="shrink-0 whitespace-nowrap text-right font-mono text-[11px] font-semibold tabular-nums text-primary md:w-24 md:text-xs">{qtyText(row.total, row.unit)} {row.unit}</span><span className="shrink-0 whitespace-nowrap text-right font-mono text-[10px] tabular-nums text-muted-foreground md:w-16 md:text-[11px]">{row.orders.length} st</span></button>{isOpen && <div className="grid gap-2 px-2 pb-2 md:pl-8 lg:grid-cols-[1fr,260px]"><div className="overflow-hidden rounded-xl bg-background/60 ring-1 ring-inset ring-border/50"><div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Butiksordrar ({row.orders.length})</div><div className="divide-y divide-border/40">{visibleOrders.map((order) => <button type="button" key={`${rowKey}-${order.id}`} onClick={() => onOpenOrder?.(order.id, row.name)} disabled={!onOpenOrder} className="grid w-full grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 px-2.5 py-2 text-left text-[11px] transition-colors hover:bg-muted/50 md:flex md:flex-wrap md:items-baseline md:text-xs"><span className="font-mono text-primary underline-offset-2 hover:underline">{order.orderNumber}</span><span className="min-w-0 truncate md:flex-1">{order.storeName}</span><span className="col-span-2 font-mono font-semibold tabular-nums md:w-24 md:text-right">{qtyText(order.quantity, row.unit)} {row.unit}</span><span className="col-span-2 text-muted-foreground md:w-24 md:text-right">{order.wantedDate}</span></button>)}</div>{row.orders.length > 5 && <Button variant="ghost" size="sm" className="h-8 w-full rounded-none text-[11px]" onClick={() => toggle(showAll, setShowAll, rowKey)}>{showAll.includes(rowKey) ? "Visa färre" : `Visa alla ${row.orders.length} ordrar`}</Button>}</div><div className="rounded-xl bg-background/60 p-2.5 ring-1 ring-inset ring-border/50"><div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Samlade värden</div><div className="flex items-baseline gap-2 py-0.5 text-xs"><span className="min-w-0 flex-1 text-muted-foreground">Beställt</span><span className="font-mono font-semibold tabular-nums text-primary">{qtyText(row.total, row.unit)} {row.unit}</span></div><div className="flex items-baseline gap-2 py-0.5 text-xs"><span className="min-w-0 flex-1 text-muted-foreground">Värde</span><span className="font-mono font-semibold tabular-nums">{moneyText(row.value)} kr</span></div><div className="mt-2 border-t border-border/50 pt-2"><div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Status för alla orderrader</div><Select value={currentStatus} onValueChange={(value) => onStatusChange?.({ product_name: row.name, lineIds: row.lineIds }, value)}><SelectTrigger className="h-8 text-[11px]"><SelectValue placeholder="Sätt status…" /></SelectTrigger><SelectContent>{statusOptions.map((status) => <SelectItem key={status || "none"} value={status || "pending"} className="text-xs">{status || "Ej satt"}</SelectItem>)}</SelectContent></Select></div></div></div>}</div></Fragment>;
        })}</CardContent>}</Card>;
      })}
    </div>
  );
}
