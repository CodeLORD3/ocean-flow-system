import { useMemo, useState } from "react";
import { Plus, Search, Users, BarChart3, Filter, X, ArrowLeft, ShoppingCart, Sigma, Archive, ArchiveRestore, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import {
  useCustomerOrders,
  useArchiveCustomerOrder,
  useApproveCustomerOrder,
  useCustomerOrderCounts,
  useCustomerOrderTabCounts,
} from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PACK_STATUS_LABELS,
  ACTIVE_ORDER_TABS,
  ORDER_TAB_LABELS,
  OrderTab,
  orderTab,
} from "@/lib/customerOrders";
import { CustomerOrderWizard } from "@/components/orders/CustomerOrderWizard";
import { CustomerOrderRow, CustomerOrderRowHeader } from "@/components/orders/CustomerOrderRow";
import { useEntityImageCounts } from "@/hooks/useEntityImages";
import { StatusBar } from "@/components/shell/StatusBar";
import { getStoreCurrency } from "@/lib/currency";
import { CurrencyAmount } from "@/components/orders/CurrencyAmount";

import { RetailCustomerRegistry } from "@/components/orders/RetailCustomerRegistry";
import { CustomerOrderStats } from "@/components/orders/CustomerOrderStats";
import { PurchaseNeedsView } from "@/components/orders/PurchaseNeedsView";
import { TotalOrderedView } from "@/components/orders/TotalOrderedView";

/** Orderflikarna: tre operativa lägen först, historiken nedtonad sist. */
const TABS: { id: OrderTab; hint: string; muted?: boolean }[] = [
  { id: "alla", hint: "Allt som är på gång: ska packas, levereras, hämtas samt event framöver" },
  {
    id: "godkannande",
    hint: "Webbordrar för hämtning i butik som väntar på godkännande",
  },
  { id: "pagaende", hint: "Aktiva, ännu inte färdigpackade" },
  { id: "packade", hint: "Färdiga, väntar på hämtning eller leverans" },
  { id: "event", hint: "Eventbokningar och catering, skilt från vanliga ordrar" },
  { id: "obetalda", hint: "Utlämnade men betalning saknas" },

  { id: "arkiverade", hint: "Avslutade — hämtade och betalda", muted: true },
  { id: "borttagna", hint: "Avbokade eller felregistrerade, sparas för historik", muted: true },
];




const nf = (v: any, d = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const today = () => new Date().toISOString().slice(0, 10);
const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

const dayLabel = (iso: string) => {
  const t = today();
  const tm = tomorrow();
  const pretty = new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (iso === t) return `Idag — ${pretty}`;
  if (iso === tm) return `Imorgon — ${pretty}`;
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
};

/** ISO-veckonummer och ISO-år för ett datum. */
function isoWeek(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

const rangeLabel = (days: string[]) => {
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  const first = days[0];
  const last = days[days.length - 1];
  return first === last ? fmt(first) : `${fmt(first)} – ${fmt(last)}`;
};

/** Grupperar order per vecka och därunder per önskat datum, tidigast först. */
function groupByWeek(list: CustomerOrder[]) {
  const sorted = [...list].sort(
    (a, b) =>
      a.wanted_date.localeCompare(b.wanted_date) ||
      (a.wanted_time || "").localeCompare(b.wanted_time || ""),
  );
  const weeks = new Map<string, { week: number; year: number; days: Map<string, CustomerOrder[]> }>();
  for (const o of sorted) {
    const { week, year } = isoWeek(o.wanted_date);
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const entry = weeks.get(key) ?? { week, year, days: new Map<string, CustomerOrder[]>() };
    const arr = entry.days.get(o.wanted_date) ?? [];
    arr.push(o);
    entry.days.set(o.wanted_date, arr);
    weeks.set(key, entry);
  }
  return [...weeks.entries()].map(([key, entry]) => {
    const days = [...entry.days.entries()];
    const orders = days.flatMap(([, list]) => list);
    return {
      key,
      week: entry.week,
      year: entry.year,
      days,
      count: orders.length,
      sum: orders.reduce((s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0), 0),
    };
  });
}



/**
 * Kundbeställningar från privatpersoner.
 *
 * Helt skilt från shop_orders (butikens beställning till grossisten) och från
 * kassan. Butiken äger sina order, övriga butiker ser dem låsta, inköp och
 * grossist ser allt för att kunna planera inköpen.
 */
export default function CustomerOrders() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const { data: stores = [] } = useStores(true);
  const isShop = site === "shop";
  const canEdit = isShop || site === "wholesale";

  const [storeFilter, setStoreFilter] = useState<string>("all");
  const effectiveStore = isShop ? activeStoreId : storeFilter === "all" ? null : storeFilter;
  const selectedStore = stores.find((store) => store.id === effectiveStore) ?? null;
  const currency = getStoreCurrency(selectedStore);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [packStatus, setPackStatus] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  /* Flera ordrar kan vara öppna samtidigt — att öppna en stänger inte de andra. */
  const [openRows, setOpenRows] = useState<string[]>([]);
  const [panel, setPanel] = useState<"orders" | "customers" | "stats" | "needs" | "totals">(
    "orders",
  );

  const [tab, setTab] = useState<OrderTab>("alla");
  const [marked, setMarked] = useState<string[]>([]);

  const toggleRow = (id: string) =>
    setOpenRows((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleMark = (id: string, next: boolean) =>
    setMarked((cur) => (next ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));

  const isArchiveView = tab === "arkiverade";
  const archiveOrders = useArchiveCustomerOrder();
  const approveOrders = useApproveCustomerOrder();
  const { data: tabCounts } = useCustomerOrderTabCounts(effectiveStore);

  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId: effectiveStore,
    status,
    packStatus,
    orderType,
    search,
    archived: isArchiveView,
    // Vid sökning tas även arkiverade med, så inget känns försvunnet.
    includeArchived: !isArchiveView && search.trim().length > 0,
  });


  const rowReadOnly = (o: CustomerOrder) =>
    isShop ? o.store_id !== activeStoreId : site === "production";

  /**
   * Den valda fliken avgör listan — en order ligger alltid i exakt en flik.
   * Vid fritextsök söks däremot ALLA flikar, så att en order aldrig känns
   * försvunnen bara för att den ligger i Event & catering eller Arkiverade.
   */
  const searching = search.trim().length > 0;
  const viewOrders = useMemo(
    () =>
      searching
        ? orders
        : orders.filter((o) =>
            tab === "alla"
              ? ACTIVE_ORDER_TABS.includes(orderTab(o))
              : orderTab(o) === tab,
          ),
    [orders, tab, searching],
  );

  /** Vilka flikar sökträffarna kommer från, visas som hjälptext. */
  const searchTabs = useMemo(() => {
    if (!searching) return [] as string[];
    const set = new Set(viewOrders.map((o) => ORDER_TAB_LABELS[orderTab(o)]));
    return [...set];
  }, [searching, viewOrders]);



  const markedOrders = viewOrders.filter((o) => marked.includes(o.id));
  const markedSum = markedOrders.reduce(
    (s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0),
    0,
  );
  const allMarked = viewOrders.length > 0 && markedOrders.length === viewOrders.length;
  const markAll = (next: boolean) => setMarked(next ? viewOrders.map((o) => o.id) : []);
  /* Antal interna bilder per order, hämtas i en fråga för hela listan. */
  const { data: photoCounts } = useEntityImageCounts(
    "customer_order",
    useMemo(() => viewOrders.map((o) => o.id), [viewOrders]),
  );
  /* Stamkundsstjärnan: kundens totala antal ordrar i hela kedjan. */
  const { data: customerOrderCounts } = useCustomerOrderCounts();
  /** Antal aktiva filter, visas som badge på filterknappen. */
  const activeFilters =
    (status !== "all" ? 1 : 0) +
    (packStatus !== "all" ? 1 : 0) +
    (orderType !== "all" ? 1 : 0) +
    (!isShop && storeFilter !== "all" ? 1 : 0);
  const clearFilters = () => {
    setStatus("all");
    setPackStatus("all");
    setOrderType("all");
    setStoreFilter("all");
  };

  const canCreate = canEdit && (isShop ? !!activeStoreId : !!effectiveStore);


  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h1 className="text-lg font-semibold sm:text-xl">Kundbeställningar</h1>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {viewOrders.length} rader
          </span>
          {searching && (
            <span className="text-xs text-muted-foreground">
              Sökning i alla flikar
              {searchTabs.length > 0 ? ` — träffar i ${searchTabs.join(", ")}` : ""}
            </span>
          )}

        </div>

        {canEdit && tab === "godkannande" && (
          <Button
            size="lg"
            className="h-12 px-5 text-base"
            disabled={approveOrders.isPending || (marked.length === 0 && viewOrders.length === 0)}
            onClick={() =>
              approveOrders.mutate(
                { ids: marked.length > 0 ? marked : viewOrders.map((o) => o.id) },
                { onSuccess: () => setMarked([]) },
              )
            }
          >
            <Check className="mr-2 h-5 w-5" />
            Godkänn {marked.length > 0 ? marked.length : viewOrders.length}
          </Button>
        )}
        {canEdit && tab !== "godkannande" && marked.length > 0 && (
          <Button
            variant="outline"
            size="lg"
            className="h-12 px-5 text-base"
            disabled={archiveOrders.isPending}
            onClick={() =>
              archiveOrders.mutate(
                { ids: marked, archive: !isArchiveView },
                { onSuccess: () => setMarked([]) },
              )
            }
          >
            {isArchiveView ? (
              <>
                <ArchiveRestore className="mr-2 h-5 w-5" /> Återställ {marked.length}
              </>
            ) : (
              <>
                <Archive className="mr-2 h-5 w-5" /> Arkivera {marked.length}
              </>
            )}
          </Button>
        )}
        {canCreate && (
          <Button size="lg" className="h-12 px-5 text-base" onClick={() => setWizardOpen(true)}>
            <Plus className="mr-2 h-5 w-5" /> Ny beställning
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Privatkunder{isShop && activeStoreName ? ` — ${activeStoreName}` : ""}. Betalning sker i
        kassan vid hämtning.
      </p>

      {/* Ordermenyn: tre operativa flikar först, historiken nedtonad sist. */}
      {panel === "orders" && (
        <div
          role="tablist"
          aria-label="Orderflikar"
          className="flex flex-wrap items-stretch gap-1 overflow-x-auto rounded-sm border border-grid-line bg-card p-1"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = tabCounts?.[t.id] ?? 0;
            const alert = (t.id === "obetalda" || t.id === "godkannande") && count > 0;
            // Godkännandefliken visas bara för butiker som faktiskt använder steget.
            if (t.id === "godkannande" && count === 0 && !active) return null;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                title={t.hint}
                onClick={() => {
                  setTab(t.id);
                  setMarked([]);
                  setOpenRows([]);
                }}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-sm px-3 py-2 text-xs transition-colors ${
                  active
                    ? alert
                      ? "bg-destructive text-destructive-foreground font-semibold"
                      : "bg-primary text-primary-foreground font-semibold"
                    : t.muted
                      ? "text-muted-foreground hover:bg-muted"
                      : "text-foreground hover:bg-muted"
                } ${!active && alert ? "text-destructive" : ""}`}
              >
                <span className={t.muted && !active ? "" : "font-semibold"}>
                  {ORDER_TAB_LABELS[t.id]}
                </span>
                {count > 0 && (
                  <span
                    className={`rounded-sm px-1 font-mono text-[10px] tabular-nums ${
                      active
                        ? "bg-background/20"
                        : alert
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-3">

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex min-w-[200px] flex-1 items-center gap-2 ${
              panel === "orders" ? "" : "hidden"
            }`}
          >
            <div className="relative min-w-[160px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder="Sök namn, telefon, ordernummer eller produkt"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activeFilters > 0 ? "default" : "outline"}
                  size="icon"
                  className="relative h-11 w-11 shrink-0"
                  title="Filter"
                  aria-label="Filter"
                >
                  <Filter className="h-4 w-4" />
                  {activeFilters > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] tabular-nums text-primary-foreground ring-2 ring-background">
                      {activeFilters}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Filter
                  </span>
                  {activeFilters > 0 && (
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearFilters}>
                      <X className="mr-1 h-3 w-3" /> Rensa
                    </Button>
                  )}
                </div>
                {!isShop && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Butik</span>
                    <Select value={storeFilter} onValueChange={setStoreFilter}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Butik" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alla butiker</SelectItem>
                        {stores.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla statusar</SelectItem>
                      {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Packning</span>
                  <Select value={packStatus} onValueChange={setPackStatus}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Packning" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All packning</SelectItem>
                      {Object.entries(PACK_STATUS_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Ordertyp</span>
                  <Select value={orderType} onValueChange={setOrderType}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Ordertyp" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Alla typer</SelectItem>
                      <SelectItem value="upphamtning">Upphämtning</SelectItem>
                      <SelectItem value="leverans">Leverans</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="ml-auto flex shrink-0 flex-wrap gap-2">
            {/* Totallista lyfts fram: personalen sorterar och packar varor i bulk innan enskilda ordrar packas. */}
            <Button
              variant={panel === "totals" ? "default" : "outline"}
              size="sm"
              className={`h-11 gap-1.5 px-4 text-xs font-semibold ${
                panel === "totals"
                  ? "shadow-sm"
                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
              }`}
              onClick={() => setPanel(panel === "totals" ? "orders" : "totals")}
            >
              <Sigma className="h-4 w-4" /> Totallista
            </Button>
            {!isShop && (
              <Button
                variant={panel === "needs" ? "default" : "outline"}
                size="sm"
                className="h-11 gap-1.5 px-3 text-xs"
                onClick={() => setPanel(panel === "needs" ? "orders" : "needs")}
              >
                <ShoppingCart className="h-4 w-4" /> Inköpsbehov
              </Button>
            )}
            <Button
              variant={panel === "customers" ? "default" : "outline"}
              size="sm"
              className="h-11 gap-1.5 px-3 text-xs"
              onClick={() => setPanel(panel === "customers" ? "orders" : "customers")}
            >
              <Users className="h-4 w-4" /> Kundregister
            </Button>
            <Button
              variant={panel === "stats" ? "default" : "outline"}
              size="sm"
              className="h-11 gap-1.5 px-3 text-xs"
              onClick={() => setPanel(panel === "stats" ? "orders" : "stats")}
            >
              <BarChart3 className="h-4 w-4" /> Statistik
            </Button>
          </div>

        </div>

        {panel !== "orders" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setPanel("orders")}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Tillbaka till beställningar
            </Button>
            <span className="text-sm font-medium text-foreground">
              {panel === "customers"
                ? "Kundregister"
                : panel === "stats"
                  ? "Statistik"
                  : panel === "totals"
                    ? "Totalt beställt"
                    : "Inköpsbehov per butik"}
            </span>

          </div>
        )}




        <div className={panel === "orders" ? "space-y-3" : "hidden"}>
          {!isLoading && viewOrders.length === 0 ? (

            <EmptyState
              title={`Inget i ${ORDER_TAB_LABELS[tab].toLowerCase()}`}
              description={
                tab === "godkannande"
                  ? "Webbordrar för hämtning i butik som kräver godkännande hamnar här innan de går in i flödet."
                  : tab === "pagaende"
                  ? "Här ligger beställningar som är aktiva och ännu inte färdigpackade. Skapa en med Ny beställning."
                  : tab === "packade"
                    ? "Färdigpackade beställningar som väntar på hämtning eller leverans hamnar här."
                    : tab === "event"
                      ? "Eventbokningar och cateringbeställningar hamnar här, skilt från de vanliga ordrarna."
                    : tab === "obetalda"

                      ? "Inga utlämnade beställningar väntar på betalning. Bra jobbat."
                      : tab === "arkiverade"
                        ? "Beställningar som är både hämtade och betalda hamnar här automatiskt."
                        : "Borttagna beställningar sparas här för historik och statistik."
              }
            />

          ) : (
            <div className="overflow-hidden rounded-sm border border-grid-line bg-card">
              <div>
                <CustomerOrderRowHeader
                  currency={currency}
                  selectable
                  allSelected={allMarked}
                  onSelectAll={markAll}
                />
                {groupByWeek(viewOrders).map((w) => (
                  <div key={w.key}>
                    {/* Veckoseparator med antal och summa, tydligt avskild från dagsraderna. */}
                    <div className="flex items-center gap-3 border-x border-b-2 border-grid-line border-b-primary bg-primary/10 px-2.5 py-1.5">
                      <span className="text-[12px] font-bold uppercase tracking-wide text-foreground">
                        Vecka {w.week}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {rangeLabel(w.days.map(([d]) => d))}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                        {w.count} order
                      </span>
                      <CurrencyAmount
                        amount={w.sum}
                        currency={currency}
                        className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground"
                      />
                    </div>

                    {w.days.map(([day, list]) => (
                      <div key={day}>
                        <div className="flex items-center gap-2 border-x border-b border-grid-line bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <span className="truncate">{dayLabel(day)}</span>
                          <span className="shrink-0 font-mono tabular-nums">
                            {list.length} order
                          </span>
                        </div>

                        {list.map((o) => (
                          <CustomerOrderRow
                            key={o.id}
                            order={o}
                            canEdit={canEdit}
                            readOnly={rowReadOnly(o)}
                            open={openRows.includes(o.id)}
                            onToggle={toggleRow}
                            selected={marked.includes(o.id)}
                            onSelect={toggleMark}
                            photoCount={photoCounts?.[o.id] ?? 0}
                            orderCount={
                              o.customer_id ? customerOrderCounts?.[o.customer_id] ?? 0 : 0
                            }
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ))}

              </div>




              <StatusBar
                selectedCount={markedOrders.length}
                totalCount={viewOrders.length}
                selectedSum={markedSum}
                currency={currency}
                extra={ORDER_TAB_LABELS[tab]}
              />
            </div>
          )}
        </div>

        {panel === "customers" && (
          <RetailCustomerRegistry storeId={effectiveStore} readOnly={!canEdit} />
        )}
        {panel === "stats" && <CustomerOrderStats storeId={effectiveStore} currency={currency} />}
        {panel === "needs" && <PurchaseNeedsView />}
        {panel === "totals" && <TotalOrderedView storeId={effectiveStore} />}

      </div>


      {(isShop ? activeStoreId : effectiveStore) && (
        <>
          <CustomerOrderWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            storeId={(isShop ? activeStoreId : effectiveStore) as string}
            storeName={isShop ? activeStoreName : stores.find((s: any) => s.id === effectiveStore)?.name}
            currency={currency}
          />
        </>
      )}



    </div>
  );
}
