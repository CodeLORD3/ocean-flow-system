import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Search, Clock, CheckCircle2, Truck, XCircle, Package,
  Eye, ListChecks, ChefHat, AlertTriangle, Archive, Bell, Check, X, Ban, Printer, ArrowRight, Plus, CalendarIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useCustomers } from "@/hooks/useCustomers";
import { useProducts } from "@/hooks/useProducts";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAllPendingChangeRequests, useResolveChangeRequest, useCreateChangeRequest } from "@/hooks/useOrderChangeRequests";
import PackingSlip from "@/components/PackingSlip";
import DeliveryNote from "@/components/DeliveryNote";
import { moveStockToTransport } from "@/lib/stockTransfer";
import { useUpdateOrderLineStatus, STATUS_FLOW } from "@/hooks/useUpdateOrderLineStatus";
import { useAllStockByLocation } from "@/hooks/useStorageLocations";

type WholesaleOrderLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
};

function getStoreZoneKey(store: { city: string; name: string }): string {
  const city = (store.city || "").toLowerCase();
  const name = (store.name || "").toLowerCase();
  if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) return "gothenburg";
  if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) return "stockholm";
  return "international";
}

const statusColor: Record<string, string> = {
  Ny: "",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-success/15 text-success border-success/20",
  Skickad: "bg-primary/15 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3 w-3" />,
  Pågående: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
};

const LINE_STATUSES = ["", "Pågående", "Producerad", "Packad", "Skickad", "Ej tillgänglig"];

export default function WholesaleOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: transportSchedules = [] } = useTransportSchedules();
  const retailStores = stores.filter(s => !s.is_wholesale);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const toggleExpandOrder = (id: string) => setExpandedOrderId(prev => prev === id ? null : id);
  // Keep selectedOrder for compatibility with other dialogs that reference it
  const selectedOrderId = expandedOrderId;
  const setSelectedOrderId = setExpandedOrderId;
  const selectedOrder = useMemo(() => selectedOrderId ? orders.find((o: any) => o.id === selectedOrderId) || null : null, [selectedOrderId, orders]);
  const [reportViewOrder, setReportViewOrder] = useState<any>(null);
  const [archiveConfirmOrder, setArchiveConfirmOrder] = useState<any>(null);
  const [packingSlipOrder, setPackingSlipOrder] = useState<any>(null);
  const [deliveryNoteOrder, setDeliveryNoteOrder] = useState<any>(null);
  // Packer name dialog state
  const [packerDialogOpen, setPackerDialogOpen] = useState(false);
  const [packerName, setPackerName] = useState("");
  const [pendingPackerOrderId, setPendingPackerOrderId] = useState<string | null>(null);
  const { data: pendingChanges = [] } = useAllPendingChangeRequests();
  const resolveChange = useResolveChangeRequest();

  // Wholesale order creation state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [newOrderLines, setNewOrderLines] = useState<WholesaleOrderLine[]>([]);
  const [newOrderNote, setNewOrderNote] = useState("");
  const [newOrderDeliveryDate, setNewOrderDeliveryDate] = useState<Date | undefined>(undefined);
  const [newProductSearch, setNewProductSearch] = useState("");
  const [newHighlightedIndex, setNewHighlightedIndex] = useState(-1);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);

  // Determine the selected customer's store for zone/date filtering
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedStore = selectedCustomer?.store_id ? stores.find(s => s.id === selectedCustomer.store_id) : null;

  const allowedWeekdays = useMemo(() => {
    if (!selectedStore) return null;
    const zoneKey = getStoreZoneKey(selectedStore as any);
    const days = transportSchedules.filter(s => s.zone_key === zoneKey).map(s => s.departure_weekday);
    return days.length > 0 ? new Set(days) : null;
  }, [selectedStore, transportSchedules]);

  const isNewOrderDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    if (!allowedWeekdays) return false;
    const jsDay = getDay(date);
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !allowedWeekdays.has(isoDay);
  };

  const filteredNewProducts = products.filter(p =>
    newProductSearch &&
    (p.name.toLowerCase().includes(newProductSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(newProductSearch.toLowerCase())) &&
    !newOrderLines.find(l => l.product_id === p.id)
  ).slice(0, 8);

  const addNewProduct = (p: any) => {
    setNewOrderLines(prev => [...prev, {
      product_id: p.id, product_name: p.name, unit: p.unit, quantity: "",
    }]);
    setNewProductSearch("");
    setNewHighlightedIndex(-1);
  };

  const updateNewLine = (idx: number, qty: string) => {
    setNewOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  const removeNewLine = (idx: number) => {
    setNewOrderLines(prev => prev.filter((_, i) => i !== idx));
  };

  const resetCreateDialog = () => {
    setSelectedCustomerId("");
    setNewOrderLines([]);
    setNewOrderNote("");
    setNewOrderDeliveryDate(undefined);
    setNewProductSearch("");
    setNewHighlightedIndex(-1);
  };

  const handleCreateWholesaleOrder = async () => {
    const validLines = newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0);
    if (validLines.length === 0 || !selectedCustomer?.store_id || !newOrderDeliveryDate) return;

    const weekNum = `V${Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;

    const { data: order, error } = await supabase
      .from("shop_orders")
      .insert({
        store_id: selectedCustomer.store_id,
        order_week: weekNum,
        notes: newOrderNote || null,
        status: "Ny",
        created_by: "Grossist",
        desired_delivery_date: format(newOrderDeliveryDate, "yyyy-MM-dd"),
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    const deliveryDateStr = format(newOrderDeliveryDate, "yyyy-MM-dd");
    const lines = validLines.map(l => ({
      shop_order_id: order.id,
      product_id: l.product_id,
      quantity_ordered: Number(l.quantity),
      unit: l.unit,
      delivery_date: deliveryDateStr,
    }));

    const { error: lineError } = await supabase.from("shop_order_lines").insert(lines);
    if (lineError) {
      toast({ title: "Fel vid orderrader", description: lineError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Order skapad!", description: `${validLines.length} produkter beställda åt ${selectedCustomer.name}` });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setCreateDialogOpen(false);
    resetCreateDialog();
  };

  // Customers with store_id (linked to a shop)
  const linkedCustomers = customers.filter(c => c.store_id);

  // Fetch all receiving reports
  const { data: allReports = [] } = useQuery({
    queryKey: ["delivery_receiving_reports_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_receiving_reports")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Group reports by order id
  const reportsByOrder = useMemo(() => {
    const map = new Map<string, any[]>();
    allReports.forEach((r: any) => {
      if (!map.has(r.shop_order_id)) map.set(r.shop_order_id, []);
      map.get(r.shop_order_id)!.push(r);
    });
    return map;
  }, [allReports]);

  // Split active vs archived
  const activeOrders = orders.filter((o: any) => o.status !== "Arkiverad");
  const archivedOrders = orders.filter((o: any) => o.status === "Arkiverad");

  // Filter orders (active only)
  const filteredOrders = activeOrders.filter((o: any) => {
    const matchSearch = !search || o.order_week?.includes(search) || o.stores?.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "Alla" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalOrders = activeOrders.length;
  const newOrders = activeOrders.filter((o: any) => o.status === "Ny").length;
  const inProgress = activeOrders.filter((o: any) => o.status === "Pågående").length;

  // Aggregated total view: group all order lines by product
  const aggregated = useMemo(() => {
    const map = new Map<string, {
      product_id: string;
      product_name: string;
      category: string;
      unit: string;
      totalOrdered: number;
      lineIds: string[];
      byStore: Record<string, { qty: number; lineIds: string[] }>;
      currentStatus: string;
    }>();

    for (const order of orders) {
      // Only aggregate active orders (not Arkiverad/Levererad/Avbruten)
      if ((order as any).status === "Avbruten" || (order as any).status === "Levererad" || (order as any).status === "Arkiverad") continue;
      const storeId = (order as any).store_id;
      for (const line of ((order as any).shop_order_lines || [])) {
        const pid = line.product_id;
        const pName = line.products?.name || "Okänd";
        if (!map.has(pid)) {
          map.set(pid, {
            product_id: pid,
            product_name: pName,
            category: line.products?.category || "",
            unit: line.unit || line.products?.unit || "ST",
            totalOrdered: 0,
            lineIds: [],
            byStore: {},
            currentStatus: line.status || "",
          });
        }
        const entry = map.get(pid)!;
        entry.totalOrdered += Number(line.quantity_ordered);
        entry.lineIds.push(line.id);
        if (!entry.byStore[storeId]) {
          entry.byStore[storeId] = { qty: 0, lineIds: [] };
        }
        entry.byStore[storeId].qty += Number(line.quantity_ordered);
        entry.byStore[storeId].lineIds.push(line.id);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name));
  }, [orders]);

  // Update status for a product across ALL order lines
  const handleProductStatusChange = async (product: typeof aggregated[0], newStatus: string) => {
    const { error } = await supabase
      .from("shop_order_lines")
      .update({ status: newStatus })
      .in("id", product.lineIds);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Status uppdaterad",
      description: `${product.product_name}: ${newStatus} (${product.lineIds.length} orderrader uppdaterade)`,
    });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
  };

  // Update order-level status
  const handleOrderStatusChange = async (orderId: string, newStatus: string) => {
    // When changing to Pågående, show packer name dialog first
    if (newStatus === "Pågående") {
      setPendingPackerOrderId(orderId);
      setPackerName("");
      setPackerDialogOpen(true);
      return;
    }

    await applyOrderStatusChange(orderId, newStatus);
  };

  const applyOrderStatusChange = async (orderId: string, newStatus: string, packer?: string) => {
    const updatePayload: any = { status: newStatus };
    if (packer !== undefined) updatePayload.packer_name = packer;

    const { error } = await supabase
      .from("shop_orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    // When changing to Pågående, also update all order lines to Pågående
    if (newStatus === "Pågående") {
      await supabase
        .from("shop_order_lines")
        .update({ status: "Pågående" })
        .eq("shop_order_id", orderId)
        .in("status", ["", "Ny"]);
    }

    // When marking as "Skickad" or "Levererad", move stock from Pre-locations to Transportlager
    if (newStatus === "Skickad" || newStatus === "Levererad") {
      try {
        await moveStockToTransport(orderId);
        // Update all qualifying lines to "Skickad" (or "Klar / Levererad" if Levererad)
        const lineTargetStatus = newStatus === "Levererad" ? "Klar / Levererad" : "Skickad";
        await supabase
          .from("shop_order_lines")
          .update({ status: lineTargetStatus })
          .eq("shop_order_id", orderId)
          .in("status", ["Packad", "Pågående", "Ny", "", "Skickad"]);
      } catch (err) {
        console.error("Stock transfer error:", err);
      }
    }

    toast({ title: "Orderstatus uppdaterad", description: newStatus });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
    qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
  };

  const handlePackerConfirm = async () => {
    if (!pendingPackerOrderId || !packerName.trim()) return;
    setPackerDialogOpen(false);
    await applyOrderStatusChange(pendingPackerOrderId, "Pågående", packerName.trim());
    setPendingPackerOrderId(null);
    setPackerName("");
  };

  const handleArchiveOrder = async (orderId: string) => {
    const { error } = await supabase
      .from("shop_orders")
      .update({ status: "Arkiverad" })
      .eq("id", orderId);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order arkiverad" });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setArchiveConfirmOrder(null);
    if (selectedOrder?.id === orderId) setSelectedOrderId(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Ordrar från butiker
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Hantera inkomna beställningar från alla butiker. Uppdatera produktstatus i totalvyn.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Skapa order åt butik
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt ordrar</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalOrders}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Nya</p>
          <p className="text-xl font-heading font-bold text-primary">{newOrders}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Under behandling</p>
          <p className="text-xl font-heading font-bold text-warning">{inProgress}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Unika produkter</p>
          <p className="text-xl font-heading font-bold text-foreground">{aggregated.length}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="per-order" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="per-order" className="text-xs h-7 gap-1"><Eye className="h-3 w-3" /> Per order</TabsTrigger>
          <TabsTrigger value="total" className="text-xs h-7 gap-1"><ListChecks className="h-3 w-3" /> Totalvy</TabsTrigger>
          <TabsTrigger value="archived" className="text-xs h-7 gap-1"><Archive className="h-3 w-3" /> Arkiverade ({archivedOrders.length})</TabsTrigger>
          <TabsTrigger value="changes" className="text-xs h-7 gap-1 relative">
            <Bell className="h-3 w-3" /> Ändringar ({pendingChanges.filter((cr: any) => cr.requested_by !== "grossist").length})
            {pendingChanges.filter((cr: any) => cr.requested_by !== "grossist").length > 0 && <span className="absolute -top-1 -right-1 h-3 w-3 bg-warning rounded-full animate-pulse" />}
          </TabsTrigger>
        </TabsList>

        {/* TOTAL VIEW — aggregated products across all orders */}
        <TabsContent value="total">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Alla beställda produkter — Totalvy</CardTitle>
              <CardDescription className="text-xs">
                Ändra status per produkt. Statusen uppdateras automatiskt i varje butiks order.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aggregated.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga aktiva beställningar att visa.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                       <tr className="border-b border-border bg-muted/30 h-9">
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">PRODUKT</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">KATEGORI</th>
                        {retailStores.map(s => (
                           <th key={s.id} className="px-2.5 py-1 text-right font-medium text-muted-foreground text-[10px] uppercase">
                             {s.name?.split(" ").pop()}
                           </th>
                         ))}
                         <th className="px-2.5 py-1 text-right font-bold text-primary">TOTAL</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">ENHET</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground min-w-[140px]">STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let lastCat = "";
                        return aggregated.map(item => {
                          const showCatHeader = item.category !== lastCat;
                          lastCat = item.category;
                          return (
                            <>
                              {showCatHeader && (
                                <tr key={`cat-${item.category}`}>
                                  <td colSpan={retailStores.length + 5} className="pt-4 pb-1 text-[10px] font-bold text-muted-foreground border-b border-border">
                                    ▸ {item.category || "ÖVRIGT"}
                                  </td>
                                </tr>
                              )}
                               <tr key={item.product_id} className="border-b border-border/30 h-9 transition-colors">
                                 <td className="px-2.5 py-1 font-medium text-foreground">{item.product_name}</td>
                                 <td className="px-2.5 py-1">
                                   <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                                 </td>
                                 {retailStores.map(s => (
                                   <td key={s.id} className="px-2.5 py-1 text-right text-muted-foreground font-mono">
                                     {item.byStore[s.id]?.qty || <span className="text-muted-foreground/30">–</span>}
                                   </td>
                                 ))}
                                 <td className="px-2.5 py-1 text-right font-bold text-primary font-mono">{item.totalOrdered}</td>
                                 <td className="px-2.5 py-1 text-muted-foreground">{item.unit}</td>
                                 <td className="px-2.5 py-1">
                                  <Select
                                    value={item.currentStatus || ""}
                                    onValueChange={(val) => handleProductStatusChange(item, val)}
                                  >
                                    <SelectTrigger className="h-7 text-[10px] w-[130px]">
                                      <SelectValue placeholder="Sätt status..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {LINE_STATUSES.map(s => (
                                        <SelectItem key={s || "none"} value={s || "pending"} className="text-xs">
                                          {s || "Ej satt"}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              </tr>
                            </>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PER ORDER VIEW */}
        <TabsContent value="per-order">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Sök vecka eller butik..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Alla", "Ny", "Pågående", "Packad", "Skickad", "Levererad", "Avbruten"].map(s =>
                    <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-1.5 bg-muted/50 rounded-md px-3 py-1.5 border border-border">
                <span className="text-[10px] text-muted-foreground font-medium">Totalt ordervärde (aktiva):</span>
                <span className="text-xs font-mono font-semibold text-foreground">
                  {activeOrders.reduce((sum: number, o: any) =>
                    sum + (o.shop_order_lines || []).reduce((s: number, l: any) => s + (l.quantity_delivered || l.quantity_ordered || 0) * (l.products?.wholesale_price || 0), 0)
                  , 0).toFixed(2)} kr
                </span>
              </div>
            </div>

            <Card className="shadow-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                       <tr className="border-b border-border bg-muted/30 h-9">
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground w-28"></th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">VECKA</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">DATUM</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">BUTIK</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                          <th className="px-2.5 py-1 text-right font-medium text-muted-foreground">RADER</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">PRODUKTER</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">ANTECKNING</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground min-w-[120px]">STATUS</th>
                          <th className="px-2.5 py-1 text-right font-medium text-muted-foreground">ORDERVÄRDE</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">PACKARE</th>
                          <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">LEVERANSRAPPORT</th>
                          <th className="px-2.5 py-1 text-center font-medium text-muted-foreground">PACKSEDEL</th>
                          <th className="px-2.5 py-1 text-center font-medium text-muted-foreground">FÖLJESEDEL</th>
                          <th className="px-2.5 py-1 text-center font-medium text-muted-foreground">ARKIVERA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 && (
                          <tr><td colSpan={15} className="px-2.5 py-6 text-center text-muted-foreground">Inga ordrar att visa.</td></tr>
                       )}
                       {filteredOrders.map((o: any) => (
                         <React.Fragment key={o.id}>
                          <tr className={`border-b border-border h-9 transition-colors cursor-pointer hover:bg-muted/30 ${expandedOrderId === o.id ? "bg-primary/15 border-l-2 border-l-primary shadow-sm" : ""} ${o.status === "Pågående" ? "bg-warning/10" : o.status === "Packad" ? "bg-success/10" : o.status === "Skickad" ? "bg-primary/10" : o.status === "Levererad" || o.status === "Klar / Levererad" ? "bg-primary/25" : ""}`} onClick={() => toggleExpandOrder(o.id)}>
                            <td className="px-2.5 py-1" onClick={e => e.stopPropagation()}>
                              {o.status === "Ny" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10px] gap-1 bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                                  onClick={() => handleOrderStatusChange(o.id, "Pågående")}
                                >
                                  <Package className="h-3 w-3" />
                                  Packa order
                                </Button>
                              )}
                            </td>
                            <td className="px-2.5 py-1 font-mono font-medium text-foreground">{o.order_week}</td>
                            <td className="px-2.5 py-1 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                            <td className="px-2.5 py-1 text-muted-foreground">{o.stores?.name || "–"}</td>
                            <td className="px-2.5 py-1 text-muted-foreground">{(o as any).desired_delivery_date || "–"}</td>
                            <td className="px-2.5 py-1 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                            <td className="px-2.5 py-1 text-muted-foreground text-[10px] max-w-48 truncate">
                              {o.shop_order_lines?.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                            </td>
                            <td className="px-2.5 py-1 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                            <td className="px-2.5 py-1" onClick={e => e.stopPropagation()}>
                             <Select value={o.status} onValueChange={(val) => handleOrderStatusChange(o.id, val)}>
                               <SelectTrigger className="h-7 text-[10px] w-[110px]">
                                 <SelectValue />
                               </SelectTrigger>
                               <SelectContent>
                                 {["Ny", "Pågående", "Packad", "Skickad", "Levererad", "Avbruten"].map(s =>
                                   <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                 )}
                               </SelectContent>
                             </Select>
                           </td>
                           <td className="px-2.5 py-1 text-right font-mono text-foreground text-[10px]">
                             {(o.shop_order_lines || []).reduce((sum: number, l: any) => sum + (l.quantity_delivered || l.quantity_ordered || 0) * (l.products?.wholesale_price || 0), 0).toFixed(2)} kr
                           </td>
                           <td className="px-2.5 py-1 text-muted-foreground text-[10px]">{o.packer_name || "–"}</td>
                           <td className="px-2.5 py-1" onClick={e => e.stopPropagation()}>
                             {(() => {
                               const reports = reportsByOrder.get(o.id);
                               if (!reports || reports.length === 0) {
                                 return <span className="text-[10px] text-muted-foreground/40">–</span>;
                               }
                               const hasIssues = reports.some((r: any) => r.status === "Rapporterad");
                               return (
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   className={`h-6 text-[10px] gap-1 ${hasIssues ? "text-warning" : "text-success"}`}
                                   onClick={() => setReportViewOrder(o)}
                                 >
                                   {hasIssues ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                   {hasIssues ? "Avvikelse" : "Godkänd"}
                                 </Button>
                               );
                             })()}
                           </td>
                           <td className="px-2.5 py-1 text-center" onClick={e => e.stopPropagation()}>
                             <Button
                               variant="ghost"
                               size="sm"
                               className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                               onClick={() => setPackingSlipOrder(o)}
                             >
                               <Printer className="h-3 w-3" /> Packsedel
                             </Button>
                           </td>
                           <td className="px-2.5 py-1 text-center" onClick={e => e.stopPropagation()}>
                             {["Packad", "Skickad", "Levererad"].includes(o.status) ? (
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                 onClick={() => setDeliveryNoteOrder(o)}
                               >
                                 <Printer className="h-3 w-3" /> Följesedel
                               </Button>
                             ) : (
                               <span className="text-[10px] text-muted-foreground/40">–</span>
                             )}
                           </td>
                           <td className="px-2.5 py-1 text-center" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => setArchiveConfirmOrder(o)}
                              >
                                <Archive className="h-3 w-3" /> Arkivera
                              </Button>
                           </td>
                         </tr>
                         {/* Inline expandable order detail */}
                         {expandedOrderId === o.id && (
                           <tr>
                             <td colSpan={15} className="p-0">
                               <div className="border-b-2 border-primary/20 bg-muted/20 px-4 py-3">
                                 <div className="flex items-center justify-between mb-3">
                                   <div className="flex items-center gap-2">
                                     <h3 className="font-heading text-sm font-semibold">
                                       Order {o.order_week} — {o.stores?.name || "Okänd butik"}
                                     </h3>
                                     <Badge variant="outline" className={`${statusColor[o.status] || ""} text-[10px] gap-1`}>
                                       {statusIcon[o.status]}
                                       {o.status}
                                     </Badge>
                                   </div>
                                   <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setExpandedOrderId(null); }}>
                                     <X className="h-3 w-3 mr-1" /> Stäng
                                   </Button>
                                 </div>
                                 <div className="text-xs text-muted-foreground mb-2">
                                   Skapad {new Date(o.created_at).toLocaleDateString("sv-SE")}
                                   {(o as any).desired_delivery_date && (
                                     <> · Önskat leveransdatum: <span className="font-medium text-foreground">{(o as any).desired_delivery_date}</span></>
                                   )}
                                 </div>
                                 {o.notes && (
                                   <div className="bg-muted/30 rounded-md p-2 text-xs text-muted-foreground mb-3">
                                     <span className="font-medium text-foreground">Anteckning:</span> {o.notes}
                                   </div>
                                 )}
                                 <WholesaleOrderDetail order={o} onClose={() => setExpandedOrderId(null)} stores={stores} />
                               </div>
                             </td>
                           </tr>
                         )}
                       </React.Fragment>))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ARCHIVED ORDERS */}
        <TabsContent value="archived">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Arkiverade ordrar</CardTitle>
              <CardDescription className="text-xs">Ordrar som har slutbehandlats och arkiverats.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                     <tr className="border-b border-border bg-muted/30">
                       <th className="p-3 text-left font-medium text-muted-foreground">VECKA</th>
                       <th className="p-3 text-left font-medium text-muted-foreground">DATUM</th>
                       <th className="p-3 text-left font-medium text-muted-foreground">BUTIK</th>
                       <th className="p-3 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                       <th className="p-3 text-right font-medium text-muted-foreground">RADER</th>
                       <th className="p-3 text-left font-medium text-muted-foreground">PRODUKTER</th>
                       <th className="p-3 text-left font-medium text-muted-foreground">ANTECKNING</th>
                     </tr>
                  </thead>
                  <tbody>
                    {archivedOrders.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Inga arkiverade ordrar.</td></tr>
                    )}
                    {archivedOrders.map((o: any) => (
                      <React.Fragment key={o.id}>
                        <tr className={`border-b border-border/40 cursor-pointer hover:bg-muted/20 ${expandedOrderId === o.id ? "bg-primary/15 border-l-2 border-l-primary shadow-sm" : ""}`} onClick={() => toggleExpandOrder(o.id)}>
                          <td className="p-3 font-mono font-medium text-foreground">{o.order_week}</td>
                          <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                          <td className="p-3 text-muted-foreground">{o.stores?.name || "–"}</td>
                          <td className="p-3 text-muted-foreground">{(o as any).desired_delivery_date || "–"}</td>
                          <td className="p-3 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-48 truncate">
                            {o.shop_order_lines?.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                          </td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                        </tr>
                        {expandedOrderId === o.id && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="border-b-2 border-primary/20 bg-muted/20 px-4 py-3">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="font-heading text-sm font-semibold">
                                    Order {o.order_week} — {o.stores?.name || "Okänd butik"}
                                  </h3>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); setExpandedOrderId(null); }}>
                                    <X className="h-3 w-3 mr-1" /> Stäng
                                  </Button>
                                </div>
                                <WholesaleOrderDetail order={o} onClose={() => setExpandedOrderId(null)} stores={stores} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* CHANGE REQUESTS */}
        <TabsContent value="changes">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Ändringsförfrågningar från butiker</CardTitle>
              <CardDescription className="text-xs">
                Butiker har begärt ändringar på sina ordrar. Godkänn eller neka varje ändring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const shopInitiated = pendingChanges.filter((cr: any) => cr.requested_by !== "grossist");
                return shopInitiated.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga väntande ändringsförfrågningar.</p>
              ) : (
                <div className="space-y-2">
                  {shopInitiated.map((cr: any) => (
                    <div key={cr.id} className="border border-warning/30 bg-warning/5 rounded-md p-3 text-xs flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-0.5">
                        <div className="font-medium text-foreground">
                          {cr.shop_orders?.stores?.name || "Okänd butik"} · {cr.shop_orders?.order_week}
                        </div>
                        <div className="text-muted-foreground">
                          {cr.change_type === "quantity_change" && (
                            <>Ändra antal: <span className="font-mono">{cr.old_value}</span> → <span className="font-mono font-bold text-foreground">{cr.new_value}</span> {cr.unit}</>
                          )}
                          {cr.change_type === "add_line" && (
                            <>Ny produkt: <span className="font-medium text-foreground">{cr.products?.name}</span> — {cr.new_value} {cr.unit}</>
                          )}
                          {cr.change_type === "delivery_date" && (
                            <>Leveransdatum: <span className="font-mono">{cr.old_value}</span> → <span className="font-mono font-bold text-foreground">{cr.new_value}</span></>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60">{new Date(cr.created_at).toLocaleString("sv-SE")}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                          onClick={() => resolveChange.mutate({ id: cr.id, status: "Godkänd" })}
                          disabled={resolveChange.isPending}
                        >
                          <Check className="h-3 w-3" /> Godkänn
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => resolveChange.mutate({ id: cr.id, status: "Nekad" })}
                          disabled={resolveChange.isPending}
                        >
                          <X className="h-3 w-3" /> Neka
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>



      <Dialog open={!!reportViewOrder} onOpenChange={open => { if (!open) setReportViewOrder(null); }}>
        <DialogContent className="max-w-lg">
          {reportViewOrder && (() => {
            const reports = reportsByOrder.get(reportViewOrder.id) || [];
            const hasIssues = reports.some((r: any) => r.status === "Rapporterad");
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading text-sm flex items-center gap-2">
                    Leveransrapport — {reportViewOrder.order_week} · {reportViewOrder.stores?.name}
                    <Badge variant="outline" className={`text-[10px] ml-2 ${hasIssues ? "text-warning border-warning/30" : "text-success border-success/30"}`}>
                      {hasIssues ? "Avvikelse" : "Allt godkänt"}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  {(reportViewOrder.shop_order_lines || []).map((line: any) => {
                    const report = reports.find((r: any) => r.order_line_id === line.id);
                    return (
                      <div key={line.id} className={`p-2.5 rounded-md border text-xs ${
                        report?.status === "Rapporterad" ? "border-warning/40 bg-warning/5" : "border-border"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{line.products?.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{line.quantity_ordered} {line.unit}</span>
                            <Badge variant="outline" className={`text-[10px] ${
                              report?.status === "Rapporterad" ? "text-warning border-warning/30" : "text-success border-success/30"
                            }`}>
                              {report?.status || "Ej rapporterad"}
                            </Badge>
                          </div>
                        </div>
                        {report?.status === "Rapporterad" && (
                          <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5 pl-1 border-l-2 border-warning/30 ml-1">
                            {report.report_type && <p><span className="font-medium text-foreground">Typ:</span> {report.report_type}</p>}
                            {report.quantity_received != null && (
                              <p><span className="font-medium text-foreground">Mottaget:</span> {report.quantity_received} (beställt: {line.quantity_ordered})</p>
                            )}
                            {report.notes && <p><span className="font-medium text-foreground">Anteckning:</span> {report.notes}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setReportViewOrder(null)}>Stäng</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveConfirmOrder} onOpenChange={open => { if (!open) setArchiveConfirmOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Arkivera order?</DialogTitle>
            <DialogDescription className="text-xs">
              Är du säker på att du vill arkivera order {archiveConfirmOrder?.order_week} från {archiveConfirmOrder?.stores?.name}? Ordern flyttas till fliken "Arkiverade".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setArchiveConfirmOrder(null)}>Avbryt</Button>
            <Button size="sm" className="text-xs" onClick={() => handleArchiveOrder(archiveConfirmOrder?.id)}>Bekräfta arkivering</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packer name dialog */}
      <Dialog open={packerDialogOpen} onOpenChange={(open) => { if (!open) { setPackerDialogOpen(false); setPendingPackerOrderId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Vem packar ordern?</DialogTitle>
            <DialogDescription className="text-xs">
              Ange namnet på personen som packar denna order.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="Packarens namn..."
            value={packerName}
            onChange={(e) => setPackerName(e.target.value)}
            className="text-sm"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && packerName.trim()) handlePackerConfirm(); }}
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setPackerDialogOpen(false); setPendingPackerOrderId(null); }}>Avbryt</Button>
            <Button size="sm" className="text-xs" disabled={!packerName.trim()} onClick={handlePackerConfirm}>Bekräfta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packing slip dialog */}
      <PackingSlip order={packingSlipOrder} open={!!packingSlipOrder} onOpenChange={(open) => { if (!open) setPackingSlipOrder(null); }} />
      <DeliveryNote order={deliveryNoteOrder} open={!!deliveryNoteOrder} onOpenChange={(open) => { if (!open) setDeliveryNoteOrder(null); }} />

      {/* Create order on behalf of shop dialog */}
      <Dialog open={createDialogOpen} onOpenChange={open => { setCreateDialogOpen(open); if (!open) resetCreateDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Skapa order åt butik</DialogTitle>
            <DialogDescription className="text-xs">
              Välj en kund/butik och lägg till produkter. Ordern visas direkt i butikens ordervy.
            </DialogDescription>
          </DialogHeader>

          {/* Customer selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Välj kund / butik <span className="text-destructive">*</span></Label>
            <Select value={selectedCustomerId} onValueChange={v => { setSelectedCustomerId(v); setNewOrderDeliveryDate(undefined); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Välj kund..." />
              </SelectTrigger>
              <SelectContent>
                {linkedCustomers.map(c => {
                  const store = stores.find(s => s.id === c.store_id);
                  return (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {store ? `(${store.name})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {linkedCustomers.length === 0 && (
              <p className="text-[10px] text-warning">Inga kunder är kopplade till butiker. Koppla kunder via Kunder-modulen.</p>
            )}
          </div>

          {/* Product search */}
          {selectedCustomerId && (
            <>
              <div className="relative">
                <Label className="text-xs font-medium mb-1.5 block">Lägg till produkter</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt (namn eller SKU)..."
                    value={newProductSearch}
                    onChange={e => { setNewProductSearch(e.target.value); setNewHighlightedIndex(-1); }}
                    onKeyDown={e => {
                      if (filteredNewProducts.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setNewHighlightedIndex(prev => (prev + 1) % filteredNewProducts.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setNewHighlightedIndex(prev => (prev <= 0 ? filteredNewProducts.length - 1 : prev - 1));
                      } else if (e.key === "Enter" && newHighlightedIndex >= 0 && newHighlightedIndex < filteredNewProducts.length) {
                        e.preventDefault();
                        addNewProduct(filteredNewProducts[newHighlightedIndex]);
                      }
                    }}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {filteredNewProducts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredNewProducts.map((p, idx) => (
                      <button
                        key={p.id}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${idx === newHighlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                        onClick={() => addNewProduct(p)}
                        onMouseEnter={() => setNewHighlightedIndex(idx)}
                      >
                        <span className="font-medium text-foreground">{p.name}</span>
                        <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Order lines */}
              {newOrderLines.length > 0 && (
                <div className="space-y-2">
                  <Separator />
                  <div className="text-xs font-medium text-muted-foreground">
                    {newOrderLines.length} produkt{newOrderLines.length > 1 ? "er" : ""} tillagda
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                          <th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th>
                          <th className="pb-2 text-right font-medium text-muted-foreground w-32">Antal</th>
                          <th className="pb-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {newOrderLines.map((line, idx) => (
                          <tr key={line.product_id} className="border-b border-border/30">
                            <td className="py-2 font-medium text-foreground">{line.product_name}</td>
                            <td className="py-2 text-muted-foreground">{line.unit}</td>
                            <td className="py-2 text-right">
                              <Input
                                type="number"
                                step="0.1"
                                value={line.quantity}
                                onChange={e => updateNewLine(idx, e.target.value)}
                                className="h-7 text-xs w-24 ml-auto text-right"
                                placeholder="0"
                                autoFocus={idx === newOrderLines.length - 1}
                              />
                            </td>
                            <td className="py-2">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeNewLine(idx)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Önskat avgångsdatum <span className="text-destructive">*</span></Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left text-xs h-8 font-normal",
                        !newOrderDeliveryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {newOrderDeliveryDate ? format(newOrderDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={newOrderDeliveryDate}
                      onSelect={setNewOrderDeliveryDate}
                      disabled={isNewOrderDateDisabled}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                      modifiers={allowedWeekdays ? { allowed: (date: Date) => !isNewOrderDateDisabled(date) } : {}}
                      modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Anteckning (valfritt)</Label>
                <Textarea
                  value={newOrderNote}
                  onChange={e => setNewOrderNote(e.target.value)}
                  placeholder="T.ex. brådskande leverans, specialförpackning..."
                  className="text-xs min-h-[50px]"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCreateDialogOpen(false); resetCreateDialog(); }}>Avbryt</Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmCreateOpen(true)}
              disabled={!selectedCustomerId || newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0 || !newOrderDeliveryDate}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Skapa order
            </Button>
          </DialogFooter>

          {/* Confirmation dialog */}
          <Dialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="font-heading">Bekräfta order</DialogTitle>
                <DialogDescription className="text-xs">
                  Skapa order med {newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0).length} produkt(er) åt {selectedCustomer?.name}?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setConfirmCreateOpen(false)}>Avbryt</Button>
                <Button size="sm" className="gap-1.5" onClick={() => { setConfirmCreateOpen(false); handleCreateWholesaleOrder(); }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Ja, skapa
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ---- Wholesaler order detail with "Ej tillgänglig" + alternative capability ---- */
function WholesaleOrderDetail({ order, onClose, stores }: { order: any; onClose: () => void; stores: any[] }) {
  const { toast } = useToast();
  const createChange = useCreateChangeRequest();
  const updateLineStatus = useUpdateOrderLineStatus();
  const { data: allStock = [] } = useAllStockByLocation();
  const { data: allProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Build stock lookup: product_id -> qty in Grossist Flytande only (reflects packing in real-time)
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allStock) {
      const locName = (s.storage_locations?.name || "").toLowerCase();
      if (locName === "grossist flytande") {
        const pid = s.product_id;
        map.set(pid, (map.get(pid) || 0) + Number(s.quantity));
      }
    }
    return map;
  }, [allStock]);

  const [altDialogLine, setAltDialogLine] = useState<any>(null);
  const [altProductId, setAltProductId] = useState<string>("");
  const [altSearch, setAltSearch] = useState("");

  const handleMarkUnavailable = async (line: any) => {
    await createChange.mutateAsync({
      shop_order_id: order.id,
      order_line_id: line.id,
      change_type: "product_unavailable",
      product_id: line.product_id,
      old_value: String(line.quantity_ordered),
      new_value: "0",
      unit: line.unit || line.products?.unit || "ST",
      requested_by: "grossist",
    });
    toast({ title: "Förfrågan skickad", description: `"${line.products?.name}" markerad som ej tillgänglig.` });
  };

  const handleSuggestAlternative = async () => {
    if (!altDialogLine || !altProductId) return;
    const altProduct = allProducts?.find((p: any) => p.id === altProductId);
    await createChange.mutateAsync({
      shop_order_id: order.id,
      order_line_id: altDialogLine.id,
      change_type: "product_alternative",
      product_id: altProductId,
      old_value: altDialogLine.product_id,
      new_value: altProduct?.name || altProductId,
      unit: altDialogLine.unit || altDialogLine.products?.unit || "ST",
      requested_by: "grossist",
    });
    toast({ title: "Alternativ föreslagit", description: `Alternativ "${altProduct?.name}" föreslaget för "${altDialogLine.products?.name}".` });
    setAltDialogLine(null);
    setAltProductId("");
    setAltSearch("");
  };

  const filteredProducts = useMemo(() => {
    if (!allProducts) return [];
    const s = altSearch.toLowerCase();
    return allProducts.filter((p: any) =>
      p.id !== altDialogLine?.product_id &&
      (p.name.toLowerCase().includes(s) || !s)
    ).slice(0, 20);
  }, [allProducts, altSearch, altDialogLine]);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">Produkt</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">Enhet</th>
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Beställt</th>
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Lager</th>
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Packat</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">Avvikelse</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground min-w-[160px]">Status</th>
              <th className="px-2 py-1 text-center font-medium text-muted-foreground">Åtgärd</th>
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Värde (kr)</th>
            </tr>
          </thead>
          <tbody>
            {order.shop_order_lines?.map((line: any) => {
              const qtyOrdered = line.quantity_ordered || 0;
              const qtyDelivered = line.quantity_delivered || 0;
              const wholesalePrice = line.products?.wholesale_price || 0;
              const lineValue = (qtyDelivered || qtyOrdered) * wholesalePrice;
              const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
              const isUnavailable = line.status === "Ej tillgänglig";
              const currentStatus = line.status || "Ny";
              const stockQty = stockByProduct.get(line.product_id) || 0;
              const alreadyPacked = currentStatus === "Packad" ? qtyDelivered : 0;
              const availableStock = stockQty + alreadyPacked;
              const idx = STATUS_FLOW.indexOf(currentStatus as any);
              const prev = idx > 0 ? STATUS_FLOW[idx - 1] : null;
              const next = idx === -1 ? "Pågående" : (idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null);

              return (
                <tr key={line.id} className={`border-b border-border/30 h-7 transition-colors ${
                  isUnavailable ? "opacity-50 bg-destructive/5" :
                  currentStatus === "Skickad" ? "bg-primary/10" :
                  currentStatus === "Packad" || currentStatus === "Producerad" ? "bg-success/10" :
                  currentStatus === "Pågående" ? "bg-warning/10" :
                  ""
                }`}>
                  <td className="px-2 py-0.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                  <td className={`px-2 py-0.5 text-right font-mono ${availableStock >= qtyOrdered ? "text-success" : availableStock > 0 ? "text-warning" : "text-destructive"}`}>
                    {availableStock > 0 ? Number(availableStock.toFixed(1)) : "0"}
                  </td>
                  <td className="px-2 py-0.5 text-right">
                    {(() => {
                      const isLocked = currentStatus === "Packad" || currentStatus === "Skickad" || currentStatus === "Klar / Levererad" || currentStatus === "Levererad";
                      return isLocked ? (
                        <span className="w-16 inline-block text-right text-xs font-mono text-muted-foreground">{qtyDelivered || "–"}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={availableStock}
                          defaultValue={qtyDelivered || ""}
                          placeholder="0"
                          className="w-16 h-6 text-right text-xs font-mono bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const val = Number((e.target as HTMLInputElement).value);
                              if (val > availableStock) {
                                toast({ title: "Otillräckligt lager", description: `Max tillgängligt: ${Number(availableStock.toFixed(1))}`, variant: "destructive" });
                                (e.target as HTMLInputElement).value = String(Number(availableStock.toFixed(1)));
                                return;
                              }
                              if (val > 0) {
                                const unit = line.unit || line.products?.unit || "kg";
                                let deviation: string | null = null;
                                if (val !== qtyOrdered) {
                                  deviation = val > qtyOrdered
                                    ? `+${(val - qtyOrdered).toFixed(1)} ${unit} mer än beställt`
                                    : `-${(qtyOrdered - val).toFixed(1)} ${unit} mindre än beställt`;
                                }
                                await supabase
                                  .from("shop_order_lines")
                                  .update({ quantity_delivered: val, deviation })
                                  .eq("id", line.id);
                                updateLineStatus.mutate(
                                  { lineId: line.id, newStatus: "Packad", orderId: order.id },
                                  { onSuccess: () => toast({ title: `Packad: ${val} ${line.unit || line.products?.unit || ""}` }) }
                                );
                              }
                            }
                          }}
                        />
                      );
                    })()}
                  </td>
                  <td className="px-2 py-0.5 text-muted-foreground text-[10px]">
                    {line.deviation ? (
                      <span className="text-warning">{line.deviation}</span>
                    ) : hasDiff ? (
                      <span className="text-warning">
                        {qtyDelivered > qtyOrdered
                          ? `+${(qtyDelivered - qtyOrdered).toFixed(1)} ${line.unit || line.products?.unit || "kg"} mer`
                          : `-${(qtyOrdered - qtyDelivered).toFixed(1)} ${line.unit || line.products?.unit || "kg"} mindre`}
                      </span>
                    ) : "–"}
                  </td>
                  <td className="px-2 py-0.5">
                    <Select
                      value={currentStatus}
                      disabled={updateLineStatus.isPending}
                      onValueChange={(val) => {
                        if (val !== currentStatus) {
                          updateLineStatus.mutate(
                            { lineId: line.id, newStatus: val, orderId: order.id },
                            { onSuccess: () => toast({ title: `Status: ${val}` }) }
                          );
                        }
                      }}
                    >
                      <SelectTrigger className={`h-6 text-[10px] w-[110px] px-2 ${
                        currentStatus === "Ej tillgänglig" ? "text-destructive border-destructive/20" :
                        currentStatus === "Packad" || currentStatus === "Producerad" ? "text-success border-success/20" :
                        currentStatus === "Skickad" ? "text-primary border-primary/20" :
                        currentStatus === "Pågående" ? "text-warning border-warning/20" :
                        ""
                      }`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...STATUS_FLOW, "Ej tillgänglig"].map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    {!isUnavailable && (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] gap-0.5 text-destructive border-destructive/30 hover:bg-destructive/10 px-1.5"
                          onClick={() => handleMarkUnavailable(line)}
                          disabled={createChange.isPending}
                        >
                          <Ban className="h-2.5 w-2.5" /> Ej tillg.
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] gap-0.5 text-primary border-primary/30 hover:bg-primary/10 px-1.5"
                          onClick={() => { setAltDialogLine(line); setAltProductId(""); setAltSearch(""); }}
                          disabled={createChange.isPending}
                        >
                          <Package className="h-2.5 w-2.5" /> Alt.
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-right font-mono text-foreground">{lineValue.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Total order value */}
      {(() => {
        const totalValue = (order.shop_order_lines || []).reduce((sum: number, line: any) => {
          const qty = line.quantity_delivered || line.quantity_ordered || 0;
          const price = line.products?.wholesale_price || 0;
          return sum + qty * price;
        }, 0);
        return (
          <div className="flex justify-end mt-3 px-2">
            <div className="bg-muted/40 rounded-md px-4 py-2 border border-border">
              <span className="text-xs font-medium text-muted-foreground mr-3">Totalt Ordervärde:</span>
              <span className="text-sm font-bold font-mono text-foreground">{totalValue.toFixed(2)} kr</span>
            </div>
          </div>
        );
      })()}

      {/* Alternative product dialog */}
      <Dialog open={!!altDialogLine} onOpenChange={(open) => { if (!open) setAltDialogLine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Föreslå alternativ produkt</DialogTitle>
            <DialogDescription className="text-xs">
              Ersätt <span className="font-semibold">{altDialogLine?.products?.name}</span> med en alternativ produkt.
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
              {filteredProducts.map((p: any) => (
                <div
                  key={p.id}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-muted/50 flex items-center justify-between ${altProductId === p.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => setAltProductId(p.id)}
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.unit}</span>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">Inga produkter hittades.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAltDialogLine(null)}>Avbryt</Button>
            <Button size="sm" disabled={!altProductId || createChange.isPending} onClick={handleSuggestAlternative}>
              Föreslå alternativ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
      </DialogFooter>
    </>
  );
}
