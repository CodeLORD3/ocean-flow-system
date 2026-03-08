import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Search, Clock, CheckCircle2, Truck, XCircle, Package,
  Eye, ListChecks, ChefHat, AlertTriangle, Archive,
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

const statusColor: Record<string, string> = {
  Ny: "bg-primary/10 text-primary border-primary/20",
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-accent/10 text-accent border-accent/20",
  Skickad: "bg-success/15 text-success border-success/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3 w-3" />,
  Behandlas: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
};

const LINE_STATUSES = ["", "Behandlas", "Producerad", "Packad", "Skickad", "Ej tillgänglig"];

const statusSegmentColor: Record<string, string> = {
  "": "transparent",
  "Behandlas": "#fef3c7",
  "Producerad": "#dbeafe",
  "Packad": "#d1fae5",
  "Skickad": "#bbf7d0",
  "Ej tillgänglig": "#fee2e2",
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

const rowBgByStatus: Record<string, string> = {
  "": "",
  "Behandlas": "bg-amber-50 dark:bg-amber-950/20",
  "Producerad": "bg-blue-50 dark:bg-blue-950/20",
  "Packad": "bg-emerald-50 dark:bg-emerald-950/20",
  "Skickad": "bg-green-50 dark:bg-green-950/20",
  "Ej tillgänglig": "bg-red-50 dark:bg-red-950/20",
  "Ny": "bg-sky-50 dark:bg-sky-950/20",
  "Levererad": "bg-green-50 dark:bg-green-950/20",
  "Avbruten": "bg-red-50 dark:bg-red-950/20",
};

export default function WholesaleOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const retailStores = stores.filter(s => !s.is_wholesale);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [reportViewOrder, setReportViewOrder] = useState<any>(null);
  const [archiveConfirmOrder, setArchiveConfirmOrder] = useState<any>(null);

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
  const inProgress = activeOrders.filter((o: any) => o.status === "Behandlas").length;

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

    toast({ title: "Orderstatus uppdaterad", description: newStatus });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    if (selectedOrder?.id === orderId) {
      setSelectedOrder((prev: any) => prev ? { ...prev, status: newStatus } : null);
    }
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
    if (selectedOrder?.id === orderId) setSelectedOrder(null);
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
                      <tr className="border-b border-border bg-muted/30">
                        <th className="p-2.5 text-left font-medium text-muted-foreground">PRODUKT</th>
                        <th className="p-2.5 text-left font-medium text-muted-foreground">KATEGORI</th>
                        {retailStores.map(s => (
                          <th key={s.id} className="p-2.5 text-right font-medium text-muted-foreground text-[10px] uppercase">
                            {s.name?.split(" ").pop()}
                          </th>
                        ))}
                        <th className="p-2.5 text-right font-bold text-primary">TOTAL</th>
                        <th className="p-2.5 text-left font-medium text-muted-foreground">ENHET</th>
                        <th className="p-2.5 text-left font-medium text-muted-foreground min-w-[140px]">STATUS</th>
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
                              <tr key={item.product_id} className={`border-b border-border/30 transition-colors ${rowBgByStatus[item.currentStatus] || ""}`}>
                                <td className="p-2.5 font-medium text-foreground">{item.product_name}</td>
                                <td className="p-2.5">
                                  <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
                                </td>
                                {retailStores.map(s => (
                                  <td key={s.id} className="p-2.5 text-right text-muted-foreground font-mono">
                                    {item.byStore[s.id]?.qty || <span className="text-muted-foreground/30">–</span>}
                                  </td>
                                ))}
                                <td className="p-2.5 text-right font-bold text-primary font-mono">{item.totalOrdered}</td>
                                <td className="p-2.5 text-muted-foreground">{item.unit}</td>
                                <td className="p-2.5">
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
                  {["Alla", "Ny", "Behandlas", "Packad", "Skickad", "Levererad", "Avbruten"].map(s =>
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
                      <tr className="border-b border-border bg-muted/30">
                        <th className="p-3 text-left font-medium text-muted-foreground">VECKA</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">DATUM</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">BUTIK</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                        <th className="p-3 text-right font-medium text-muted-foreground">RADER</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">PRODUKTER</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">ANTECKNING</th>
                        <th className="p-3 text-left font-medium text-muted-foreground min-w-[120px]">STATUS</th>
                        <th className="p-3 text-left font-medium text-muted-foreground">LEVERANSRAPPORT</th>
                        <th className="p-3 text-center font-medium text-muted-foreground">ARKIVERA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrders.length === 0 && (
                        <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Inga ordrar att visa.</td></tr>
                      )}
                      {filteredOrders.map((o: any) => (
                        <tr key={o.id} className="border-b border-border/40 transition-colors cursor-pointer" style={{ background: buildProgressGradient(o.shop_order_lines || []) }} onClick={() => setSelectedOrder(o)}>
                          <td className="p-3 font-mono font-medium text-foreground">{o.order_week}</td>
                          <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                          <td className="p-3 text-muted-foreground">{o.stores?.name || "–"}</td>
                          <td className="p-3 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-48 truncate">
                            {o.shop_order_lines?.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                          </td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
                            <Select value={o.status} onValueChange={(val) => handleOrderStatusChange(o.id, val)}>
                              <SelectTrigger className="h-7 text-[10px] w-[110px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {["Ny", "Behandlas", "Packad", "Skickad", "Levererad", "Avbruten"].map(s =>
                                  <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-3" onClick={e => e.stopPropagation()}>
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
                          <td className="p-3 text-center" onClick={e => e.stopPropagation()}>
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
                      <th className="p-3 text-right font-medium text-muted-foreground">RADER</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">PRODUKTER</th>
                      <th className="p-3 text-left font-medium text-muted-foreground">ANTECKNING</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedOrders.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Inga arkiverade ordrar.</td></tr>
                    )}
                    {archivedOrders.map((o: any) => (
                      <tr key={o.id} className="border-b border-border/40 cursor-pointer hover:bg-muted/20" onClick={() => setSelectedOrder(o)}>
                        <td className="p-3 font-mono font-medium text-foreground">{o.order_week}</td>
                        <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                        <td className="p-3 text-muted-foreground">{o.stores?.name || "–"}</td>
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
      </Tabs>

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrder(null); }}>
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
                </DialogDescription>
              </DialogHeader>

              {selectedOrder.notes && (
                <div className="bg-muted/30 rounded-md p-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Anteckning:</span> {selectedOrder.notes}
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="p-2.5 text-left font-medium text-muted-foreground">Produkt</th>
                      <th className="p-2.5 text-left font-medium text-muted-foreground">Enhet</th>
                      <th className="p-2.5 text-right font-medium text-muted-foreground">Beställt</th>
                      <th className="p-2.5 text-right font-medium text-muted-foreground">Levererat</th>
                      <th className="p-2.5 text-left font-medium text-muted-foreground">Avvikelse</th>
                      <th className="p-2.5 text-left font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.shop_order_lines?.map((line: any) => {
                      const qtyOrdered = line.quantity_ordered || 0;
                      const qtyDelivered = line.quantity_delivered || 0;
                      const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
                      return (
                        <tr key={line.id} className="border-b border-border/30">
                          <td className="p-2.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                          <td className="p-2.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                          <td className="p-2.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                          <td className={`p-2.5 text-right font-mono ${hasDiff ? "text-warning font-bold" : "text-muted-foreground"}`}>
                            {qtyDelivered || "–"}
                          </td>
                          <td className="p-2.5 text-muted-foreground">{line.deviation || "–"}</td>
                          <td className="p-2.5">
                            {line.status ? (
                              <Badge variant="outline" className={`text-[10px] ${
                                line.status === "Ej tillgänglig" ? "text-destructive border-destructive/20" :
                                line.status === "Packad" || line.status === "Producerad" ? "text-success border-success/20" :
                                ""
                              }`}>{line.status}</Badge>
                            ) : <span className="text-muted-foreground/50">–</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>Stäng</Button>
              </DialogFooter>
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
    </motion.div>
  );
}
