import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ShoppingCart, Plus, Search, Clock, CheckCircle2, Truck, XCircle, X, Package,
  Archive, ListChecks, History, CalendarIcon,
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
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSite } from "@/contexts/SiteContext";

type OrderLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
};

const statusColor: Record<string, string> = {
  Ny: "bg-primary/10 text-primary border-primary/20",
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-accent/10 text-accent border-accent/20",
  Skickad: "bg-success/15 text-success border-success/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
  Arkiverad: "bg-muted text-muted-foreground border-border",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3 w-3" />,
  Behandlas: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
  Arkiverad: <Archive className="h-3 w-3" />,
};

const statusSegmentColor: Record<string, string> = {
  "": "transparent",
  "Ny": "transparent",
  "Behandlas": "#fef3c7",
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
  "Behandlas": "bg-amber-50 dark:bg-amber-950/20",
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

const LIVE_STATUSES = ["Ny", "Behandlas", "Packad", "Skickad"];
const DONE_STATUSES = ["Levererad", "Arkiverad", "Avbruten"];

function OrderTable({ orders, onSelect, emptyMsg }: { orders: any[]; onSelect: (o: any) => void; emptyMsg: string }) {
  return (
    <Card className="shadow-card">
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
                <th className="p-3 text-right font-medium text-muted-foreground">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{emptyMsg}</td></tr>
              )}
              {orders.map((o: any) => {
                const lines = o.shop_order_lines || [];
                return (
                  <tr key={o.id} className="border-b border-border/40 transition-colors cursor-pointer" style={{ background: buildProgressGradient(lines) }} onClick={() => onSelect(o)}>
                    <td className="p-3 font-mono font-medium text-foreground">{o.order_week}</td>
                    <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                    <td className="p-3 text-muted-foreground">{o.stores?.name || "–"}</td>
                    <td className="p-3 text-right text-foreground">{lines.length}</td>
                    <td className="p-3 text-muted-foreground text-[10px] max-w-48 truncate">
                      {lines.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                    </td>
                    <td className="p-3 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                    <td className="p-3 text-right">
                      <Badge variant="outline" className={`${statusColor[o.status] || ""} text-[10px] gap-1`}>
                        {statusIcon[o.status]}
                        {o.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ShopOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeStoreId } = useSite();
  const { data: products = [] } = useProducts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Order form
  const [orderNote, setOrderNote] = useState("");
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // Fetch shop orders with lines
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["shop-orders-shop", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(*, products(name, unit))")
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

  // Keep selectedOrder in sync with fetched data
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updated = orders.find((o: any) => o.id === selectedOrder.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(updated);
      }
    }
  }, [orders]);

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
    setOrderLines(prev => [...prev, {
      product_id: p.id, product_name: p.name, unit: p.unit, quantity: "",
    }]);
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
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    const lines = validLines.map(l => ({
      shop_order_id: order.id,
      product_id: l.product_id,
      quantity_ordered: Number(l.quantity),
      unit: l.unit,
      order_date: new Date().toISOString().slice(0, 10),
    }));

    const { error: lineError } = await supabase.from("shop_order_lines").insert(lines);
    if (lineError) {
      toast({ title: "Fel vid orderrader", description: lineError.message, variant: "destructive" });
      return;
    }

    toast({ title: "Beställning skickad!", description: `${validLines.length} produkter beställda` });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setDialogOpen(false);
    setOrderLines([]);
    setOrderNote("");
  };

  const pending = liveOrders.filter((o: any) => o.status === "Ny" || o.status === "Behandlas").length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Beställningar
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Beställ produkter från grossist/produktion och följ leveransstatus.</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs" onClick={() => setDialogOpen(true)}>
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
            onSelect={setSelectedOrder}
            emptyMsg="Inga aktiva beställningar just nu."
          />
        </TabsContent>

        <TabsContent value="done">
          <OrderTable
            orders={doneOrders}
            onSelect={setSelectedOrder}
            emptyMsg="Inga levererade eller arkiverade ordrar."
          />
        </TabsContent>

        <TabsContent value="all">
          <OrderTable
            orders={orders}
            onSelect={setSelectedOrder}
            emptyMsg="Inga beställningar ännu. Klicka &quot;Ny beställning&quot; för att börja."
          />
        </TabsContent>
      </Tabs>

      {/* Create order dialog */}
      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) { setOrderLines([]); setOrderNote(""); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ny beställning till grossist</DialogTitle>
            <DialogDescription className="text-xs">
              Sök och lägg till produkter från produktbanken. Ange önskat antal och skicka beställningen.
            </DialogDescription>
          </DialogHeader>

          {/* Product search */}
          <div className="relative">
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
            <Label className="text-xs">Anteckning (valfritt)</Label>
            <Textarea
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              placeholder="T.ex. brådskande leverans, specialförpackning..."
              className="text-xs min-h-[50px]"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setConfirmSendOpen(true)}
              disabled={orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0}
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Skicka beställning
            </Button>
          </DialogFooter>

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
        </DialogContent>
      </Dialog>

      {/* Order detail dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  Order {selectedOrder.order_week}
                  <Badge variant="outline" className={`${statusColor[selectedOrder.status] || ""} text-[10px] gap-1 ml-2`}>
                    {statusIcon[selectedOrder.status]}
                    {selectedOrder.status}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Skapad {new Date(selectedOrder.created_at).toLocaleDateString("sv-SE")} · {selectedOrder.stores?.name || "–"}
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
                        <tr key={line.id} className={`border-b border-border/30 transition-colors ${rowBgByStatus[line.status || ""] || ""}`}>
                          <td className="p-2.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                          <td className="p-2.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                          <td className="p-2.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                          <td className={`p-2.5 text-right font-mono ${hasDiff ? "text-warning font-bold" : "text-muted-foreground"}`}>
                            {qtyDelivered || "–"}
                          </td>
                          <td className="p-2.5 text-muted-foreground">{line.deviation || "–"}</td>
                          <td className="p-2.5">
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

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)}>Stäng</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
