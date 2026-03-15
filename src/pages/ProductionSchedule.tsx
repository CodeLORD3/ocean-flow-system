import { useMemo, useState } from "react";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, startOfWeek, addDays, isSameDay, parseISO, getISOWeek, getYear, getDay } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Truck, ChevronDown, ListChecks, Factory, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"];

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

export default function ProductionSchedule() {
  const { data: orders, isLoading: ordersLoading } = useShopOrders();
  const { data: stores, isLoading: storesLoading } = useStores();
  const { data: transportSchedules, isLoading: schedulesLoading } = useTransportSchedules();
  const queryClient = useQueryClient();

  // Fetch products with producer info to filter production products
  const { data: productsWithProducer } = useQuery({
    queryKey: ["products_with_producer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, producer")
        .eq("active", true);
      if (error) throw error;
      return data;
    },
  });

  // Fetch stock from Grossist Flytande
  const { data: grossistStock } = useQuery({
    queryKey: ["grossist_flytande_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("product_id, quantity, storage_locations!inner(name)")
        .eq("storage_locations.name", "Grossist Flytande")
        .gt("quantity", 0);
      if (error) throw error;
      return data as { product_id: string; quantity: number }[];
    },
  });

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    grossistStock?.forEach((s) => {
      m.set(s.product_id, (m.get(s.product_id) || 0) + s.quantity);
    });
    return m;
  }, [grossistStock]);

  const productionProductIds = useMemo(() => {
    if (!productsWithProducer) return new Set<string>();
    return new Set(
      productsWithProducer
        .filter((p: any) => p.producer === "Produktion" || p.producer === "Inköp/Produktion")
        .map((p: any) => p.id)
    );
  }, [productsWithProducer]);

  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"production" | "delivery">("production");
  const [tab, setTab] = useState<"daily" | "total">("daily");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [useStockLoading, setUseStockLoading] = useState<string | null>(null);

  const handleUseStock = async (lineIds: string[], shopOrderIds: string[], productName: string) => {
    setUseStockLoading(productName);
    try {
      for (const lineId of lineIds) {
        await supabase.from("shop_order_lines").update({ status: "Packad" }).eq("id", lineId);
      }
      const uniqueOrderIds = [...new Set(shopOrderIds)];
      for (const orderId of uniqueOrderIds) {
        const { data: allLines } = await supabase.from("shop_order_lines").select("status").eq("shop_order_id", orderId);
        if (allLines) {
          const allPacked = allLines.every((l) => l.status === "Packad");
          const anyPacked = allLines.some((l) => l.status === "Packad");
          if (allPacked) {
            await supabase.from("shop_orders").update({ status: "Packad" }).eq("id", orderId);
          } else if (anyPacked) {
            await supabase.from("shop_orders").update({ status: "Pågående" }).eq("id", orderId);
          }
        }
      }
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      queryClient.invalidateQueries({ queryKey: ["grossist_flytande_stock"] });
      toast.success(`"${productName}" markerad som packad från befintligt lager.`);
    } catch (err) {
      toast.error("Kunde inte uppdatera orderrader.");
    } finally {
      setUseStockLoading(null);
    }
  };

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

  const zoneSchedules = useMemo(() => {
    const m = new Map<string, NonNullable<typeof transportSchedules>[number][]>();
    transportSchedules?.forEach((s) => {
      const arr = m.get(s.zone_key) || [];
      arr.push(s);
      m.set(s.zone_key, arr);
    });
    return m;
  }, [transportSchedules]);

  const schedule = useMemo(() => {
    if (!orders || !stores || !transportSchedules) return [];

    type RawItem = {
      storeName: string;
      zoneKey: string;
      productId: string;
      productName: string;
      quantity: number;
      unit: string;
      deliveryDate: Date;
      departureDate: Date;
      departureTime: string;
      category: string;
      lineId: string;
      shopOrderId: string;
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
        // Only include production products
        if (!productionProductIds.has(line.product_id)) continue;
        // Skip lines already being processed (in Grossist Flytande or beyond)
        if (line.status && !["", "Ny"].includes(line.status)) continue;

        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;

        const deliveryDate = parseISO(deliveryDateStr);
        const jsDay = getDay(deliveryDate);
        const isoDay = jsDay === 0 ? 7 : jsDay;
        const matchingSchedule = schedules.find(s => s.departure_weekday === isoDay) || schedules[0];
        const departureDate = deliveryDate;

        rawItems.push({
          storeName: store.name,
          zoneKey,
          productId: line.product_id,
          productName: line.products?.name || "Okänd produkt",
          quantity: line.quantity_ordered,
          unit: line.unit || line.products?.unit || "kg",
          deliveryDate,
          departureDate,
          departureTime: matchingSchedule.departure_time,
          category: line.products?.category || "Övrigt",
          lineId: line.id,
          shopOrderId: order.id,
        });
      }
    }

    const key = (item: RawItem) =>
      `${item.productName}|${item.unit}|${format(item.departureDate, "yyyy-MM-dd")}`;

    const grouped = new Map<string, {
      productId: string;
      productName: string;
      unit: string;
      totalQuantity: number;
      shops: { name: string; zoneKey: string; quantity: number; deliveryDate: Date }[];
      departureDate: Date;
      earliestDelivery: Date;
      departureTime: string;
      category: string;
      lineIds: string[];
      shopOrderIds: string[];
    }>();

    for (const item of rawItems) {
      const k = key(item);
      const existing = grouped.get(k);
      if (existing) {
        existing.totalQuantity += item.quantity;
        existing.lineIds.push(item.lineId);
        if (!existing.shopOrderIds.includes(item.shopOrderId)) existing.shopOrderIds.push(item.shopOrderId);
        const shopEntry = existing.shops.find((s) => s.name === item.storeName);
        if (shopEntry) {
          shopEntry.quantity += item.quantity;
        } else {
          existing.shops.push({ name: item.storeName, zoneKey: item.zoneKey, quantity: item.quantity, deliveryDate: item.deliveryDate });
        }
        if (item.deliveryDate < existing.earliestDelivery) existing.earliestDelivery = item.deliveryDate;
      } else {
        grouped.set(k, {
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          totalQuantity: item.quantity,
          shops: [{ name: item.storeName, zoneKey: item.zoneKey, quantity: item.quantity, deliveryDate: item.deliveryDate }],
          departureDate: item.departureDate,
          earliestDelivery: item.deliveryDate,
          departureTime: item.departureTime,
          category: item.category,
          lineIds: [item.lineId],
          shopOrderIds: [item.shopOrderId],
        });
      }
    }

    return Array.from(grouped.values());
  }, [orders, stores, transportSchedules, storeMap, zoneSchedules, productionProductIds]);

  const allCategories = useMemo(() => {
    const cats = new Set(schedule.map((s) => s.category));
    return Array.from(cats).sort();
  }, [schedule]);

  const filteredSchedule = useMemo(
    () => categoryFilter === "all" ? schedule : schedule.filter((s) => s.category === categoryFilter),
    [schedule, categoryFilter],
  );

  const weeklyTotals = useMemo(() => {
    const map = new Map<string, {
      productId: string;
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
          productId: item.productId,
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
  const byProductionDay = useMemo(() => groupByDay((i) => i.departureDate), [filteredSchedule, weekDates]);

  const activeMap = view === "production" ? byProductionDay : byDeliveryDay;
  const isLoading = ordersLoading || storesLoading || schedulesLoading;

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
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Factory className="h-6 w-6 text-amber-500" />
            Produktionsschema
          </h1>
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
            <Select value={view} onValueChange={(v) => setView(v as "production" | "delivery")}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Visa per produktionsdag</SelectItem>
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

      {/* Transport zones info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            Transportzoner
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
            {WEEKDAYS.map((dayName, index) => {
              const daySchedules = transportSchedules
                ?.filter(s => s.departure_weekday === index + 1)
                .sort((a, b) => a.departure_time.localeCompare(b.departure_time)) || [];
                
              return (
                <div key={dayName} className="flex flex-col gap-2 rounded-md border bg-muted/10 p-2.5">
                  <h4 className="font-semibold text-[11px] text-muted-foreground uppercase">{dayName}</h4>
                  <div className="flex flex-col gap-2.5">
                    {daySchedules.length > 0 ? (
                      daySchedules.map(s => (
                        <div key={s.id} className="flex flex-col items-start gap-1">
                          <Badge variant={s.badge_color as any} className="text-[10px]">
                            <Truck className="h-3 w-3 mr-1" />
                            {s.label}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {s.departure_time}
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Inga avgångar</span>
                    )}
                  </div>
                </div>
              );
            })}
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
                        <p className="pl-10 py-1 text-[10px] text-muted-foreground italic">Inga produkter att producera</p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-6 px-2 pl-10 text-[10px]">Produkt</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] text-right w-[80px]">Totalt</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] w-[80px]">Butiker</TableHead>
                              <TableHead className="h-6 px-2 text-[10px] w-[120px]">
                                {view === "production" ? "Avgång" : "Senast producerat"}
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.map((item, i) => {
                              const isUrgent = view === "production" && isSameDay(item.departureDate, new Date());
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
                                            {view === "production"
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
            <p className="text-sm text-muted-foreground py-10 text-center">Inga produkter att producera denna vecka.</p>
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
              <AlertTriangle className="h-4 w-4 text-warning" />
              Sammanfattning denna vecka
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {Array.from(zoneSchedules.entries()).map(([zoneKey, scheds]) => {
                const count = schedule.filter((s) => s.shops.some((sh) => sh.zoneKey === zoneKey)).length;
                const dayNames = scheds.map(s => WEEKDAYS[(s.departure_weekday - 1) % 7]).join(", ");
                const zone = scheds[0];
                return (
                  <div key={zoneKey} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={zone.badge_color as any} className="text-xs">
                        {zone.label}
                      </Badge>
                      <span className="text-lg font-bold text-foreground">{count}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Avgång: {dayNames} kl {zone.departure_time}
                    </p>
                    <p className="text-xs text-muted-foreground">{count} produkt{count !== 1 ? "er" : ""} att producera</p>
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
