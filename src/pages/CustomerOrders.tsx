import { useMemo, useState } from "react";
import { Plus, Search, Users, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PACK_STATUS_LABELS,
  isUncollected,
} from "@/lib/customerOrders";
import { CustomerOrderWizard } from "@/components/orders/CustomerOrderWizard";
import { CustomerOrderCard } from "@/components/orders/CustomerOrderCard";
import { CustomerOrderRow, CustomerOrderRowHeader } from "@/components/orders/CustomerOrderRow";
import { CustomerOrderEditDialog } from "@/components/orders/CustomerOrderEditDialog";
import { ViewSelector, SavedView } from "@/components/shell/ViewSelector";
import { FactBox, FactGroup, FactRow } from "@/components/shell/FactBox";
import { StatusBar } from "@/components/shell/StatusBar";

import { RetailCustomerRegistry } from "@/components/orders/RetailCustomerRegistry";
import { PurchaseNeedsView } from "@/components/orders/PurchaseNeedsView";
import { CateringKitchenList } from "@/components/orders/CateringKitchenList";
import { DeliveryRouteView } from "@/components/orders/DeliveryRouteView";
import { CustomerOrderStats } from "@/components/orders/CustomerOrderStats";


/** Sparade vyer, som listsidorna i Dynamics 365. */
const VIEWS: SavedView[] = [
  { id: "aktiva", label: "Aktiva beställningar", description: "Idag och framåt" },
  { id: "idag", label: "Dagens packning", description: "Endast dagens datum" },
  { id: "ejpackade", label: "Ej packade", description: "Opackade och pågående" },
  { id: "avvikelser", label: "Avvikelser", description: "Ohämtat, allergi eller avbrutet" },
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

/** Grupperar order per önskat datum, tidigast först. */
function groupByDay(list: CustomerOrder[]) {
  const map = new Map<string, CustomerOrder[]>();
  for (const o of [...list].sort(
    (a, b) =>
      a.wanted_date.localeCompare(b.wanted_date) ||
      (a.wanted_time || "").localeCompare(b.wanted_time || ""),
  )) {
    const arr = map.get(o.wanted_date) ?? [];
    arr.push(o);
    map.set(o.wanted_date, arr);
  }
  return [...map.entries()];
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

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [packStatus, setPackStatus] = useState("all");
  const [orderType, setOrderType] = useState("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selected, setSelected] = useState<CustomerOrder | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [editing, setEditing] = useState<CustomerOrder | null>(null);
  const [panel, setPanel] = useState<"orders" | "customers" | "stats">("orders");

  const [view, setView] = useState("aktiva");
  const [marked, setMarked] = useState<string[]>([]);

  const toggleRow = (id: string) => setOpenRow((cur) => (cur === id ? null : id));
  const toggleMark = (id: string, next: boolean) =>
    setMarked((cur) => (next ? [...new Set([...cur, id])] : cur.filter((x) => x !== id)));



  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId: effectiveStore,
    status,
    packStatus,
    orderType,
    search,
    fromDate: today(),
  });

  const { data: tomorrowOrders = [] } = useCustomerOrders({
    storeId: effectiveStore,
    fromDate: tomorrow(),
    toDate: tomorrow(),
  });

  const selectedFresh = useMemo(() => {
    if (!selected) return null;
    return (
      orders.find((o) => o.id === selected.id) ||
      tomorrowOrders.find((o) => o.id === selected.id) ||
      selected
    );
  }, [orders, tomorrowOrders, selected]);


  const rowReadOnly = (o: CustomerOrder) =>
    isShop ? o.store_id !== activeStoreId : site === "production";

  /** Den valda vyn filtrerar listan utan att röra serverfiltren. */
  const viewOrders = useMemo(() => {
    if (view === "idag") return orders.filter((o) => o.wanted_date === today());
    if (view === "ejpackade") return orders.filter((o) => o.pack_status !== "packad");
    if (view === "avvikelser")
      return orders.filter(
        (o) =>
          isUncollected(o) ||
          o.status === "avbruten" ||
          !!o.allergy_note ||
          (o.excluded_allergens || []).length > 0,
      );
    return orders;
  }, [orders, view]);

  const markedOrders = viewOrders.filter((o) => marked.includes(o.id));
  const markedSum = markedOrders.reduce(
    (s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0),
    0,
  );
  const allMarked = viewOrders.length > 0 && markedOrders.length === viewOrders.length;
  const markAll = (next: boolean) => setMarked(next ? viewOrders.map((o) => o.id) : []);

  /** FactBox visar öppen rad, annars enda markerade raden. */
  const factOrder =
    viewOrders.find((o) => o.id === openRow) ||
    (markedOrders.length === 1 ? markedOrders[0] : null);

  const canCreate = canEdit && (isShop ? !!activeStoreId : !!effectiveStore);

  return (
    <div className="space-y-3 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ViewSelector
          title="Kundbeställningar"
          views={VIEWS}
          value={view}
          onChange={(v) => {
            setView(v);
            setMarked([]);
          }}
          count={viewOrders.length}
        />
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

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex min-w-[220px] flex-1 flex-wrap gap-2 ${
              panel === "orders" ? "" : "hidden"
            }`}
          >
            <div className="relative min-w-[200px] flex-1">

              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                placeholder="Sök namn, telefon eller ordernummer"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isShop && (
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="h-11 w-full sm:w-[190px]">
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
            )}
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-11 w-[48%] sm:w-[160px]">
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
            <Select value={packStatus} onValueChange={setPackStatus}>
              <SelectTrigger className="h-11 w-[48%] sm:w-[150px]">
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
            <Select value={orderType} onValueChange={setOrderType}>
              <SelectTrigger className="h-11 w-[48%] sm:w-[150px]">
                <SelectValue placeholder="Ordertyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla typer</SelectItem>
                <SelectItem value="upphamtning">Upphämtning</SelectItem>
                <SelectItem value="leverans">Leverans</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex shrink-0 gap-2">
            <Button
              variant={panel === "customers" ? "default" : "outline"}
              className="h-11"
              onClick={() => setPanel(panel === "customers" ? "orders" : "customers")}
            >
              <Users className="mr-2 h-4 w-4" /> Kundregister
            </Button>
            <Button
              variant={panel === "stats" ? "default" : "outline"}
              className="h-11"
              onClick={() => setPanel(panel === "stats" ? "orders" : "stats")}
            >
              <BarChart3 className="mr-2 h-4 w-4" /> Statistik
            </Button>
          </div>
        </div>

        <div className={panel === "orders" ? "space-y-3" : "hidden"}>
          {!isLoading && viewOrders.length === 0 ? (

            <EmptyState
              title={orders.length === 0 ? "Inga kundbeställningar" : "Inga rader i den här vyn"}
              description={
                orders.length === 0
                  ? "Här samlas dagens och kommande beställningar från privatkunder. Skapa den första med Ny beställning."
                  : "Byt vy i rubriken eller ändra filtren för att se fler beställningar."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-sm border border-grid-line bg-card">
              <div className="flex">
                <div className="min-w-0 flex-1">
                  <CustomerOrderRowHeader
                    selectable
                    allSelected={allMarked}
                    onSelectAll={markAll}
                  />
                  {groupByDay(viewOrders).map(([day, list]) => (
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
                          onOpen={setSelected}
                          onEdit={canEdit ? setEditing : undefined}
                          readOnly={rowReadOnly(o)}
                          open={openRow === o.id}
                          onToggle={toggleRow}
                          selected={marked.includes(o.id)}
                          onSelect={toggleMark}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                <FactBox title="Orderdetaljer" empty="Markera eller öppna en rad för detaljer.">
                  {factOrder ? (
                    <>
                      <FactGroup title="Kund">
                        <div className="text-sm font-semibold">
                          {factOrder.customers_retail?.name ||
                            factOrder.customer_name_snapshot ||
                            "Kund"}
                        </div>
                        <FactRow
                          label="Telefon"
                          numeric
                          value={
                            factOrder.customers_retail?.phone ||
                            factOrder.customer_phone_snapshot ||
                            "—"
                          }
                        />
                        <FactRow
                          label="Typ"
                          value={ORDER_TYPE_LABELS[factOrder.order_type] ?? factOrder.order_type}
                        />
                      </FactGroup>

                      <FactGroup title="Sammanfattning">
                        <FactRow label="Ordernr" numeric value={factOrder.order_number} />
                        <FactRow
                          label="Status"
                          value={ORDER_STATUS_LABELS[factOrder.status] ?? factOrder.status}
                        />
                        <FactRow
                          label="Packning"
                          value={
                            PACK_STATUS_LABELS[factOrder.pack_status] ?? factOrder.pack_status
                          }
                        />
                        <FactRow
                          label="Rader"
                          numeric
                          value={
                            (factOrder.customer_order_lines || []).filter(
                              (l) => l.pack_status !== "struken",
                            ).length
                          }
                        />
                        <FactRow
                          label={factOrder.total_incl_vat ? "Verkligt pris" : "Uppskattat pris"}
                          numeric
                          value={`${nf(
                            factOrder.total_incl_vat || factOrder.estimated_total,
                            2,
                          )} kr`}
                        />
                      </FactGroup>

                      {(factOrder.allergy_note ||
                        (factOrder.excluded_allergens || []).length > 0) && (
                        <div className="rounded-sm border-l-4 border-row-late-edge bg-row-late p-2.5 text-xs text-row-late-text">
                          <div className="font-bold uppercase tracking-wide">Allergi</div>
                          <div>
                            {factOrder.allergy_note ||
                              (factOrder.excluded_allergens || []).join(", ")}
                          </div>
                        </div>
                      )}

                      <Button
                        variant="outline"
                        className="h-9 w-full text-xs"
                        onClick={() => setSelected(factOrder)}
                      >
                        Visa fullständigt kort
                      </Button>
                    </>
                  ) : undefined}
                </FactBox>
              </div>

              <StatusBar
                selectedCount={markedOrders.length}
                totalCount={viewOrders.length}
                selectedSum={markedSum}
                extra={VIEWS.find((v) => v.id === view)?.label}
              />
            </div>
          )}
        </div>

        {panel === "customers" && (
          <RetailCustomerRegistry storeId={effectiveStore} readOnly={!canEdit} />
        )}
        {panel === "stats" && <CustomerOrderStats storeId={effectiveStore} />}
      </div>


      {(isShop ? activeStoreId : effectiveStore) && (
        <>
          <CustomerOrderWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            storeId={(isShop ? activeStoreId : effectiveStore) as string}
            storeName={isShop ? activeStoreName : stores.find((s: any) => s.id === effectiveStore)?.name}
          />
        </>
      )}


      <CustomerOrderCard
        order={selectedFresh}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        readOnly={selectedFresh ? rowReadOnly(selectedFresh) : false}
      />

      <CustomerOrderEditDialog
        order={
          editing
            ? orders.find((o) => o.id === editing.id) ||
              tomorrowOrders.find((o) => o.id === editing.id) ||
              editing
            : null
        }
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </div>
  );
}
