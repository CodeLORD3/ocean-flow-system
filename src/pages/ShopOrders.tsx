import React, { useState, useEffect, useMemo, useRef } from "react";
import { displayOrderWeek } from "@/lib/orderWeek";
import { motion } from "framer-motion";
import {
  ShoppingCart, Plus, Search, Clock, CheckCircle2, Truck, XCircle, X, Package,
  Archive, ListChecks, History, CalendarIcon, Pencil, Send, FileText, Copy,
} from "lucide-react";
import DeliveryNote from "@/components/DeliveryNote";
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
import { useProducts } from "@/hooks/useProducts";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSite } from "@/contexts/SiteContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useCreateChangeRequest, useOrderChangeRequests, useResolveChangeRequest } from "@/hooks/useOrderChangeRequests";

type OrderLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
};

const statusColor: Record<string, string> = {
  Ny: "",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-success/15 text-success border-success/20",
  Skickad: "bg-primary/15 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
  Arkiverad: "bg-muted text-muted-foreground border-border",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3 w-3" />,
  Pågående: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
  Arkiverad: <Archive className="h-3 w-3" />,
};

const statusSegmentColor: Record<string, string> = {
  "": "transparent",
  "Ny": "transparent",
  "Pågående": "#fef3c7",
  "Producerad": "#dbeafe",
  "Packad": "#d1fae5",
  "Skickad": "#bbf7d0",
  "Levererad": "#bbf7d0",
  "Klar / Levererad": "#bbf7d0",
  "Ej tillgänglig": "#fee2e2",
  "Avbruten": "#fee2e2",
};

const rowBgByStatus: Record<string, string> = {
  "": "",
  "Ny": "",
  "Pågående": "bg-amber-50 dark:bg-amber-950/20",
  "Producerad": "bg-blue-50 dark:bg-blue-950/20",
  "Packad": "bg-emerald-50 dark:bg-emerald-950/20",
  "Skickad": "bg-green-50 dark:bg-green-950/20",
  "Levererad": "bg-green-50 dark:bg-green-950/20",
  "Klar / Levererad": "bg-green-50 dark:bg-green-950/20",
  "Ej tillgänglig": "bg-red-50 dark:bg-red-950/20",
  "Avbruten": "bg-red-50 dark:bg-red-950/20",
};

function buildProgressGradient(lines: any[]): string {
  if (!lines || lines.length === 0) return "transparent";
  const total = lines.length;
  const segments: string[] = [];
  let pos = 0;
  for (const line of lines) {
    const color = statusSegmentColor[line.status || ""] || "transparent";
    const start = (pos / total) * 100;
    const end = ((pos + 1) / total) * 100;
    segments.push(`${color} ${start}%`, `${color} ${end}%`);
    pos++;
  }
  return `linear-gradient(to bottom, ${segments.join(", ")})`;
}

const LIVE_STATUSES = ["Ny", "Pågående", "Packad", "Skickad"];
const DONE_STATUSES = ["Levererad", "Klar / Levererad", "Arkiverad", "Avbruten"];

const FOLLJESEDEL_STATUSES = ["Skickad", "Levererad", "Klar / Levererad", "Arkiverad"];

function OrderTable({ orders, emptyMsg, products, toast, allowedWeekdays, isDateDisabled }: {
  orders: any[];
  emptyMsg: string;
  products: any[];
  toast: any;
  allowedWeekdays: Set<number> | null;
  isDateDisabled: (date: Date) => boolean;
}) {
  const [FolljesedelOrder, setFolljesedelOrder] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <>
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">VECKA</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">DATUM</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">BUTIK</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                  <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">RADER</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">PRODUKTER</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ANTECKNING</th>
                  <th className="px-1.5 py-0.5 text-center font-medium text-muted-foreground">FÖLJESEDEL</th>
                  <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{emptyMsg}</td></tr>
                )}
                {orders.map((o: any) => {
                  const lines = o.shop_order_lines || [];
                  const hasFolljesedel = FOLLJESEDEL_STATUSES.includes(o.status);
                  const isExpanded = expandedId === o.id;
                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        className={`border-b border-border/40 h-7 transition-colors cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-primary/10 border-l-2 border-l-primary border-b-0" : ""}`}
                        style={{ background: isExpanded ? undefined : buildProgressGradient(lines) }}
                        onClick={() => toggleExpand(o.id)}
                      >
                        <td className="px-1.5 py-0.5 font-mono font-medium text-foreground">{displayOrderWeek(o)}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{o.stores?.name || "–"}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{o.desired_delivery_date || "–"}</td>
                        <td className="px-1.5 py-0.5 text-right text-foreground">{lines.length}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground text-[10px] max-w-48 truncate">
                          {lines.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                        </td>
                        <td className="px-1.5 py-0.5 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                        <td className="px-1.5 py-0.5 text-center">
                          {hasFolljesedel ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 text-[9px] gap-1 px-1.5"
                              onClick={(e) => { e.stopPropagation(); setFolljesedelOrder(o); }}
                            >
                              <FileText className="h-2.5 w-2.5" /> Skriv ut
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-0.5 text-right">
                          <Badge variant="outline" className={`${statusColor[o.status] || ""} text-[10px] gap-1`}>
                            {statusIcon[o.status]}
                            {o.status}
                          </Badge>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <div className="border-l-2 border-l-primary bg-card px-3 py-2 space-y-2">
                              <OrderDetailWithEdit
                                order={o}
                                products={products}
                                onClose={() => setExpandedId(null)}
                                toast={toast}
                                allowedWeekdays={allowedWeekdays}
                                isDateDisabled={isDateDisabled}
                                inline
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <DeliveryNote order={FolljesedelOrder} open={!!FolljesedelOrder} onOpenChange={(open) => { if (!open) setFolljesedelOrder(null); }} />
    </>
  );
}

export default function ShopOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeStoreId } = useSite();
  const { activeUser } = useActiveUser();
  const { data: products = [] } = useProducts();
  const { data: transportSchedules = [] } = useTransportSchedules();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Fetch active store details to determine zone
  const { data: activeStore } = useQuery({
    queryKey: ["store-detail", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return null;
      const { data } = await supabase.from("stores").select("*").eq("id", activeStoreId).single();
      return data;
    },
    enabled: !!activeStoreId,
  });

  // Determine allowed departure weekdays for this store's zone
  const allowedWeekdays = useMemo(() => {
    if (!activeStore) return null; // null = no restriction yet
    const city = (activeStore.city || "").toLowerCase();
    const name = (activeStore.name || "").toLowerCase();
    let zoneKey = "international";
    if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) zoneKey = "gothenburg";
    else if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) zoneKey = "stockholm";
    
    const days = transportSchedules.filter(s => s.zone_key === zoneKey).map(s => s.departure_weekday);
    return days.length > 0 ? new Set(days) : null;
  }, [activeStore, transportSchedules]);

  // Disable dates that are not valid departure weekdays AND past dates
  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    if (!allowedWeekdays) return false;
    const jsDay = getDay(date); // 0=Sun
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !allowedWeekdays.has(isoDay);
  };

  // Order form
  const [orderNote, setOrderNote] = useState("");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [desiredDeliveryDate, setDesiredDeliveryDate] = useState<Date | undefined>(undefined);

  // Fetch shop orders with lines
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["shop-orders-shop", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name, address, phone, city), shop_order_lines(*, products(name, unit, category, hs_code, weight_per_piece, wholesale_price))")
        .eq("store_id", activeStoreId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription for live status updates
  useEffect(() => {
    if (!activeStoreId) return;
    const channel = supabase
      .channel(`shop-order-lines-${activeStoreId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_order_lines" },
        () => {
          qc.invalidateQueries({ queryKey: ["shop-orders-shop", activeStoreId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStoreId, qc]);


  // Split orders
  const liveOrders = useMemo(() => orders.filter((o: any) => LIVE_STATUSES.includes(o.status)), [orders]);
  const doneOrders = useMemo(() => orders.filter((o: any) => DONE_STATUSES.includes(o.status)), [orders]);

  const filteredProducts = products.filter(p =>
    productSearch &&
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(productSearch.toLowerCase())) &&
    !orderLines.find(l => l.product_id === p.id)
  ).slice(0, 8);

  const addProduct = (p: any) => {
    setOrderLines(prev => [{
      product_id: p.id, product_name: p.name, unit: p.unit, quantity: "",
    }, ...prev]);
    setProductSearch("");
    setHighlightedIndex(-1);
  };

  const updateLine = (idx: number, qty: string) => {
    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  const removeLine = (idx: number) => {
    setOrderLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreateOrder = async () => {
    const validLines = orderLines.filter(l => l.quantity && Number(l.quantity) > 0);
    if (validLines.length === 0) return;
    if (!desiredDeliveryDate) {
      toast({ title: "Välj avgångsdatum", description: "Du måste välja ett avgångsdatum innan du kan skicka beställningen.", variant: "destructive" });
      return;
    }

    if (!activeStoreId) {
      toast({ title: "Ingen butik vald", variant: "destructive" });
      return;
    }

    const weekNum = `V${Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;

    const { data: order, error } = await supabase
      .from("shop_orders")
      .insert({
        store_id: activeStoreId,
        order_week: weekNum,
        notes: orderNote || null,
        status: "Ny",
        created_by: activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : null,
        desired_delivery_date: desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : null,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    const deliveryDateStr = format(desiredDeliveryDate, "yyyy-MM-dd");
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

    const userName = activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : undefined;
    await logActivity({
      action_type: "create",
      description: `Ny butiksorder skapad av ${userName || "okänd"} (${weekNum}, ${validLines.length} rader)`,
      portal: "shop",
      store_id: activeStoreId,
      entity_type: "shop_order",
      entity_id: order.id,
      performed_by: userName,
    });

    toast({ title: "Beställning skickad!", description: `${validLines.length} produkter beställda` });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setCreatingOrder(false);
    setOrderLines([]);
    setOrderNote("");
    setDesiredDeliveryDate(undefined);
  };

  const pending = liveOrders.filter((o: any) => o.status === "Ny" || o.status === "Pågående").length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Beställningar
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Beställ produkter från grossist/produktion och följ leveransstatus.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => setCreatingOrder(true)}>
          <Plus className="h-3.5 w-3.5" /> Ny beställning
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Aktiva ordrar</p>
          <p className="text-xl font-heading font-bold text-foreground">{liveOrders.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Pågående</p>
          <p className="text-xl font-heading font-bold text-warning">{pending}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Levererade / Arkiverade</p>
          <p className="text-xl font-heading font-bold text-success">{doneOrders.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt alla</p>
          <p className="text-xl font-heading font-bold text-foreground">{orders.length}</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="live" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="live" className="text-xs h-7 gap-1"><ListChecks className="h-3 w-3" /> Aktiva ({liveOrders.length})</TabsTrigger>
          <TabsTrigger value="done" className="text-xs h-7 gap-1"><Archive className="h-3 w-3" /> Levererade / Arkiverade ({doneOrders.length})</TabsTrigger>
          <TabsTrigger value="all" className="text-xs h-7 gap-1"><History className="h-3 w-3" /> Alla ordrar ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live">
          <OrderTable
            orders={liveOrders}
            products={products}
            toast={toast}
            allowedWeekdays={allowedWeekdays}
            isDateDisabled={isDateDisabled}
            emptyMsg="Inga aktiva beställningar just nu."
          />
        </TabsContent>

        <TabsContent value="done">
          <OrderTable
            orders={doneOrders}
            products={products}
            toast={toast}
            allowedWeekdays={allowedWeekdays}
            isDateDisabled={isDateDisabled}
            emptyMsg="Inga levererade eller arkiverade ordrar."
          />
        </TabsContent>

        <TabsContent value="all">
          <OrderTable
            orders={orders}
            products={products}
            toast={toast}
            allowedWeekdays={allowedWeekdays}
            isDateDisabled={isDateDisabled}
            emptyMsg="Inga beställningar ännu. Klicka &quot;Ny beställning&quot; för att börja."
          />
        </TabsContent>
      </Tabs>

      {/* Inline order creation view */}
      {creatingOrder && (
        <Card className="shadow-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-heading text-base">Ny beställning till grossist</CardTitle>
                <CardDescription className="text-xs">
                  Sök och lägg till produkter från produktbanken. Ange önskat antal och skicka beställningen.
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCreatingOrder(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Copy last order + Product search */}
            <div className="flex items-end gap-2">
              <div className="relative flex-1">
                <Label className="text-xs font-medium mb-1.5 block">Lägg till produkter</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt (namn eller SKU)..."
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setHighlightedIndex(-1); }}
                    onKeyDown={e => {
                      if (filteredProducts.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedIndex(prev => (prev + 1) % filteredProducts.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedIndex(prev => (prev <= 0 ? filteredProducts.length - 1 : prev - 1));
                      } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < filteredProducts.length) {
                        e.preventDefault();
                        addProduct(filteredProducts[highlightedIndex]);
                      }
                    }}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {filteredProducts.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredProducts.map((p, idx) => (
                      <button
                        key={p.id}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${idx === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                        onClick={() => addProduct(p)}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                      >
                        <span className="font-medium text-foreground">{p.name}</span>
                        <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Select
                value=""
                onValueChange={(orderId) => {
                  const picked = orders.find((o: any) => o.id === orderId);
                  if (!picked?.shop_order_lines?.length) {
                    toast({ title: "Ingen rader att kopiera", variant: "destructive" });
                    return;
                  }
                  const copied: OrderLine[] = picked.shop_order_lines.map((l: any) => ({
                    product_id: l.product_id,
                    product_name: l.products?.name || "–",
                    unit: l.unit || l.products?.unit || "ST",
                    quantity: String(l.quantity_ordered || ""),
                  }));
                  setOrderLines(copied);
                  toast({ title: "Order kopierad", description: `${copied.length} produkter tillagda från vecka ${displayOrderWeek(picked)}` });
                }}
              >
                <SelectTrigger className="h-8 text-xs w-auto gap-1.5 whitespace-nowrap" disabled={orders.length === 0}>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Kopiera tidigare order</span>
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">
                      {displayOrderWeek(o)} — {o.stores?.name} ({new Date(o.created_at).toLocaleDateString("sv-SE")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order lines */}
            {orderLines.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="text-xs font-medium text-muted-foreground">
                  {orderLines.length} produkt{orderLines.length > 1 ? "er" : ""} tillagda
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
                      {orderLines.map((line, idx) => (
                        <tr key={line.product_id} className="border-b border-border/30">
                          <td className="py-2 font-medium text-foreground">{line.product_name}</td>
                          <td className="py-2 text-muted-foreground">{line.unit}</td>
                          <td className="py-2 text-right">
                            <Input
                              type="number"
                              step="0.1"
                              value={line.quantity}
                              onChange={e => updateLine(idx, e.target.value)}
                              className="h-7 text-xs w-24 ml-auto text-right"
                              placeholder="0"
                              autoFocus={idx === orderLines.length - 1}
                            />
                          </td>
                          <td className="py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeLine(idx)}>
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
                      !desiredDeliveryDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={desiredDeliveryDate}
                    onSelect={setDesiredDeliveryDate}
                    disabled={isDateDisabled}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                    modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Anteckning (valfritt)</Label>
              <Textarea
                value={orderNote}
                onChange={e => setOrderNote(e.target.value)}
                placeholder="T.ex. brådskande leverans, specialförpackning..."
                className="text-xs min-h-[50px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setCreatingOrder(false)}>Avbryt</Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => setConfirmSendOpen(true)}
                disabled={orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0 || !desiredDeliveryDate}
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Skicka beställning
              </Button>
            </div>

            {/* Confirmation dialog */}
            <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle className="font-heading">Bekräfta beställning</DialogTitle>
                  <DialogDescription className="text-xs">
                    Är du säker på att du vill skicka beställningen med {orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length} produkt(er)? Ordern kan inte ändras efter att den skickats.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" size="sm" onClick={() => setConfirmSendOpen(false)}>Avbryt</Button>
                  <Button size="sm" className="gap-1.5" onClick={() => { setConfirmSendOpen(false); handleCreateOrder(); }}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Ja, skicka
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}

    </motion.div>
  );
}

/* ---- Inline edit component for order detail ---- */
function OrderDetailWithEdit({ order, products, onClose, toast, allowedWeekdays, isDateDisabled, inline }: {
  order: any;
  products: any[];
  onClose: () => void;
  toast: any;
  allowedWeekdays: Set<number> | null;
  isDateDisabled: (date: Date) => boolean;
  inline?: boolean;
}) {
  const createChange = useCreateChangeRequest();
  const resolveChange = useResolveChangeRequest();
  const { data: pendingChanges = [] } = useOrderChangeRequests(order.id);
  const isEditable = LIVE_STATUSES.includes(order.status);

  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<{ line_id: string; product_name: string; unit: string; old_qty: number; new_qty: string }[]>([]);
  const [newProducts, setNewProducts] = useState<{ product_id: string; product_name: string; unit: string; quantity: string }[]>([]);
  const [editProductSearch, setEditProductSearch] = useState("");
  const [editHighlightedIndex, setEditHighlightedIndex] = useState(-1);
  const editQtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const focusExistingLine = (productId: string) => {
    const line = (order.shop_order_lines || []).find((l: any) => l.product_id === productId);
    if (!line) return;
    const el = editQtyRefs.current[line.id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      el.select();
    }
    setEditProductSearch("");
    setEditHighlightedIndex(-1);
  };
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date | undefined>(
    order.desired_delivery_date ? new Date(order.desired_delivery_date + "T00:00:00") : undefined
  );
  const [origDeliveryDate] = useState(order.desired_delivery_date || null);

  const startEdit = () => {
    setEditMode(true);
    setEditLines(
      (order.shop_order_lines || []).map((l: any) => ({
        line_id: l.id,
        product_name: l.products?.name || "–",
        unit: l.unit || l.products?.unit || "ST",
        old_qty: l.quantity_ordered,
        new_qty: String(l.quantity_ordered),
      }))
    );
    setNewProducts([]);
  };

  const existingProductIds = new Set([
    ...(order.shop_order_lines || []).map((l: any) => l.product_id),
    ...newProducts.map(p => p.product_id),
  ]);

  const filteredEditProducts = products
    .filter(p =>
      editProductSearch &&
      (p.name.toLowerCase().includes(editProductSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(editProductSearch.toLowerCase()))
    )
    .map(p => ({ ...p, _alreadyOnOrder: existingProductIds.has(p.id) }))
    .sort((a: any, b: any) => Number(a._alreadyOnOrder) - Number(b._alreadyOnOrder))
    .slice(0, 8);

  const addNewProduct = (p: any) => {
    setNewProducts(prev => [{ product_id: p.id, product_name: p.name, unit: p.unit, quantity: "" }, ...prev]);
    setEditProductSearch("");
    setEditHighlightedIndex(-1);
  };

  const handleSubmitChanges = async () => {
    let changeCount = 0;

    // Quantity changes
    for (const line of editLines) {
      const newQty = Number(line.new_qty);
      if (newQty !== line.old_qty && newQty > 0) {
        await createChange.mutateAsync({
          shop_order_id: order.id,
          order_line_id: line.line_id,
          change_type: "quantity_change",
          old_value: String(line.old_qty),
          new_value: String(newQty),
          unit: line.unit,
        });
        changeCount++;
      }
    }

    // New product lines
    for (const np of newProducts) {
      const qty = Number(np.quantity);
      if (qty > 0) {
        await createChange.mutateAsync({
          shop_order_id: order.id,
          change_type: "add_line",
          product_id: np.product_id,
          new_value: String(qty),
          unit: np.unit,
        });
        changeCount++;
      }
    }

    // Delivery date change
    const newDateStr = editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : null;
    if (newDateStr !== origDeliveryDate) {
      await createChange.mutateAsync({
        shop_order_id: order.id,
        change_type: "delivery_date",
        old_value: origDeliveryDate || "–",
        new_value: newDateStr || "–",
      });
      changeCount++;
    }

    if (changeCount > 0) {
      toast({ title: "Ändringsförfrågan skickad", description: `${changeCount} ändring(ar) skickade till grossist för godkännande.` });
    } else {
      toast({ title: "Inga ändringar", description: "Du har inte gjort några ändringar.", variant: "destructive" });
    }
    setEditMode(false);
  };

  const pendingForOrder = pendingChanges.filter((c: any) => c.status === "Väntande" && (c as any).requested_by !== "grossist");
  const wholesalerRequests = pendingChanges.filter((c: any) => c.status === "Väntande" && (c as any).requested_by === "grossist");

  return (
    <>
      <div className={inline ? "flex items-center gap-2 flex-wrap" : ""}>
        {inline ? (
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <h3 className="font-heading font-semibold text-sm">Order {displayOrderWeek(order)}</h3>
            <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1`}>
              {statusIcon[order.status]}
              {order.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Skapad {new Date(order.created_at).toLocaleDateString("sv-SE")} · {order.stores?.name || "–"}
              {order.desired_delivery_date && <> · Önskat lev: <span className="font-medium text-foreground">{order.desired_delivery_date}</span></>}
            </span>
            {isEditable && !editMode && (
              <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px] gap-1" onClick={startEdit}>
                <Pencil className="h-3 w-3" /> Redigera
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={onClose}>
              <X className="h-3 w-3" /> Stäng
            </Button>
          </div>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              Order {displayOrderWeek(order)}
              <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1 ml-2`}>
                {statusIcon[order.status]}
                {order.status}
              </Badge>
              {isEditable && !editMode && (
                <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px] gap-1" onClick={startEdit}>
                  <Pencil className="h-3 w-3" /> Redigera
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Skapad {new Date(order.created_at).toLocaleDateString("sv-SE")} · {order.stores?.name || "–"}
              {order.desired_delivery_date && (
                <> · Önskat leveransdatum: <span className="font-medium text-foreground">{order.desired_delivery_date}</span></>
              )}
            </DialogDescription>
          </DialogHeader>
        )}
      </div>

      {order.notes && (
        <div className="bg-muted/30 rounded-md p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Anteckning:</span> {order.notes}
        </div>
      )}

      {/* Pending changes banner */}
      {pendingForOrder.length > 0 && !editMode && (
        <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs text-warning">
          <span className="font-medium">⏳ {pendingForOrder.length} ändringsförfrågan(or) väntar på godkännande från grossist.</span>
          <ul className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
            {pendingForOrder.map((c: any) => (
              <li key={c.id}>
                {c.change_type === "quantity_change" && `Antal: ${c.old_value} → ${c.new_value}`}
                {c.change_type === "add_line" && `Ny produkt: ${c.products?.name || "–"} (${c.new_value} ${c.unit || ""})`}
                {c.change_type === "delivery_date" && `Leveransdatum: ${c.old_value} → ${c.new_value}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wholesaler-initiated change requests */}
      {wholesalerRequests.length > 0 && !editMode && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-md p-3 text-xs space-y-2">
          <span className="font-medium text-destructive">⚠️ Grossisten har {wholesalerRequests.length} ändringsförfrågan/-or:</span>
          {wholesalerRequests.map((cr: any) => (
            <div key={cr.id} className="flex items-center justify-between gap-3 bg-background/50 rounded p-2">
              <div className="flex-1">
                {cr.change_type === "product_alternative" ? (
                  <>
                    <span className="font-medium text-foreground">{cr.products?.name || "Okänd produkt"}</span>
                    <span className="text-primary ml-1">→ föreslår alternativ: <span className="font-semibold">{cr.new_value}</span></span>
                    <span className="text-muted-foreground ml-1">({cr.unit})</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{cr.products?.name || "Okänd produkt"}</span>
                    <span className="text-destructive ml-1">ej tillgänglig</span>
                    <span className="text-muted-foreground ml-1">({cr.old_value} {cr.unit})</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                  onClick={() => resolveChange.mutate({ id: cr.id, status: "Godkänd" })}
                  disabled={resolveChange.isPending}
                >
                  <CheckCircle2 className="h-3 w-3" /> Acceptera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => resolveChange.mutate({ id: cr.id, status: "Nekad" })}
                  disabled={resolveChange.isPending}
                >
                  <XCircle className="h-3 w-3" /> Neka
                </Button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Ej tillgänglig: Acceptera = markeras som ej tillgänglig. Neka = produkten tas bort.<br />
            Alternativ: Acceptera = produkten byts ut. Neka = produkten tas bort.
          </p>
        </div>
      )}

      {/* View mode */}
      {!editMode && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Produkt</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Enhet</th>
                <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">Beställt</th>
                <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">Packat</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Avvikelse</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {order.shop_order_lines?.map((line: any) => {
                const qtyOrdered = line.quantity_ordered || 0;
                const qtyDelivered = line.quantity_delivered || 0;
                const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
                return (
                  <tr key={line.id} className={`border-b border-border/30 h-6 transition-colors ${rowBgByStatus[line.status || ""] || ""}`}>
                    <td className="px-1.5 py-0.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                    <td className="px-1.5 py-0.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                    <td className="px-1.5 py-0.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                    <td className={`px-1.5 py-0.5 text-right font-mono ${hasDiff ? "text-warning font-bold" : "text-muted-foreground"}`}>
                      {qtyDelivered > 0 ? qtyDelivered : "–"}
                    </td>
                    <td className="px-1.5 py-0.5 text-muted-foreground">{line.deviation || "–"}</td>
                    <td className="px-1.5 py-0.5">
                      {line.status ? (
                        <Badge variant="outline" className={`${statusColor[line.status] || ""} text-[10px] gap-1`}>
                          {statusIcon[line.status]}
                          {line.status}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className={`${statusColor["Ny"]} text-[10px] gap-1`}>
                          {statusIcon["Ny"]}
                          Ny
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Ändra antal på befintliga produkter:</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Nuvarande</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground w-28">Nytt antal</th>
                </tr>
              </thead>
              <tbody>
                {editLines.map((line, idx) => (
                  <tr key={line.line_id} className="border-b border-border/30">
                    <td className="py-2 font-medium text-foreground">{line.product_name}</td>
                    <td className="py-2 text-muted-foreground">{line.unit}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{line.old_qty}</td>
                    <td className="py-2 text-right">
                      <Input
                        ref={el => { editQtyRefs.current[line.line_id] = el; }}
                        type="number"
                        step="0.1"
                        value={line.new_qty}
                        onChange={e => setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, new_qty: e.target.value } : l))}
                        className={cn("h-7 text-xs w-24 ml-auto text-right", Number(line.new_qty) !== line.old_qty && "border-warning ring-1 ring-warning/30")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator />

          {/* Add new products */}
          <div className="relative">
            <Label className="text-xs font-medium mb-1.5 block">Lägg till nya produkter</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Sök produkt..."
                value={editProductSearch}
                onChange={e => { setEditProductSearch(e.target.value); setEditHighlightedIndex(-1); }}
                onKeyDown={e => {
                  if (filteredEditProducts.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setEditHighlightedIndex(prev => (prev + 1) % filteredEditProducts.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setEditHighlightedIndex(prev => (prev <= 0 ? filteredEditProducts.length - 1 : prev - 1)); }
                  else if (e.key === "Enter" && editHighlightedIndex >= 0) {
                    e.preventDefault();
                    const sel: any = filteredEditProducts[editHighlightedIndex];
                    if (sel && !sel._alreadyOnOrder) addNewProduct(sel);
                  }
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {filteredEditProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredEditProducts.map((p: any, idx) => (
                  <button
                    key={p.id}
                    disabled={p._alreadyOnOrder}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${p._alreadyOnOrder ? "opacity-50 cursor-not-allowed" : idx === editHighlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                    onClick={() => !p._alreadyOnOrder && addNewProduct(p)}
                    onMouseEnter={() => setEditHighlightedIndex(idx)}
                  >
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {p._alreadyOnOrder ? "redan på order" : `${p.sku} · ${p.unit}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {newProducts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {newProducts.map((np, idx) => (
                    <tr key={np.product_id} className="border-b border-border/30 bg-primary/5">
                      <td className="py-2 font-medium text-foreground">{np.product_name} <Badge className="text-[8px] ml-1" variant="outline">NY</Badge></td>
                      <td className="py-2 text-muted-foreground">{np.unit}</td>
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          step="0.1"
                          value={np.quantity}
                          onChange={e => setNewProducts(prev => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                          className="h-7 text-xs w-24 ml-auto text-right"
                          placeholder="0"
                          autoFocus={idx === newProducts.length - 1}
                        />
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setNewProducts(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Separator />

          {/* Delivery date change */}
          <div className="space-y-1.5">
            <Label className="text-xs">Önskat leveransdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left text-xs h-8 font-normal", !editDeliveryDate && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={editDeliveryDate}
                  onSelect={setEditDeliveryDate}
                  disabled={isDateDisabled}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                  modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {!inline && (
        <DialogFooter className="gap-2">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</Button>
              <Button size="sm" className="gap-1.5" onClick={handleSubmitChanges} disabled={createChange.isPending}>
                <Send className="h-3.5 w-3.5" /> Skicka ändringsförfrågan
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
          )}
        </DialogFooter>
      )}
      {inline && editMode && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</Button>
          <Button size="sm" className="gap-1.5" onClick={handleSubmitChanges} disabled={createChange.isPending}>
            <Send className="h-3.5 w-3.5" /> Skicka ändringsförfrågan
          </Button>
        </div>
      )}
    </>
  );
}
