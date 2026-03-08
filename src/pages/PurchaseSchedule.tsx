import { useMemo, useState } from "react";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useTransportSchedules, useUpdateTransportSchedule } from "@/hooks/useTransportSchedules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfWeek, addDays, isSameDay, parseISO, getISOWeek, getYear, getDay } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Truck, Settings2, ChevronDown, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];
const WEEKDAY_OPTIONS = WEEKDAYS.map((name, i) => ({ value: i + 1, label: name }));


/** For a given delivery date, find the departure date = the transport zone's
 *  departure weekday in the SAME ISO week as the delivery date. */
function getDepartureDate(deliveryDate: Date, departureWeekday: number): Date {
  const weekMonday = startOfWeek(deliveryDate, { weekStartsOn: 1 });
  return addDays(weekMonday, departureWeekday - 1);
}

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
  schedule: { id: string; zone_key: string; label: string; departure_weekday: number; departure_time: string; badge_color: string };
  onSave: (id: string, weekday: number, time: string) => void;
}) {
  const [weekday, setWeekday] = useState(schedule.departure_weekday);
  const [time, setTime] = useState(schedule.departure_time);
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onSave(schedule.id, weekday, time);
    setOpen(false);
  };

  const dayName = WEEKDAYS[(schedule.departure_weekday - 1) % 7];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 cursor-pointer group">
          <Badge variant={schedule.badge_color as any} className="text-[10px] group-hover:ring-2 group-hover:ring-primary/40 transition-all">
            <Truck className="h-3 w-3 mr-1" />
            {schedule.label}
          </Badge>
          <span className="text-[10px] text-muted-foreground">
            Avgång: {dayName} {schedule.departure_time}
          </span>
          <Settings2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm text-foreground">Transport: {schedule.label}</h4>
            <p className="text-xs text-muted-foreground">Välj veckodag och tid för transportavgång</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Avgångsdag</Label>
            <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Avgångstid</Label>
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
  const [tab, setTab] = useState<"daily" | "total">("daily");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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

  // Map zone_key -> array of schedules (multiple departure days per zone)
  const zoneSchedules = useMemo(() => {
    const m = new Map<string, NonNullable<typeof transportSchedules>[number][]>();
    transportSchedules?.forEach((s) => {
      const arr = m.get(s.zone_key) || [];
      arr.push(s);
      m.set(s.zone_key, arr);
    });
    return m;
  }, [transportSchedules]);

  const handleSaveSchedule = (id: string, weekday: number, time: string) => {
    updateSchedule.mutate(
      { id, departure_weekday: weekday, departure_time: time },
      { onSuccess: () => toast.success("Transportschema uppdaterat") },
    );
  };

  const schedule = useMemo(() => {
    if (!orders || !stores || !transportSchedules) return [];

    type RawItem = {
      storeName: string;
      zoneKey: string;
      productName: string;
      quantity: number;
      unit: string;
      deliveryDate: Date;
      departureDate: Date;
      departureTime: string;
      category: string;
    };

    const rawItems: RawItem[] = [];

    for (const order of orders) {
      if (order.status === "Arkiverad") continue;
      const store = storeMap.get(order.store_id);
      if (!store) continue;

      const zoneKey = getStoreZoneKey(store);
      const schedules = zoneSchedules.get(zoneKey);
      if (!schedules || schedules.length === 0) continue;

      for (const line of order.shop_order_lines || []) {
        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;

        const deliveryDate = parseISO(deliveryDateStr);
        // The delivery date IS the departure day (shops only pick valid departure weekdays)
        const jsDay = getDay(deliveryDate); // 0=Sun
        const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
        const matchingSchedule = schedules.find(s => s.departure_weekday === isoDay) || schedules[0];
        const departureDate = deliveryDate;

        rawItems.push({
          storeName: store.name,
          zoneKey,
          productName: line.products?.name || "Okänd produkt",
          quantity: line.quantity_ordered,
          unit: line.unit || line.products?.unit || "kg",
          deliveryDate,
          departureDate,
          departureTime: matchingSchedule.departure_time,
          category: line.products?.category || "Övrigt",
        });
      }
    }

    const key = (item: RawItem) =>
      `${item.productName}|${item.unit}|${format(item.departureDate, "yyyy-MM-dd")}`;

    const grouped = new Map<string, {
      productName: string;
      unit: string;
      totalQuantity: number;
      shops: { name: string; zoneKey: string; quantity: number; deliveryDate: Date }[];
      departureDate: Date;
      earliestDelivery: Date;
      departureTime: string;
      category: string;
    }>();

    for (const item of rawItems) {
      const k = key(item);
      const existing = grouped.get(k);
      if (existing) {
        existing.totalQuantity += item.quantity;
        const shopEntry = existing.shops.find((s) => s.name === item.storeName);
        if (shopEntry) {
          shopEntry.quantity += item.quantity;
        } else {
          existing.shops.push({ name: item.storeName, zoneKey: item.zoneKey, quantity: item.quantity, deliveryDate: item.deliveryDate });
        }
        if (item.deliveryDate < existing.earliestDelivery) existing.earliestDelivery = item.deliveryDate;
      } else {
        grouped.set(k, {
          productName: item.productName,
          unit: item.unit,
          totalQuantity: item.quantity,
          shops: [{ name: item.storeName, zoneKey: item.zoneKey, quantity: item.quantity, deliveryDate: item.deliveryDate }],
          departureDate: item.departureDate,
          earliestDelivery: item.deliveryDate,
          departureTime: item.departureTime,
          category: item.category,
        });
      }
    }

    return Array.from(grouped.values());
  }, [orders, stores, transportSchedules, storeMap, zoneSchedules]);

  // All unique categories
  const allCategories = useMemo(() => {
    const cats = new Set(schedule.map((s) => s.category));
    return Array.from(cats).sort();
  }, [schedule]);

  // Filter by category
  const filteredSchedule = useMemo(
    () => categoryFilter === "all" ? schedule : schedule.filter((s) => s.category === categoryFilter),
    [schedule, categoryFilter],
  );

  // Weekly totals: aggregate across all days by product
  const weeklyTotals = useMemo(() => {
    const map = new Map<string, {
      productName: string;
      unit: string;
      totalQuantity: number;
      category: string;
      shops: { name: string; zoneKey: string; quantity: number }[];
    }>();

    for (const item of filteredSchedule) {
      const inWeek = weekDates.some((d) => isSameDay(d, item.departureDate));
      if (!inWeek) continue;

      const k = `${item.productName}|${item.unit}`;
      const existing = map.get(k);
      if (existing) {
        existing.totalQuantity += item.totalQuantity;
        for (const shop of item.shops) {
          const s = existing.shops.find((e) => e.name === shop.name);
          if (s) s.quantity += shop.quantity;
          else existing.shops.push({ name: shop.name, zoneKey: shop.zoneKey, quantity: shop.quantity });
        }
      } else {
        map.set(k, {
          productName: item.productName,
          unit: item.unit,
          totalQuantity: item.totalQuantity,
          category: item.category,
          shops: item.shops.map((s) => ({ name: s.name, zoneKey: s.zoneKey, quantity: s.quantity })),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
  }, [filteredSchedule, weekDates]);

  // Group by day (filtered)
  const groupByDay = (dateGetter: (item: (typeof filteredSchedule)[0]) => Date) => {
    const map = new Map<number, typeof filteredSchedule>();
    for (let i = 0; i < 7; i++) map.set(i, []);
    for (const item of filteredSchedule) {
      const dayIndex = weekDates.findIndex((d) => isSameDay(d, dateGetter(item)));
      if (dayIndex >= 0) map.get(dayIndex)?.push(item);
    }
    return map;
  };

  const byDeliveryDay = useMemo(() => groupByDay((i) => i.earliestDelivery), [filteredSchedule, weekDates]);
  const byPurchaseDay = useMemo(() => groupByDay((i) => i.departureDate), [filteredSchedule, weekDates]);

  const activeMap = view === "purchase" ? byPurchaseDay : byDeliveryDay;
  const isLoading = ordersLoading || storesLoading || schedulesLoading;

  // Group weekly totals by category
  const totalsByCategory = useMemo(() => {
    const map = new Map<string, typeof weeklyTotals>();
    for (const item of weeklyTotals) {
      const arr = map.get(item.category) || [];
      arr.push(item);
      map.set(item.category, arr);
    }
    return map;
  }, [weeklyTotals]);

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
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Alla kategorier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {allCategories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tab === "daily" && (
            <Select value={view} onValueChange={(v) => setView(v as "purchase" | "delivery")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Visa per inköpsdag</SelectItem>
                <SelectItem value="delivery">Visa per leveransdag</SelectItem>
              </SelectContent>
            </Select>
          )}
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

      {/* Transport zones */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Transportzoner
            <span className="text-xs font-normal text-muted-foreground">(klicka för att ändra avgångsdag & tid)</span>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as "daily" | "total")}>
        <TabsList>
          <TabsTrigger value="daily" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Dagsvy
          </TabsTrigger>
          <TabsTrigger value="total" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Totalvy vecka
          </TabsTrigger>
        </TabsList>

        {/* ── DAILY VIEW ── */}
        <TabsContent value="daily">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">Laddar schema...</div>
          ) : (
            <div className="space-y-1">
              {weekDates.map((date, dayIndex) => {
                const items = activeMap.get(dayIndex) || [];
                const isToday = isSameDay(date, new Date());
                const isPast = date < new Date() && !isToday;
                const dayLabel = `${WEEKDAYS[dayIndex]} ${format(date, "d/M")}`;

                return (
                  <Collapsible key={dayIndex} defaultOpen={isToday || items.length > 0}>
                    <CollapsibleTrigger className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-muted/50 transition-colors ${isToday ? "bg-primary/10 text-primary" : isPast ? "opacity-50 text-muted-foreground" : "text-foreground"}`}>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform [[data-state=open]>&]:rotate-0 [[data-state=closed]>&]:-rotate-90" />
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>{dayLabel}</span>
                      {items.length > 0 && (
                        <Badge variant="outline" className="text-[9px] ml-auto py-0 h-4">
                          {items.length} {items.length === 1 ? "produkt" : "produkter"}
                        </Badge>
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {items.length === 0 ? (
                        <p className="pl-10 py-1 text-[10px] text-muted-foreground italic">Inga produkter</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-6 px-2 pl-10 text-[10px]">Produkt</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] text-right w-[80px]">Totalt</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] w-[80px]">Butiker</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] w-[120px]">
                                {view === "purchase" ? "Avgång" : "Senast inköp"}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item, i) => {
                              const isUrgent = view === "purchase" && isSameDay(item.departureDate, new Date());
                              return (
                                <Collapsible key={`${dayIndex}-${item.productName}-${i}`} asChild>
                                  <>
                                    <CollapsibleTrigger asChild>
                                      <TableRow className={`cursor-pointer hover:bg-muted/50 ${isUrgent ? "bg-destructive/5" : ""}`}>
                                        <TableCell className="px-2 pl-10 py-0.5 text-xs">
                                          <span className="flex items-center gap-1">
                                            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                                            {item.productName}
                                          </span>
                                        </TableCell>
                                        <TableCell className="px-2 py-0.5 text-xs text-right font-medium">{item.totalQuantity} {item.unit}</TableCell>
                                        <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">{item.shops.length} butik{item.shops.length > 1 ? "er" : ""}</TableCell>
                                        <TableCell className="px-2 py-0.5">
                                          <span className="text-[10px] text-muted-foreground">
                                            {view === "purchase"
                                              ? `${format(item.departureDate, "EEE d/M", { locale: sv })} ${item.departureTime}`
                                              : format(item.departureDate, "EEE d/M", { locale: sv })}
                                          </span>
                                        </TableCell>
                                      </TableRow>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent asChild>
                                      <>
                                        {item.shops.map((shop) => {
                                          const zoneScheds = zoneSchedules.get(shop.zoneKey);
                                          const zone = zoneScheds?.[0];
                                          return (
                                            <TableRow key={shop.name} className="bg-muted/30 border-0">
                                              <TableCell className="px-2 pl-14 py-0.5 text-[10px] text-muted-foreground">
                                                <Badge variant={(zone?.badge_color || "default") as any} className="text-[9px] py-0">
                                                  {shop.name}
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="px-2 py-0.5 text-[10px] text-right text-muted-foreground">{shop.quantity} {item.unit}</TableCell>
                                              <TableCell className="px-2 py-0.5" />
                                              <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {format(item.departureDate, "EEE d/M", { locale: sv })} {zone?.departure_time || item.departureTime}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </>
                                    </CollapsibleContent>
                                  </>
                                </Collapsible>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TOTAL WEEK VIEW ── */}
        <TabsContent value="total">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">Laddar...</div>
          ) : weeklyTotals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">Inga produkter att köpa in denna vecka.</p>
          ) : (
            <div className="space-y-1">
              {Array.from(totalsByCategory.entries()).map(([category, items]) => (
                <Collapsible key={category} defaultOpen>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm font-medium hover:bg-muted/50 transition-colors text-foreground">
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform [[data-state=open]>&]:rotate-0 [[data-state=closed]>&]:-rotate-90" />
                    <span>{category}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto py-0 h-4">
                      {items.length} {items.length === 1 ? "produkt" : "produkter"}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-6 px-2 pl-10 text-[10px]">Produkt</TableHead>
                          <TableHead className="h-6 px-2 text-[10px] text-right w-[100px]">Total vecka</TableHead>
                          <TableHead className="h-6 px-2 text-[10px] w-[80px]">Butiker</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <Collapsible key={item.productName} asChild>
                            <>
                              <CollapsibleTrigger asChild>
                                <TableRow className="cursor-pointer hover:bg-muted/50">
                                  <TableCell className="px-2 pl-10 py-0.5 text-xs">
                                    <span className="flex items-center gap-1">
                                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                                      {item.productName}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-2 py-0.5 text-xs text-right font-medium">{item.totalQuantity} {item.unit}</TableCell>
                                  <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">{item.shops.length} butik{item.shops.length > 1 ? "er" : ""}</TableCell>
                                </TableRow>
                              </CollapsibleTrigger>
                              <CollapsibleContent asChild>
                                <>
                                  {item.shops.map((shop) => {
                                    const zoneScheds = zoneSchedules.get(shop.zoneKey);
                                    const zone = zoneScheds?.[0];
                                    return (
                                      <TableRow key={shop.name} className="bg-muted/30 border-0">
                                        <TableCell className="px-2 pl-14 py-0.5 text-[10px] text-muted-foreground">
                                          <Badge variant={(zone?.badge_color || "default") as any} className="text-[9px] py-0">
                                            {shop.name}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="px-2 py-0.5 text-[10px] text-right text-muted-foreground">{shop.quantity} {item.unit}</TableCell>
                                        <TableCell className="px-2 py-0.5" />
                                      </TableRow>
                                    );
                                  })}
                                </>
                              </CollapsibleContent>
                            </>
                          </Collapsible>
                        ))}
                      </TableBody>
                    </Table>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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
                const count = schedule.filter((s) => s.shops.some((sh) => sh.zoneKey === zone.zone_key)).length;
                const dayName = WEEKDAYS[(zone.departure_weekday - 1) % 7];
                return (
                  <div key={zone.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={zone.badge_color as any} className="text-xs">
                        {zone.label}
                      </Badge>
                      <span className="text-lg font-bold text-foreground">{count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Avgång: {dayName} kl {zone.departure_time}
                    </p>
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
