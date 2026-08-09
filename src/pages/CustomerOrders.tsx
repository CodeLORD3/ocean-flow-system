import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  CalendarDays,
  ShoppingBag,
  Users,
  Lock,
  ChefHat,
  Settings,
  Printer,
  Truck,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
} from "@/lib/customerOrders";
import { CustomerOrderWizard } from "@/components/orders/CustomerOrderWizard";
import { CustomerOrderCard } from "@/components/orders/CustomerOrderCard";
import { RetailCustomerRegistry } from "@/components/orders/RetailCustomerRegistry";
import { PurchaseNeedsView } from "@/components/orders/PurchaseNeedsView";
import { CateringKitchenList } from "@/components/orders/CateringKitchenList";
import { StoreOrderSettingsDialog } from "@/components/orders/StoreOrderSettingsDialog";
import { DeliveryRouteView } from "@/components/orders/DeliveryRouteView";
import { CustomerOrderStats } from "@/components/orders/CustomerOrderStats";
import { printPackList } from "@/lib/customerOrderPackListPdf";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<CustomerOrder | null>(null);


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

  const tomorrowNeeds = tomorrowOrders.flatMap((o) =>
    (o.customer_order_lines || [])
      .filter((l) => l.reservation_status === "inkopsbehov" && l.pack_status !== "struken")
      .map((l) => ({ order: o, line: l })),
  );

  const rowReadOnly = (o: CustomerOrder) =>
    isShop ? o.store_id !== activeStoreId : site === "production";

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold sm:text-2xl">Kundbeställningar</h1>
          <p className="text-sm text-muted-foreground">
            Beställningar från privatpersoner{isShop && activeStoreName ? ` — ${activeStoreName}` : ""}.
            Betalning sker i kassan vid hämtning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="h-12"
            disabled={orders.length === 0}
            onClick={() =>
              printPackList({
                orders,
                storeName: isShop
                  ? activeStoreName
                  : stores.find((s: any) => s.id === effectiveStore)?.name,
                dateLabel: "Aktuell lista",
              })
            }
          >
            <Printer className="mr-2 h-4 w-4" /> Papperslista
          </Button>
          {(isShop ? !!activeStoreId : !!effectiveStore) && (
            <Button variant="outline" className="h-12" onClick={() => setSettingsOpen(true)}>
              <Settings className="mr-2 h-4 w-4" /> Öppettider och kapacitet
            </Button>
          )}
          {canEdit && (isShop ? !!activeStoreId : effectiveStore) && (
            <Button className="h-12" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Ny beställning
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="flex-wrap">
          <TabsTrigger value="orders" className="gap-1">
            <ShoppingBag className="h-4 w-4" /> Order
          </TabsTrigger>
          <TabsTrigger value="tomorrow" className="gap-1">
            <CalendarDays className="h-4 w-4" /> Imorgon
            {tomorrowOrders.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {tomorrowOrders.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="kitchen" className="gap-1">
            <ChefHat className="h-4 w-4" /> Att förbereda
          </TabsTrigger>
          <TabsTrigger value="delivery" className="gap-1">
            <Truck className="h-4 w-4" /> Leverans
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-1">
            <Users className="h-4 w-4" /> Kundregister
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1">
            <BarChart3 className="h-4 w-4" /> Statistik
          </TabsTrigger>
          {!isShop && <TabsTrigger value="needs">Sålt men inte köpt</TabsTrigger>}
        </TabsList>



        <TabsContent value="orders" className="space-y-3">
          <div className="flex flex-wrap gap-2">
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
                <SelectTrigger className="h-11 w-[190px]">
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
              <SelectTrigger className="h-11 w-[160px]">
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
              <SelectTrigger className="h-11 w-[150px]">
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
              <SelectTrigger className="h-11 w-[150px]">
                <SelectValue placeholder="Ordertyp" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla typer</SelectItem>
                <SelectItem value="upphamtning">Upphämtning</SelectItem>
                <SelectItem value="leverans">Leverans</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!isLoading && orders.length === 0 ? (
            <EmptyState
              title="Inga kundbeställningar"
              description="Här samlas dagens och kommande beställningar från privatkunder. Skapa den första med Ny beställning."
            />
          ) : (
            <div className="space-y-4">
              {groupByDay(orders).map(([day, list]) => (
                <div key={day} className="space-y-2">
                  <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {dayLabel(day)} · {list.length} order
                  </div>
                  {list.map((o) => (
                    <CustomerOrderRow
                      key={o.id}
                      order={o}
                      onOpen={setSelected}
                      readOnly={rowReadOnly(o)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}

        </TabsContent>

        <TabsContent value="tomorrow" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {tomorrowOrders.length} order imorgon
                {tomorrowNeeds.length > 0 ? `, ${tomorrowNeeds.length} varor behöver köpas in` : ""}
              </CardTitle>
            </CardHeader>
            {tomorrowNeeds.length > 0 && (
              <CardContent className="space-y-1">
                {tomorrowNeeds.map(({ order, line }) => (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-amber-500/15 px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {(line.products?.name || line.free_text_name) as string}
                    </span>
                    <span className="font-mono tabular-nums">
                      {nf(line.quantity_ordered)} {line.unit}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {order.order_number} · Ska köpas färskt inför imorgon
                    </span>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>

          {tomorrowOrders.length === 0 ? (
            <EmptyState
              title="Inga order imorgon"
              description="När en beställning läggs med imorgondagens datum hamnar den här."
            />
          ) : (
            <div className="space-y-2">
              {tomorrowOrders.map((o) => (
                <OrderRow key={o.id} order={o} onOpen={setSelected} readOnly={rowReadOnly(o)} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="kitchen">
          <CateringKitchenList storeId={effectiveStore} />
        </TabsContent>

        <TabsContent value="delivery">
          <DeliveryRouteView
            storeId={effectiveStore}
            storeName={
              isShop ? activeStoreName : stores.find((s: any) => s.id === effectiveStore)?.name
            }
            readOnly={!canEdit}
          />
        </TabsContent>

        <TabsContent value="customers">
          <RetailCustomerRegistry storeId={effectiveStore} readOnly={!canEdit} />
        </TabsContent>

        <TabsContent value="stats">
          <CustomerOrderStats storeId={effectiveStore} />
        </TabsContent>


        {!isShop && (
          <TabsContent value="needs">
            <PurchaseNeedsView />
          </TabsContent>
        )}
      </Tabs>

      {(isShop ? activeStoreId : effectiveStore) && (
        <>
          <CustomerOrderWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            storeId={(isShop ? activeStoreId : effectiveStore) as string}
            storeName={isShop ? activeStoreName : stores.find((s: any) => s.id === effectiveStore)?.name}
          />
          <StoreOrderSettingsDialog
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            storeId={(isShop ? activeStoreId : effectiveStore) as string}
            storeName={isShop ? activeStoreName : stores.find((s: any) => s.id === effectiveStore)?.name}
            canEdit={canEdit}
          />
        </>
      )}


      <CustomerOrderCard
        order={selectedFresh}
        open={!!selected}
        onOpenChange={(v) => !v && setSelected(null)}
        readOnly={selectedFresh ? rowReadOnly(selectedFresh) : false}
      />
    </div>
  );
}
