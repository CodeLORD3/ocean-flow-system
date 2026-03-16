import { useMemo, useState, useCallback, DragEvent } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, startOfWeek, addDays, isSameDay, parseISO, getISOWeek, getYear } from "date-fns";
import { sv } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Truck, Settings2, ChevronDown, ListChecks, Ban, Package, PackageCheck, Check, Plus, User, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useCreateChangeRequest } from "@/hooks/useOrderChangeRequests";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useManualScheduleEntries } from "@/hooks/useManualScheduleEntries";

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
        <button className="flex flex-col items-start gap-1 cursor-pointer group w-full text-left">
          <div className="flex items-center gap-1 w-full">
            <Badge variant={schedule.badge_color as any} className="text-[10px] group-hover:ring-2 group-hover:ring-primary/40 transition-all">
              <Truck className="h-3 w-3 mr-1" />
              {schedule.label}
            </Badge>
            <Settings2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
          </div>
          <span className="text-[10px] text-muted-foreground font-medium">
            {schedule.departure_time}
          </span>
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
  const createChange = useCreateChangeRequest();
  const queryClient = useQueryClient();
  const { entries: manualEntries, addEntry: addManualEntry, deleteEntry: deleteManualEntry } = useManualScheduleEntries("purchase");
  const { data: allProducts } = useQuery({
    queryKey: ["products_active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit, category").eq("active", true).order("name");
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

  const [useStockLoading, setUseStockLoading] = useState<string | null>(null);

  const handleUseStock = async (lineIds: string[], _shopOrderIds: string[], productName: string) => {
    setUseStockLoading(productName);
    try {
      for (const lineId of lineIds) {
        await supabase.from("shop_order_lines").update({ ordered_elsewhere: "Lager" }).eq("id", lineId);
      }
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast.success(`"${productName}" borttagen från inköpsschema (använder befintligt lager).`);
    } catch (err) {
      toast.error("Kunde inte uppdatera orderrader.");
    } finally {
      setUseStockLoading(null);
    }
  };
  const [weekOffset, setWeekOffset] = useState(0);
  const [view, setView] = useState<"purchase" | "delivery">("purchase");
  const [tab, setTab] = useState<"daily" | "total" | "bought">("daily");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [altDialogItem, setAltDialogItem] = useState<any>(null);
  const [altProductId, setAltProductId] = useState<string>("");
  const [altSearch, setAltSearch] = useState("");
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);
  const [boughtLoading, setBoughtLoading] = useState<string | null>(null);
  
  // Multi-select state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((dayIndex: number, items: typeof filteredSchedule) => {
    const dayItems = items.filter((_, i) => {
      // We use the key format to identify items
      return true;
    });
    setSelectedKeys(prev => {
      const next = new Set(prev);
      const dayKeys = items.map(item => `${dayIndex}-${item.productName}-${item.productId}`);
      const allSelected = dayKeys.every(k => next.has(k));
      if (allSelected) {
        dayKeys.forEach(k => next.delete(k));
      } else {
        dayKeys.forEach(k => next.add(k));
      }
      return next;
    });
  }, []);

  const getSelectedItems = useCallback((map: Map<number, typeof filteredSchedule>) => {
    const result: { lineIds: string[]; productName: string; isManual?: boolean; manualEntryId?: string }[] = [];
    for (const [dayIndex, items] of map.entries()) {
      for (const item of items) {
        const key = `${dayIndex}-${item.productName}-${item.productId}`;
        if (selectedKeys.has(key)) {
          result.push({ lineIds: item.lineIds, productName: item.productName, isManual: item.isManual, manualEntryId: item.manualEntryId });
        }
      }
    }
    return result;
  }, [selectedKeys]);

  const handleBulkMove = async (targetDayIndex: number, map: Map<number, typeof filteredSchedule>) => {
    setBulkMoveLoading(true);
    try {
      const selected = getSelectedItems(map);
      const targetDate = format(weekDates[targetDayIndex], "yyyy-MM-dd");
      let movedCount = 0;

      for (const item of selected) {
        if (item.isManual && item.manualEntryId) {
          await supabase.from("manual_schedule_entries").update({ departure_date: targetDate }).eq("id", item.manualEntryId);
          movedCount++;
        } else if (item.lineIds.length > 0) {
          for (const lineId of item.lineIds) {
            await supabase.from("shop_order_lines").update({ order_date: targetDate }).eq("id", lineId);
          }
          movedCount++;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      queryClient.invalidateQueries({ queryKey: ["manual_schedule_entries"] });
      setSelectedKeys(new Set());
      toast.success(`${movedCount} produkt${movedCount > 1 ? "er" : ""} flyttade till ${WEEKDAYS[targetDayIndex]}.`);
    } catch (err) {
      toast.error("Kunde inte flytta produkterna.");
    } finally {
      setBulkMoveLoading(false);
    }
  };

  // Manual entry dialog state
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualProductSearch, setManualProductSearch] = useState("");
  const [manualProductId, setManualProductId] = useState("");
  const [manualQuantity, setManualQuantity] = useState("");
  const [manualDate, setManualDate] = useState<Date | undefined>(undefined);
  const [manualTime, setManualTime] = useState("06:00");
  const [manualNotes, setManualNotes] = useState("");

  const filteredManualProducts = useMemo(() => {
    if (!allProducts) return [];
    const s = manualProductSearch.toLowerCase();
    return allProducts.filter((p: any) => p.name.toLowerCase().includes(s) || !s).slice(0, 20);
  }, [allProducts, manualProductSearch]);

  const handleAddManualEntry = async () => {
    if (!manualProductId || !manualQuantity || !manualDate) return;
    try {
      await addManualEntry.mutateAsync({
        product_id: manualProductId,
        quantity: Number(manualQuantity),
        departure_date: format(manualDate, "yyyy-MM-dd"),
        departure_time: manualTime,
        notes: manualNotes || undefined,
      });
      toast.success("Produkt tillagd i inköpsschema.");
      setManualDialogOpen(false);
      setManualProductId("");
      setManualQuantity("");
      setManualDate(undefined);
      setManualTime("06:00");
      setManualNotes("");
      setManualProductSearch("");
    } catch {
      toast.error("Kunde inte lägga till produkt.");
    }
  };

  const handleDeleteManualEntry = async (id: string, productName: string) => {
    try {
      await deleteManualEntry.mutateAsync(id);
      toast.success(`"${productName}" borttagen.`);
    } catch {
      toast.error("Kunde inte ta bort.");
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

  // Fetch purchase report lines for current week to detect "köpt" status
  const { data: purchaseReportLines } = useQuery({
    queryKey: ["purchase_report_lines_week", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () => {
      const weekEnd = addDays(weekStart, 6);
      const { data, error } = await supabase
        .from("purchase_report_lines")
        .select("product_id, quantity, status")
        .gte("purchase_date", format(weekStart, "yyyy-MM-dd"))
        .lte("purchase_date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  // Map product_id -> total purchased quantity this week
  const purchasedMap = useMemo(() => {
    const m = new Map<string, number>();
    purchaseReportLines?.forEach((line) => {
      if (line.product_id) {
        m.set(line.product_id, (m.get(line.product_id) || 0) + line.quantity);
      }
    });
    return m;
  }, [purchaseReportLines]);

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
      purchaseDate: Date;
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
        // Skip lines already being processed or marked as "Använd lager"
        if (line.status && !["", "Ny", "Pågående"].includes(line.status)) continue;
        if (line.ordered_elsewhere === "Lager" || line.ordered_elsewhere === "Köpt") continue;

        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;

        const deliveryDate = parseISO(deliveryDateStr);
        // delivery_date IS the departure date (user picks from allowed departure weekdays)
        const departureDate = deliveryDate;
        // Find matching schedule for departure time display
        const isoWeekday = deliveryDate.getDay() === 0 ? 7 : deliveryDate.getDay(); // 1=Mon..7=Sun
        const matchingSchedule = schedules.find(s => s.departure_weekday === isoWeekday) || schedules[0];
        // order_date is the planned purchase date (set by drag & drop), defaults to departure date
        const purchaseDate = line.order_date ? parseISO(line.order_date) : departureDate;

        rawItems.push({
          storeName: store.name,
          zoneKey,
          productId: line.product_id,
          productName: line.products?.name || "Okänd produkt",
          quantity: line.quantity_ordered,
          unit: line.unit || line.products?.unit || "kg",
          deliveryDate,
          departureDate,
          purchaseDate,
          departureTime: matchingSchedule.departure_time,
          category: line.products?.category || "Övrigt",
          lineId: line.id,
          shopOrderId: order.id,
        });
      }
    }

    const key = (item: RawItem) =>
      `${item.productName}|${item.unit}|${format(item.purchaseDate, "yyyy-MM-dd")}`;

    const grouped = new Map<string, {
      productId: string;
      productName: string;
      unit: string;
      totalQuantity: number;
      shops: { name: string; zoneKey: string; quantity: number; deliveryDate: Date }[];
      departureDate: Date;
      purchaseDate: Date;
      earliestDelivery: Date;
      departureTime: string;
      category: string;
      lineIds: string[];
      shopOrderIds: string[];
      isManual?: boolean;
      manualEntryId?: string;
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
          purchaseDate: item.purchaseDate,
          earliestDelivery: item.deliveryDate,
          departureTime: item.departureTime,
          category: item.category,
          lineIds: [item.lineId],
          shopOrderIds: [item.shopOrderId],
        });
      }
    }

    // Add manual entries
    for (const entry of manualEntries) {
      const depDate = parseISO(entry.departure_date);
      const product = allProducts?.find((p: any) => p.id === entry.product_id);
      const productName = entry.products?.name || product?.name || "Okänd produkt";
      const unit = entry.products?.unit || product?.unit || "kg";
      const category = entry.products?.category || product?.category || "Övrigt";
      
      grouped.set(`manual-${entry.id}`, {
        productId: entry.product_id,
        productName,
        unit,
        totalQuantity: entry.quantity,
        shops: [],
        departureDate: depDate,
        purchaseDate: depDate,
        earliestDelivery: depDate,
        departureTime: entry.departure_time,
        category,
        lineIds: [],
        shopOrderIds: [],
        isManual: true,
        manualEntryId: entry.id,
      });
    }

    return Array.from(grouped.values());
  }, [orders, stores, transportSchedules, storeMap, zoneSchedules, manualEntries, allProducts]);

  // ── Bought items for "Köpt vecka" tab ──
  const boughtItems = useMemo(() => {
    if (!orders || !stores || !transportSchedules) return [];

    const items: {
      productId: string;
      productName: string;
      unit: string;
      totalQuantity: number;
      category: string;
      shops: { name: string; quantity: number }[];
      lineIds: string[];
      shopOrderIds: string[];
    }[] = [];

    const grouped = new Map<string, typeof items[number]>();

    for (const order of orders) {
      if (order.status === "Arkiverad") continue;
      const store = storeMap.get(order.store_id);
      if (!store) continue;

      for (const line of order.shop_order_lines || []) {
        if (line.ordered_elsewhere !== "Köpt") continue;

        const deliveryDateStr = line.delivery_date || order.desired_delivery_date;
        if (!deliveryDateStr) continue;
        const deliveryDate = parseISO(deliveryDateStr);
        const inWeek = weekDates.some((d) => isSameDay(d, deliveryDate));
        if (!inWeek) continue;

        const productName = line.products?.name || "Okänd produkt";
        const unit = line.unit || line.products?.unit || "kg";
        const k = `${productName}|${unit}`;
        const existing = grouped.get(k);

        if (existing) {
          existing.totalQuantity += line.quantity_ordered;
          existing.lineIds.push(line.id);
          if (!existing.shopOrderIds.includes(order.id)) existing.shopOrderIds.push(order.id);
          const shopEntry = existing.shops.find(s => s.name === store.name);
          if (shopEntry) shopEntry.quantity += line.quantity_ordered;
          else existing.shops.push({ name: store.name, quantity: line.quantity_ordered });
        } else {
          grouped.set(k, {
            productId: line.product_id,
            productName,
            unit,
            totalQuantity: line.quantity_ordered,
            category: line.products?.category || "Övrigt",
            shops: [{ name: store.name, quantity: line.quantity_ordered }],
            lineIds: [line.id],
            shopOrderIds: [order.id],
          });
        }
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.category.localeCompare(b.category) || a.productName.localeCompare(b.productName));
  }, [orders, stores, transportSchedules, storeMap, weekDates]);

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
      productId: string;
      productName: string;
      unit: string;
      totalQuantity: number;
      category: string;
      shops: { name: string; zoneKey: string; quantity: number }[];
      lines: { lineId: string; shopOrderId: string }[];
      isManual?: boolean;
      manualEntryId?: string;
    }>();

    for (const item of filteredSchedule) {
      const inWeek = weekDates.some((d) => isSameDay(d, item.departureDate));
      if (!inWeek) continue;

      const k = item.isManual ? `manual-${item.manualEntryId}` : `${item.productName}|${item.unit}`;
      const existing = map.get(k);
      const itemLines = item.lineIds.map((lid, idx) => ({ lineId: lid, shopOrderId: item.shopOrderIds[Math.min(idx, item.shopOrderIds.length - 1)] }));
      if (existing && !item.isManual) {
        existing.totalQuantity += item.totalQuantity;
        existing.lines.push(...itemLines);
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
          lines: [...itemLines],
          isManual: item.isManual,
          manualEntryId: item.manualEntryId,
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
  const byPurchaseDay = useMemo(() => groupByDay((i) => i.purchaseDate), [filteredSchedule, weekDates]);

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

  const filteredAltProducts = useMemo(() => {
    if (!allProducts) return [];
    const s = altSearch.toLowerCase();
    return allProducts.filter((p: any) =>
      p.id !== altDialogItem?.productId &&
      (p.name.toLowerCase().includes(s) || !s)
    ).slice(0, 20);
  }, [allProducts, altSearch, altDialogItem]);

  const handleMarkUnavailable = async (item: typeof weeklyTotals[0]) => {
    for (const line of item.lines) {
      await createChange.mutateAsync({
        shop_order_id: line.shopOrderId,
        order_line_id: line.lineId,
        change_type: "product_unavailable",
        product_id: item.productId,
        old_value: String(item.totalQuantity),
        new_value: "0",
        unit: item.unit,
        requested_by: "grossist",
      });
    }
    toast.success(`"${item.productName}" markerad som ej tillgänglig för ${item.lines.length} orderrad(er).`);
  };

  const handleSuggestAlternative = async () => {
    if (!altDialogItem || !altProductId) return;
    const altProduct = allProducts?.find((p: any) => p.id === altProductId);
    for (const line of altDialogItem.lines) {
      await createChange.mutateAsync({
        shop_order_id: line.shopOrderId,
        order_line_id: line.lineId,
        change_type: "product_alternative",
        product_id: altProductId,
        old_value: altDialogItem.productId,
        new_value: altProduct?.name || altProductId,
        unit: altDialogItem.unit,
        requested_by: "grossist",
      });
    }
    toast.success(`Alternativ "${altProduct?.name}" föreslagit för "${altDialogItem.productName}" (${altDialogItem.lines.length} orderrader).`);
    setAltDialogItem(null);
    setAltProductId("");
    setAltSearch("");
  };

  // ── Drag & Drop handlers ──
  const handleDragStart = (e: DragEvent<HTMLTableRowElement>, item: (typeof filteredSchedule)[0]) => {
    e.dataTransfer.setData("application/json", JSON.stringify({
      lineIds: item.lineIds,
      productName: item.productName,
    }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>, dayIndex: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayIndex);
  };

  const handleDragLeave = () => {
    setDragOverDay(null);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>, dayIndex: number) => {
    e.preventDefault();
    setDragOverDay(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      const targetDate = format(weekDates[dayIndex], "yyyy-MM-dd");
      
      for (const lineId of data.lineIds) {
        await supabase.from("shop_order_lines").update({ order_date: targetDate }).eq("id", lineId);
      }
      
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast.success(`"${data.productName}" flyttad till ${WEEKDAYS[dayIndex]}.`);
    } catch (err) {
      toast.error("Kunde inte flytta produktraden.");
    }
  };

  // ── "Köpt" handler ──
  const handleMarkBought = async (lineIds: string[], shopOrderIds: string[], productName: string) => {
    setBoughtLoading(productName);
    try {
      for (const lineId of lineIds) {
        await supabase.from("shop_order_lines").update({ ordered_elsewhere: "Köpt" }).eq("id", lineId);
      }
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast.success(`"${productName}" markerad som köpt.`);
    } catch (err) {
      toast.error("Kunde inte uppdatera.");
    } finally {
      setBoughtLoading(null);
    }
  };

  // ── "Ångra köpt" handler ──
  const [undoBoughtLoading, setUndoBoughtLoading] = useState<string | null>(null);
  const handleUndoBought = async (lineIds: string[], productName: string) => {
    setUndoBoughtLoading(productName);
    try {
      for (const lineId of lineIds) {
        await supabase.from("shop_order_lines").update({ ordered_elsewhere: null }).eq("id", lineId);
      }
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast.success(`"${productName}" återställd till inköpsschema.`);
    } catch (err) {
      toast.error("Kunde inte ångra.");
    } finally {
      setUndoBoughtLoading(null);
    }
  };


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
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setManualDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Lägg till produkt
          </Button>
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

      {/* Transport zones - collapsible */}
      <Collapsible>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 transition-colors">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Transportzoner
                <span className="text-xs font-normal text-muted-foreground">(klicka för att visa/dölja)</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto transition-transform [[data-state=open]_&]:rotate-180" />
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
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
                            <TransportZoneBadge key={s.id} schedule={s} onSave={handleSaveSchedule} />
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
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "daily" | "total" | "bought")}>
        <TabsList>
          <TabsTrigger value="daily" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Dagsvy
          </TabsTrigger>
          <TabsTrigger value="total" className="gap-1.5">
            <ListChecks className="h-3.5 w-3.5" />
            Totalvy vecka
          </TabsTrigger>
          <TabsTrigger value="bought" className="gap-1.5">
            <PackageCheck className="h-3.5 w-3.5" />
            Köpt vecka {boughtItems.length > 0 && <Badge variant="secondary" className="ml-1 text-[9px] px-1.5 py-0">{boughtItems.length}</Badge>}
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
                const isDragTarget = dragOverDay === dayIndex;

                return (
                  <div
                    key={dayIndex}
                    onDragOver={(e) => handleDragOver(e, dayIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dayIndex)}
                    className={`rounded-md transition-colors ${isDragTarget ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                  >
                    <Collapsible defaultOpen={isToday || items.length > 0}>
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
                                <TableHead className="h-6 px-2 w-[32px]">
                                  <Checkbox
                                    checked={items.length > 0 && items.every(item => selectedKeys.has(`${dayIndex}-${item.productName}-${item.productId}`))}
                                    onCheckedChange={() => toggleSelectAll(dayIndex, items)}
                                    className="h-3.5 w-3.5"
                                  />
                                </TableHead>
                                <TableHead className="h-6 px-2 text-[10px]">Produkt</TableHead>
                                <TableHead className="h-6 px-2 text-[10px] text-right w-[80px]">Totalt</TableHead>
                                <TableHead className="h-6 px-2 text-[10px] text-right w-[70px]">Lager</TableHead>
                                <TableHead className="h-6 px-2 text-[10px] text-right w-[70px]">Köpt</TableHead>
                                <TableHead className="h-6 px-2 text-[10px] w-[80px]">Butiker</TableHead>
                                <TableHead className="h-6 px-2 text-[10px] w-[120px]">
                                  {view === "purchase" ? "Avgång" : "Senast inköp"}
                                </TableHead>
                                <TableHead className="h-6 px-2 text-[10px] w-[110px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((item, i) => {
                                const isUrgent = view === "purchase" && isSameDay(item.departureDate, new Date());
                                const stock = stockMap.get(item.productId) || 0;
                                const hasSufficientStock = stock >= item.totalQuantity;
                                const purchased = purchasedMap.get(item.productId) || 0;
                                const isPurchased = purchased >= item.totalQuantity;
                                
                                const rowBg = isPurchased
                                  ? "bg-green-100 dark:bg-green-900/30"
                                  : hasSufficientStock
                                  ? "bg-yellow-100 dark:bg-yellow-900/30"
                                  : isUrgent
                                  ? "bg-destructive/5"
                                  : "";

                                return (
                                  <Collapsible key={`${dayIndex}-${item.productName}-${i}`} asChild>
                                    <>
                                      <CollapsibleTrigger asChild>
                                        <TableRow
                                          draggable
                                          onDragStart={(e) => handleDragStart(e, item)}
                                          className={`cursor-grab active:cursor-grabbing hover:bg-muted/50 ${rowBg} ${selectedKeys.has(`${dayIndex}-${item.productName}-${item.productId}`) ? "ring-1 ring-inset ring-primary/40" : ""}`}
                                        >
                                          <TableCell className="px-2 py-0.5" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={selectedKeys.has(`${dayIndex}-${item.productName}-${item.productId}`)}
                                              onCheckedChange={() => toggleSelect(`${dayIndex}-${item.productName}-${item.productId}`)}
                                              className="h-3.5 w-3.5"
                                            />
                                          </TableCell>
                                          <TableCell className="px-2 py-0.5 text-xs">
                                            <span className="flex items-center gap-1">
                                              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                                              {item.productName}
                                              {item.isManual && (
                                                <Badge variant="outline" className="text-[8px] py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                                  <User className="h-2.5 w-2.5 mr-0.5" />Manuell
                                                </Badge>
                                              )}
                                            </span>
                                          </TableCell>
                                          <TableCell className="px-2 py-0.5 text-xs text-right font-medium">{item.totalQuantity} {item.unit}</TableCell>
                                          <TableCell className={`px-2 py-0.5 text-xs text-right ${hasSufficientStock ? "font-semibold text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>{stock} {item.unit}</TableCell>
                                          <TableCell className={`px-2 py-0.5 text-xs text-right ${isPurchased ? "font-semibold text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                                            {purchased > 0 ? `${purchased} ${item.unit}` : "—"}
                                          </TableCell>
                                          <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">{item.shops.length} butik{item.shops.length > 1 ? "er" : ""}</TableCell>
                                          <TableCell className="px-2 py-0.5">
                                            <span className="text-[10px] text-muted-foreground">
                                              {view === "purchase"
                                                ? `${format(item.departureDate, "EEE d/M", { locale: sv })} ${item.departureTime}`
                                                : format(item.departureDate, "EEE d/M", { locale: sv })}
                                            </span>
                                          </TableCell>
                                          <TableCell className="px-2 py-0.5" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center gap-1">
                                              {item.isManual ? (
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                                  onClick={() => handleDeleteManualEntry(item.manualEntryId!, item.productName)}
                                                >
                                                  <Trash2 className="h-3 w-3" /> Ta bort
                                                </Button>
                                              ) : (
                                                <>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-6 text-[10px] gap-1 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10"
                                                    onClick={() => handleMarkBought(item.lineIds, item.shopOrderIds, item.productName)}
                                                    disabled={boughtLoading === item.productName}
                                                  >
                                                    <Check className="h-3 w-3" /> Bekräfta
                                                  </Button>
                                                  {hasSufficientStock && (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="h-6 text-[10px] gap-1 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                                                      onClick={() => handleUseStock(item.lineIds, item.shopOrderIds, item.productName)}
                                                      disabled={useStockLoading === item.productName}
                                                    >
                                                      <PackageCheck className="h-3 w-3" /> Använd lager
                                                    </Button>
                                                  )}
                                                </>
                                              )}
                                            </div>
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
                                                <TableCell className="px-2 py-0.5" />
                                                <TableCell className="px-2 py-0.5" />
                                                <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">
                                                  {format(item.departureDate, "EEE d/M", { locale: sv })} {zone?.departure_time || item.departureTime}
                                                </TableCell>
                                                <TableCell className="px-2 py-0.5" />
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
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Floating bulk move bar ── */}
        {selectedKeys.size > 0 && tab === "daily" && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 max-w-[95vw]">
            <span className="text-sm font-medium text-foreground whitespace-nowrap">
              {selectedKeys.size} markerade
            </span>
            <div className="h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">Flytta till:</span>
            <div className="flex items-center gap-1 flex-wrap">
              {WEEKDAYS.map((day, idx) => (
                <Button
                  key={idx}
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px] px-2"
                  disabled={bulkMoveLoading}
                  onClick={() => handleBulkMove(idx, activeMap)}
                >
                  {day.slice(0, 3)}
                </Button>
              ))}
            </div>
            <div className="h-4 w-px bg-border" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => setSelectedKeys(new Set())}
            >
              Avmarkera
            </Button>
          </div>
        )}

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
                          <TableHead className="h-6 px-2 text-[10px] text-right w-[70px]">Lager</TableHead>
                          <TableHead className="h-6 px-2 text-[10px] text-right w-[70px]">Köpt</TableHead>
                          <TableHead className="h-6 px-2 text-[10px] w-[80px]">Butiker</TableHead>
                          <TableHead className="h-6 px-2 text-[10px] text-center w-[260px]">Åtgärd</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => {
                          const stock = stockMap.get(item.productId) || 0;
                          const hasSufficientStock = stock >= item.totalQuantity;
                          const purchased = purchasedMap.get(item.productId) || 0;
                          const isPurchased = purchased >= item.totalQuantity;
                          
                          const rowBg = isPurchased
                            ? "bg-green-100 dark:bg-green-900/30"
                            : hasSufficientStock
                            ? "bg-yellow-100 dark:bg-yellow-900/30"
                            : "";

                          return (
                          <Collapsible key={item.productName} asChild>
                            <>
                              <CollapsibleTrigger asChild>
                                <TableRow className={`cursor-pointer hover:bg-muted/50 ${rowBg}`}>
                                   <TableCell className="px-2 pl-10 py-0.5 text-xs">
                                    <span className="flex items-center gap-1">
                                      <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform [[data-state=open]_&]:rotate-180" />
                                      {item.productName}
                                      {item.isManual && (
                                        <Badge variant="outline" className="text-[8px] py-0 px-1 border-primary/40 text-primary bg-primary/5">
                                          <User className="h-2.5 w-2.5 mr-0.5" />Manuell
                                        </Badge>
                                      )}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-2 py-0.5 text-xs text-right font-medium">{item.totalQuantity} {item.unit}</TableCell>
                                  <TableCell className={`px-2 py-0.5 text-xs text-right ${hasSufficientStock ? "font-semibold text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>{stock} {item.unit}</TableCell>
                                  <TableCell className={`px-2 py-0.5 text-xs text-right ${isPurchased ? "font-semibold text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                                    {purchased > 0 ? `${purchased} ${item.unit}` : "—"}
                                  </TableCell>
                                  <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">
                                    {item.isManual ? "—" : `${item.shops.length} butik${item.shops.length > 1 ? "er" : ""}`}
                                  </TableCell>
                                  <TableCell className="px-2 py-0.5 text-center" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-center gap-1">
                                      {item.isManual ? (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                          onClick={() => handleDeleteManualEntry(item.manualEntryId!, item.productName)}
                                        >
                                          <Trash2 className="h-3 w-3" /> Ta bort
                                        </Button>
                                      ) : (
                                        <>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px] gap-1 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/10"
                                            onClick={() => handleMarkBought(item.lines.map(l => l.lineId), item.lines.map(l => l.shopOrderId), item.productName)}
                                            disabled={boughtLoading === item.productName}
                                          >
                                            <Check className="h-3 w-3" /> Bekräfta
                                          </Button>
                                          {hasSufficientStock && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="h-6 text-[10px] gap-1 text-yellow-700 dark:text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10"
                                              onClick={() => handleUseStock(item.lines.map(l => l.lineId), item.lines.map(l => l.shopOrderId), item.productName)}
                                              disabled={useStockLoading === item.productName}
                                            >
                                              <PackageCheck className="h-3 w-3" /> Använd lager
                                            </Button>
                                          )}
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                                            onClick={() => handleMarkUnavailable(item)}
                                            disabled={createChange.isPending}
                                          >
                                            <Ban className="h-3 w-3" /> Ej tillgänglig
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-[10px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                            onClick={() => { setAltDialogItem(item); setAltProductId(""); setAltSearch(""); }}
                                            disabled={createChange.isPending}
                                          >
                                            <Package className="h-3 w-3" /> Alternativ
                                          </Button>
                                        </>
                                      )}
                                    </div>
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
                                        <TableCell className="px-2 py-0.5" />
                                        <TableCell className="px-2 py-0.5" />
                                        <TableCell className="px-2 py-0.5" />
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
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </TabsContent>
        {/* ── BOUGHT WEEK VIEW ── */}
        <TabsContent value="bought">
          {boughtItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
              <PackageCheck className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm">Inga produkter markerade som köpta denna vecka.</p>
            </div>
          ) : (
            <Card className="shadow-card">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 h-7">
                      <TableHead className="h-7 px-2 text-[10px]">Produkt</TableHead>
                      <TableHead className="h-7 px-2 text-[10px]">Kategori</TableHead>
                      <TableHead className="h-7 px-2 text-[10px] text-right">Antal</TableHead>
                      <TableHead className="h-7 px-2 text-[10px]">Enhet</TableHead>
                      <TableHead className="h-7 px-2 text-[10px]">Butiker</TableHead>
                      <TableHead className="h-7 px-2 text-[10px] text-right">Åtgärd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {boughtItems.map((item) => (
                      <TableRow key={`${item.productName}-${item.unit}`} className="h-8 bg-success/5">
                        <TableCell className="px-2 py-0.5 text-[11px] font-medium text-foreground">{item.productName}</TableCell>
                        <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">{item.category}</TableCell>
                        <TableCell className="px-2 py-0.5 text-[11px] text-right font-mono text-foreground">{item.totalQuantity}</TableCell>
                        <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">{item.unit}</TableCell>
                        <TableCell className="px-2 py-0.5 text-[10px] text-muted-foreground">
                          {item.shops.map(s => `${s.name} (${s.quantity})`).join(", ")}
                        </TableCell>
                        <TableCell className="px-2 py-0.5 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleUndoBought(item.lineIds, item.productName)}
                            disabled={undoBoughtLoading === item.productName}
                          >
                            <Ban className="h-3 w-3" />
                            Ångra
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

      </Tabs>

      {/* Alternative product dialog */}
      <Dialog open={!!altDialogItem} onOpenChange={(open) => { if (!open) setAltDialogItem(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Föreslå alternativ produkt</DialogTitle>
            <DialogDescription className="text-xs">
              Ersätt <span className="font-semibold">{altDialogItem?.productName}</span> med en alternativ produkt. Förfrågan skickas till berörda butiker.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Sök produkt..."
              value={altSearch}
              onChange={(e) => setAltSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="max-h-48 overflow-y-auto border rounded-md">
              {filteredAltProducts.map((p: any) => (
                <div
                  key={p.id}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-muted/50 flex items-center justify-between ${altProductId === p.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => setAltProductId(p.id)}
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.unit}</span>
                </div>
              ))}
              {filteredAltProducts.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">Inga produkter hittades.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAltDialogItem(null)}>Avbryt</Button>
            <Button size="sm" disabled={!altProductId || createChange.isPending} onClick={handleSuggestAlternative}>
              Föreslå alternativ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual entry dialog */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Lägg till produkt manuellt</DialogTitle>
            <DialogDescription className="text-xs">
              Lägg till en produkt i inköpsschemat för egen bevakning. Denna visas med en "Manuell"-märkning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Produkt</Label>
              <Input
                placeholder="Sök produkt..."
                value={manualProductSearch}
                onChange={(e) => setManualProductSearch(e.target.value)}
                className="h-8 text-xs"
              />
              <div className="max-h-36 overflow-y-auto border rounded-md mt-1">
                {filteredManualProducts.map((p: any) => (
                  <div
                    key={p.id}
                    className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-muted/50 flex items-center justify-between ${manualProductId === p.id ? "bg-primary/10 font-medium" : ""}`}
                    onClick={() => { setManualProductId(p.id); setManualProductSearch(p.name); }}
                  >
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">{p.unit}</span>
                  </div>
                ))}
                {filteredManualProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground p-3">Inga produkter hittades.</p>
                )}
              </div>
            </div>
            <div>
              <Label className="text-xs">Antal</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={manualQuantity}
                onChange={(e) => setManualQuantity(e.target.value)}
                className="h-8 text-xs"
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">Avgångsdag</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left text-xs h-8", !manualDate && "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5 mr-1" />
                    {manualDate ? format(manualDate, "EEE d MMM yyyy", { locale: sv }) : "Välj datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={manualDate}
                    onSelect={setManualDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Avgångstid</Label>
              <Input
                type="time"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Anteckning (valfritt)</Label>
              <Input
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                className="h-8 text-xs"
                placeholder="T.ex. anledning"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManualDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" disabled={!manualProductId || !manualQuantity || !manualDate || addManualEntry.isPending} onClick={handleAddManualEntry}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
