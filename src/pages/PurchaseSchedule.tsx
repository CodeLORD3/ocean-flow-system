import { useMemo, useState } from "react";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfWeek, addDays, isSameDay, parseISO, getISOWeek, getYear } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, Clock, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

type LeadTimeRule = {
  label: string;
  color: string;
  getLatestPurchaseDate: (deliveryDate: Date) => { date: Date; note: string };
};

const LEAD_TIME_RULES: Record<string, LeadTimeRule> = {
  international: {
    label: "Internationell",
    color: "destructive",
    getLatestPurchaseDate: (d) => ({
      date: addDays(d, -2),
      note: "2 dagar före leverans",
    }),
  },
  stockholm: {
    label: "Stockholm",
    color: "default",
    getLatestPurchaseDate: (d) => ({
      date: addDays(d, -1),
      note: "1 dag före leverans",
    }),
  },
  gothenburg: {
    label: "Göteborg",
    color: "secondary",
    getLatestPurchaseDate: (d) => ({
      date: d,
      note: "Samma dag, senast 09:00",
    }),
  },
};

function getStoreLeadTimeKey(store: { city: string; name: string }): string {
  const city = store.city?.toLowerCase() || "";
  const name = store.name?.toLowerCase() || "";
  if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg")) return "gothenburg";
  if (city.includes("stockholm") || name.includes("stockholm")) return "stockholm";
  return "international";
}

export default function PurchaseSchedule() {
  const { data: orders, isLoading: ordersLoading } = useShopOrders();
  const { data: stores, isLoading: storesLoading } = useStores();
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    return addDays(start, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const currentWeek = getISOWeek(weekStart);
  const currentYear = getYear(weekStart);

  const storeMap = useMemo(() => {
    const m = new Map<string, { name: string; city: string }>();
    stores?.forEach((s) => m.set(s.id, { name: s.name, city: s.city }));
    return m;
  }, [stores]);

  // Build schedule: group by weekday → list of items with purchase deadline
  const schedule = useMemo(() => {
    if (!orders || !stores) return [];

    type ScheduleItem = {
      orderId: string;
      storeName: string;
      storeCity: string;
      leadTimeKey: string;
      productName: string;
      quantity: number;
      unit: string;
      deliveryDate: Date;
      latestPurchaseDate: Date;
      purchaseNote: string;
      category: string;
    };

    const items: ScheduleItem[] = [];

    for (const order of orders) {
      if (order.status === "Arkiverad") continue;
      const store = storeMap.get(order.store_id);
      if (!store) continue;

      const leadTimeKey = getStoreLeadTimeKey(store);
      const rule = LEAD_TIME_RULES[leadTimeKey];

      for (const line of order.shop_order_lines || []) {
        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;

        const deliveryDate = parseISO(deliveryDateStr);
        const { date: latestPurchaseDate, note } = rule.getLatestPurchaseDate(deliveryDate);

        items.push({
          orderId: order.id,
          storeName: store.name,
          storeCity: store.city,
          leadTimeKey,
          productName: line.products?.name || "Okänd produkt",
          quantity: line.quantity_ordered,
          unit: line.unit || line.products?.unit || "kg",
          deliveryDate,
          latestPurchaseDate,
          purchaseNote: note,
          category: line.products?.category || "Övrigt",
        });
      }
    }

    return items;
  }, [orders, stores, storeMap]);

  // Group items by delivery weekday
  const byDeliveryDay = useMemo(() => {
    const map = new Map<number, typeof schedule>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const item of schedule) {
      const dayIndex = weekDates.findIndex((d) => isSameDay(d, item.deliveryDate));
      if (dayIndex >= 0) map.get(dayIndex)?.push(item);
    }
    return map;
  }, [schedule, weekDates]);

  // Group items by purchase deadline day
  const byPurchaseDay = useMemo(() => {
    const map = new Map<number, typeof schedule>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const item of schedule) {
      const dayIndex = weekDates.findIndex((d) => isSameDay(d, item.latestPurchaseDate));
      if (dayIndex >= 0) map.get(dayIndex)?.push(item);
    }
    return map;
  }, [schedule, weekDates]);

  const [view, setView] = useState<"purchase" | "delivery">("purchase");

  const activeMap = view === "purchase" ? byPurchaseDay : byDeliveryDay;

  const isLoading = ordersLoading || storesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inköpsschema</h1>
          <p className="text-sm text-muted-foreground">
            Vecka {currentWeek}, {currentYear} — {format(weekDates[0], "d MMM", { locale: sv })} – {format(weekDates[6], "d MMM", { locale: sv })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={view} onValueChange={(v) => setView(v as "purchase" | "delivery")}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Visa per inköpsdag</SelectItem>
              <SelectItem value="delivery">Visa per leveransdag</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)}>
              Idag
            </Button>
            <Button variant="outline" size="icon" onClick={() => setWeekOffset((w) => w + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Lead time legend */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(LEAD_TIME_RULES).map(([key, rule]) => (
          <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={rule.color as any} className="text-[10px]">{rule.label}</Badge>
            <span>{rule.getLatestPurchaseDate(new Date()).note}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Laddar schema...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {weekDates.map((date, dayIndex) => {
            const items = activeMap.get(dayIndex) || [];
            const isToday = isSameDay(date, new Date());
            const isPast = date < new Date() && !isToday;

            return (
              <Card key={dayIndex} className={`${isToday ? "ring-2 ring-primary" : ""} ${isPast ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      {WEEKDAYS[dayIndex]}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {format(date, "d MMM", { locale: sv })}
                    </span>
                  </CardTitle>
                  {items.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {items.length} {items.length === 1 ? "produkt" : "produkter"} att {view === "purchase" ? "beställa" : "leverera"}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {items.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">Inga produkter</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 px-2 text-[10px]">Produkt</TableHead>
                          <TableHead className="h-8 px-2 text-[10px] text-right">Antal</TableHead>
                          <TableHead className="h-8 px-2 text-[10px]">Butik</TableHead>
                          {view === "purchase" ? (
                            <TableHead className="h-8 px-2 text-[10px]">Leverans</TableHead>
                          ) : (
                            <TableHead className="h-8 px-2 text-[10px]">Senast inköp</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, i) => {
                          const isUrgent = view === "purchase" && isSameDay(item.latestPurchaseDate, new Date()) && item.leadTimeKey === "gothenburg";
                          return (
                            <TableRow key={`${item.orderId}-${item.productName}-${i}`} className={isUrgent ? "bg-destructive/10" : ""}>
                              <TableCell className="px-2 py-1.5 text-xs font-medium">{item.productName}</TableCell>
                              <TableCell className="px-2 py-1.5 text-xs text-right">
                                {item.quantity} {item.unit}
                              </TableCell>
                              <TableCell className="px-2 py-1.5">
                                <Badge variant={LEAD_TIME_RULES[item.leadTimeKey].color as any} className="text-[9px]">
                                  {item.storeName}
                                </Badge>
                              </TableCell>
                              {view === "purchase" ? (
                                <TableCell className="px-2 py-1.5 text-[10px] text-muted-foreground">
                                  {format(item.deliveryDate, "EEE d/M", { locale: sv })}
                                </TableCell>
                              ) : (
                                <TableCell className="px-2 py-1.5">
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                    {isSameDay(item.latestPurchaseDate, item.deliveryDate) && (
                                      <Clock className="h-3 w-3 text-amber-500" />
                                    )}
                                    {format(item.latestPurchaseDate, "EEE d/M", { locale: sv })}
                                    {item.leadTimeKey === "gothenburg" && (
                                      <span className="text-amber-500 font-medium">09:00</span>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Summary card */}
      {!isLoading && schedule.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sammanfattning denna vecka
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Object.entries(LEAD_TIME_RULES).map(([key, rule]) => {
                const count = schedule.filter((s) => s.leadTimeKey === key).length;
                return (
                  <div key={key} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={rule.color as any} className="text-xs">{rule.label}</Badge>
                      <span className="text-lg font-bold text-foreground">{count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{rule.getLatestPurchaseDate(new Date()).note}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
