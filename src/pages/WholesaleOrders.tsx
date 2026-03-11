import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Search, Clock, CheckCircle2, Truck, XCircle, Package,
  Eye, ListChecks, ChefHat, AlertTriangle, Archive, Bell, Check, X, Ban, Printer, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAllPendingChangeRequests, useResolveChangeRequest, useCreateChangeRequest } from "@/hooks/useOrderChangeRequests";
import PackingSlip from "@/components/PackingSlip";
import { moveStockToTransport } from "@/lib/stockTransfer";
import { useUpdateOrderLineStatus, STATUS_FLOW } from "@/hooks/useUpdateOrderLineStatus";
import { useAllStockByLocation } from "@/hooks/useStorageLocations";

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
  const retailStores = stores.filter(s => !s.is_wholesale);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrder = useMemo(() => selectedOrderId ? orders.find((o: any) => o.id === selectedOrderId) || null : null, [selectedOrderId, orders]);
  const [reportViewOrder, setReportViewOrder] = useState<any>(null);
  const [archiveConfirmOrder, setArchiveConfirmOrder] = useState<any>(null);
  const [packingSlipOrder, setPackingSlipOrder] = useState<any>(null);
  const { data: pendingChanges = [] } = useAllPendingChangeRequests();
  const resolveChange = useResolveChangeRequest();

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
    const { error } = await supabase
      .from("shop_orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    // When marking as "Skickad", move stock from Pre-locations to Transportlager
    if (newStatus === "Skickad") {
      try {
        await moveStockToTransport(orderId);
        // Also update all order lines to "Skickad"
        await supabase
          .from("shop_order_lines")
          .update({ status: "Skickad" })
          .eq("shop_order_id", orderId)
          .in("status", ["Packad", "Pågående", "Ny", ""]);
      } catch (err) {
        console.error("Stock transfer error:", err);
      }
    }

    toast({ title: "Orderstatus uppdaterad", description: newStatus });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
    qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    // No need to manually update selectedOrder — it derives from query data
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
            </div>

            <Card className="shadow-card">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                       <tr className="border-b border-border bg-muted/30 h-9">
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">VECKA</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">DATUM</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">BUTIK</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                         <th className="px-2.5 py-1 text-right font-medium text-muted-foreground">RADER</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">PRODUKTER</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">ANTECKNING</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground min-w-[120px]">STATUS</th>
                         <th className="px-2.5 py-1 text-left font-medium text-muted-foreground">LEVERANSRAPPORT</th>
                         <th className="px-2.5 py-1 text-center font-medium text-muted-foreground">PACKSEDEL</th>
                         <th className="px-2.5 py-1 text-center font-medium text-muted-foreground">ARKIVERA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 && (
                         <tr><td colSpan={10} className="px-2.5 py-6 text-center text-muted-foreground">Inga ordrar att visa.</td></tr>
                       )}
                       {filteredOrders.map((o: any) => (
                         <tr key={o.id} className="border-b border-border h-9 transition-colors cursor-pointer hover:bg-muted/30" onClick={() => setSelectedOrderId(o.id)}>
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
                      ))}
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
                      <tr key={o.id} className="border-b border-border/40 cursor-pointer hover:bg-muted/20" onClick={() => setSelectedOrderId(o.id)}>
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

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrderId(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  Order {selectedOrder.order_week} — {selectedOrder.stores?.name || "Okänd butik"}
                  <Badge variant="outline" className={`${statusColor[selectedOrder.status] || ""} text-[10px] gap-1 ml-2`}>
                    {statusIcon[selectedOrder.status]}
                    {selectedOrder.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Skapad {new Date(selectedOrder.created_at).toLocaleDateString("sv-SE")}
                  {(selectedOrder as any).desired_delivery_date && (
                    <> · Önskat leveransdatum: <span className="font-medium text-foreground">{(selectedOrder as any).desired_delivery_date}</span></>
                  )}
                </DialogDescription>
              </DialogHeader>

              {selectedOrder.notes && (
                <div className="bg-muted/30 rounded-md p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Anteckning:</span> {selectedOrder.notes}
                </div>
              )}

              <WholesaleOrderDetail order={selectedOrder} onClose={() => setSelectedOrderId(null)} stores={stores} />
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delivery report view dialog */}
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

      {/* Packing slip dialog */}
      <PackingSlip order={packingSlipOrder} open={!!packingSlipOrder} onOpenChange={(open) => { if (!open) setPackingSlipOrder(null); }} />
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

  // Build stock lookup: product_id -> qty in Grossist Flytande + Pre-lager for this store
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    const storeName = order.stores?.name || "";
    for (const s of allStock) {
      const locName = (s.storage_locations?.name || "").toLowerCase();
      const isGrossistFlytande = locName === "grossist flytande";
      const isPreForStore = locName.startsWith("pre-") && storeName && locName.includes(storeName.toLowerCase().split(" ").pop() || "___");
      if (isGrossistFlytande || isPreForStore) {
        const pid = s.product_id;
        map.set(pid, (map.get(pid) || 0) + Number(s.quantity));
      }
    }
    return map;
  }, [allStock, order.stores?.name]);

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
              <th className="px-2 py-1 text-right font-medium text-muted-foreground">Levererat</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground">Avvikelse</th>
              <th className="px-2 py-1 text-left font-medium text-muted-foreground min-w-[160px]">Status</th>
              <th className="px-2 py-1 text-center font-medium text-muted-foreground">Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {order.shop_order_lines?.map((line: any) => {
              const qtyOrdered = line.quantity_ordered || 0;
              const qtyDelivered = line.quantity_delivered || 0;
              const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
              const isUnavailable = line.status === "Ej tillgänglig";
              const stockQty = stockByProduct.get(line.product_id) || 0;
              const currentStatus = line.status || "Ny";
              const idx = STATUS_FLOW.indexOf(currentStatus as any);
              const prev = idx > 0 ? STATUS_FLOW[idx - 1] : null;
              const next = idx === -1 ? "Pågående" : (idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null);

              return (
                <tr key={line.id} className={`border-b border-border/30 h-7 transition-colors ${
                  isUnavailable ? "opacity-50 bg-destructive/5" :
                  currentStatus === "Skickad" ? "bg-primary/10" :
                  currentStatus === "Packad" || currentStatus === "Producerad" ? "bg-success/10" :
                  currentStatus === "Behandlas" ? "bg-warning/10" :
                  ""
                }`}>
                  <td className="px-2 py-0.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                  <td className="px-2 py-0.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                  <td className={`px-2 py-0.5 text-right font-mono ${stockQty >= qtyOrdered ? "text-success" : stockQty > 0 ? "text-warning" : "text-destructive"}`}>
                    {stockQty > 0 ? stockQty : "0"}
                  </td>
                  <td className={`px-2 py-0.5 text-right font-mono ${hasDiff ? "text-warning font-bold" : "text-muted-foreground"}`}>
                    {qtyDelivered || "–"}
                  </td>
                  <td className="px-2 py-0.5 text-muted-foreground">{line.deviation || "–"}</td>
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
                        currentStatus === "Behandlas" ? "text-warning border-warning/20" :
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
