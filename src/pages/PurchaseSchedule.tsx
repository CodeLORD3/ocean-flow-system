import { useMemo, useState } from "react";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useTransportSchedules, useUpdateTransportSchedule } from "@/hooks/useTransportSchedules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfWeek, addDays, isSameDay, parseISO, getISOWeek, getYear } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, Clock, ChevronLeft, ChevronRight, AlertTriangle, Truck, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

function getStoreZoneKey(store: { city: string; name: string }): string {
  const city = store.city?.toLowerCase() || "";
  const name = store.name?.toLowerCase() || "";
  if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) return "gothenburg";
  if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) return "stockholm";
  return "international";
}

function TransportZoneBadge({
  schedule,
  onSave,
}: {
  schedule: { id: string; zone_key: string; label: string; departure_days_before: number; departure_time: string; badge_color: string };
  onSave: (id: string, days: number, time: string) => void;
}) {
  const [days, setDays] = useState(schedule.departure_days_before);
  const [time, setTime] = useState(schedule.departure_time);
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onSave(schedule.id, days, time);
    setOpen(false);
  };

  const description = days === 0
    ? `Samma dag, avgång ${schedule.departure_time}`
    : `${days} ${days === 1 ? "dag" : "dagar"} före, avgång ${schedule.departure_time}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 cursor-pointer group">
          <Badge variant={schedule.badge_color as any} className="text-[10px] group-hover:ring-2 group-hover:ring-primary/40 transition-all">
            <Truck className="h-3 w-3 mr-1" />
            {schedule.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">{description}</span>
          <Settings2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm text-foreground">Transport: {schedule.label}</h4>
            <p className="text-xs text-muted-foreground">Ställ in avgångstid för transport</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Dagar före leverans</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Samma dag (0)</SelectItem>
                <SelectItem value="1">1 dag före</SelectItem>
                <SelectItem value="2">2 dagar före</SelectItem>
                <SelectItem value="3">3 dagar före</SelectItem>
                <SelectItem value="4">4 dagar före</SelectItem>
                <SelectItem value="5">5 dagar före</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Avgångstid (senast inköp)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button size="sm" className="w-full" onClick={handleSave}>
            Spara
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function PurchaseSchedule() {
  const { data: orders, isLoading: ordersLoading } = useShopOrders();
  const { data: stores, isLoading: storesLoading } = useStores();
  const { data: transportSchedules, isLoading: schedulesLoading } = useTransportSchedules();
  const updateSchedule = useUpdateTransportSchedule();
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"purchase" | "delivery">("purchase");

  const weekStart = useMemo(() => {
    const now = new Date();
    const start = startOfWeek(now, { weekStartsOn: 1 });
    return addDays(start, weekOffset * 7);
  }, [weekOffset]);

  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const currentWeek = getISOWeek(weekStart);
  const currentYear = getYear(weekStart);

  const storeMap = useMemo(() => {
    const m = new Map<string, { name: string; city: string }>();
    stores?.forEach((s) => m.set(s.id, { name: s.name, city: s.city }));
    return m;
  }, [stores]);

  const zoneMap = useMemo(() => {
    const m = new Map<string, (typeof transportSchedules extends (infer T)[] | undefined ? T : never)>();
    transportSchedules?.forEach((s) => m.set(s.zone_key, s));
    return m;
  }, [transportSchedules]);

  const handleSaveSchedule = (id: string, days: number, time: string) => {
    updateSchedule.mutate(
      { id, departure_days_before: days, departure_time: time },
      { onSuccess: () => toast.success("Transportschema uppdaterat") },
    );
  };

  // Build schedule items
  const schedule = useMemo(() => {
    if (!orders || !stores || !transportSchedules) return [];

    type ScheduleItem = {
      orderId: string;
      storeName: string;
      storeCity: string;
      zoneKey: string;
      productName: string;
      quantity: number;
      unit: string;
      deliveryDate: Date;
      latestPurchaseDate: Date;
      departureTime: string;
      category: string;
    };

    const items: ScheduleItem[] = [];

    for (const order of orders) {
      if (order.status === "Arkiverad") continue;
      const store = storeMap.get(order.store_id);
      if (!store) continue;

      const zoneKey = getStoreZoneKey(store);
      const zone = zoneMap.get(zoneKey);
      if (!zone) continue;

      for (const line of order.shop_order_lines || []) {
        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;

        const deliveryDate = parseISO(deliveryDateStr);
        const latestPurchaseDate = addDays(deliveryDate, -zone.departure_days_before);

        items.push({
          orderId: order.id,
          storeName: store.name,
          storeCity: store.city,
          zoneKey,
          productName: line.products?.name || "Okänd produkt",
          quantity: line.quantity_ordered,
          unit: line.unit || line.products?.unit || "kg",
          deliveryDate,
          latestPurchaseDate,
          departureTime: zone.departure_time,
          category: line.products?.category || "Övrigt",
        });
      }
    }

    return items;
  }, [orders, stores, transportSchedules, storeMap, zoneMap]);

  // Group by day
  const groupByDay = (dateGetter: (item: (typeof schedule)[0]) => Date) => {
    const map = new Map<number, typeof schedule>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const item of schedule) {
      const dayIndex = weekDates.findIndex((d) => isSameDay(d, dateGetter(item)));
      if (dayIndex >= 0) map.get(dayIndex)?.push(item);
    }
    return map;
  };

  const byDeliveryDay = useMemo(() => groupByDay((i) => i.deliveryDate), [schedule, weekDates]);
  const byPurchaseDay = useMemo(() => groupByDay((i) => i.latestPurchaseDate), [schedule, weekDates]);

  const activeMap = view === "purchase" ? byPurchaseDay : byDeliveryDay;
  const isLoading = ordersLoading || storesLoading || schedulesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inköpsschema</h1>
          <p className="text-sm text-muted-foreground">
            Vecka {currentWeek}, {currentYear} — {format(weekDates[0], "d MMM", { locale: sv })} –{" "}
            {format(weekDates[6], "d MMM", { locale: sv })}
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

      {/* Transport zones — clickable to edit */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Transportzoner
            <span className="text-xs font-normal text-muted-foreground">(klicka för att ändra avgångstid)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {transportSchedules?.map((s) => (
              <TransportZoneBadge key={s.id} schedule={s} onSave={handleSaveSchedule} />
            ))}
          </div>
        </CardContent>
      </Card>

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
                      {items.length} {items.length === 1 ? "produkt" : "produkter"} att{" "}
                      {view === "purchase" ? "beställa" : "leverera"}
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
                          <TableHead className="h-8 px-2 text-[10px]">
                            {view === "purchase" ? "Leverans" : "Senast inköp"}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, i) => {
                          const zone = zoneMap.get(item.zoneKey);
                          const isUrgent =
                            view === "purchase" && isSameDay(item.latestPurchaseDate, new Date());
                          return (
                            <TableRow
                              key={`${item.orderId}-${item.productName}-${i}`}
                              className={isUrgent ? "bg-destructive/10" : ""}
                            >
                              <TableCell className="px-2 py-1.5 text-xs font-medium">
                                {item.productName}
                              </TableCell>
                              <TableCell className="px-2 py-1.5 text-xs text-right">
                                {item.quantity} {item.unit}
                              </TableCell>
                              <TableCell className="px-2 py-1.5">
                                <Badge
                                  variant={(zone?.badge_color || "default") as any}
                                  className="text-[9px]"
                                >
                                  {item.storeName}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-2 py-1.5">
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                  {view === "purchase" ? (
                                    <>
                                      {format(item.deliveryDate, "EEE d/M", { locale: sv })}
                                      <Clock className="h-3 w-3 ml-1" />
                                      <span className="font-medium">{item.departureTime}</span>
                                    </>
                                  ) : (
                                    <>
                                      {format(item.latestPurchaseDate, "EEE d/M", { locale: sv })}
                                      <Clock className="h-3 w-3 ml-1" />
                                      <span className="font-medium">{item.departureTime}</span>
                                    </>
                                  )}
                                </div>
                              </TableCell>
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

      {/* Summary */}
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
              {transportSchedules?.map((zone) => {
                const count = schedule.filter((s) => s.zoneKey === zone.zone_key).length;
                const desc =
                  zone.departure_days_before === 0
                    ? `Samma dag, avgång ${zone.departure_time}`
                    : `${zone.departure_days_before} ${zone.departure_days_before === 1 ? "dag" : "dagar"} före, avgång ${zone.departure_time}`;
                return (
                  <div key={zone.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={zone.badge_color as any} className="text-xs">
                        {zone.label}
                      </Badge>
                      <span className="text-lg font-bold text-foreground">{count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
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
