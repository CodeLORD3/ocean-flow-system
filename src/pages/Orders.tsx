import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Clock, CheckCircle2, Truck, XCircle, Package, ShoppingCart, ChevronDown, ChevronRight, ArrowRight, Pencil, Plus, X, Send, Trash2, CalendarIcon, FileText, Printer } from "lucide-react";
import DeliveryNote from "@/components/DeliveryNote";
import PackingSlip from "@/components/PackingSlip";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useProducts } from "@/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";
import { syncBehandlasFromStock } from "@/lib/orderStatusSync";
import { useUpdateOrderLineStatus, STATUS_FLOW } from "@/hooks/useUpdateOrderLineStatus";
import { useAllPendingChangeRequests, useOrderChangeRequests, useResolveChangeRequest } from "@/hooks/useOrderChangeRequests";
import { useSite } from "@/contexts/SiteContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { logActivity } from "@/hooks/useActivityLog";
import { supabase } from "@/integrations/supabase/client";
import { format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";

const statusColor: Record<string, string> = {
  "": "bg-muted text-muted-foreground border-border",
  Ny: "bg-muted text-muted-foreground border-border",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-success/15 text-success border-success/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  "Klar / Levererad": "bg-success/15 text-success border-success/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  "": <Clock className="h-3.5 w-3.5" />,
  Ny: <Clock className="h-3.5 w-3.5" />,
  Pågående: <Clock className="h-3.5 w-3.5" />,
  Packad: <Package className="h-3.5 w-3.5" />,
  Skickad: <Truck className="h-3.5 w-3.5" />,
  "Klar / Levererad": <CheckCircle2 className="h-3.5 w-3.5" />,
  Levererad: <CheckCircle2 className="h-3.5 w-3.5" />,
  Avbruten: <XCircle className="h-3.5 w-3.5" />,
};

function getNextStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as any);
  if (idx === -1) return "Pågående"; // from empty/Ny
  if (idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
  return null;
}

function getPrevStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as any);
  if (idx <= 0) return null;
  return STATUS_FLOW[idx - 1];
}

export default function Orders() {
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("Alla butiker");
  const [statusFilterVal, setStatusFilterVal] = useState("Alla");
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Packer dialog state
  const [packerDialogOpen, setPackerDialogOpen] = useState(false);
  const [packerName, setPackerName] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null); // kept for sync
  const [pendingPackAction, setPendingPackAction] = useState<{
    order: any;
    lines: any[];
    pendingLineChange?: { lineId: string; orderId: string; newStatus: string };
  } | null>(null);

  // Print state
  const [printFolljesedel, setPrintFolljesedel] = useState<any>(null);
  const [printPacksedel, setPrintPacksedel] = useState<any>(null);

  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const { data: transportSchedules = [] } = useTransportSchedules();
  const queryClient = useQueryClient();
  const syncRan = useRef(false);
  const { site } = useSite();
  const { activeUser } = useActiveUser();
  const updateLineStatus = useUpdateOrderLineStatus();

  const isGrossist = site === "wholesale";

  // Keep selectedOrder in sync with fetched data
  useEffect(() => {
    if (selectedOrder && orders.length > 0) {
      const updated = orders.find((o: any) => o.id === selectedOrder.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedOrder)) {
        setSelectedOrder(updated);
      }
    }
  }, [orders]);

  useEffect(() => {
    if (syncRan.current) return;
    syncRan.current = true;
    syncBehandlasFromStock().then(() => {
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
    });
  }, []);

  const storeOptions = ["Alla butiker", ...stores.map((s: any) => s.name)];
  const statusOptions = ["Alla", "Ny", "Pågående", "Packad", "Skickad", "Klar / Levererad"];

  const filtered = orders.filter((o: any) => {
    const storeName = o.stores?.name || "";
    const matchSearch =
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      storeName.toLowerCase().includes(search.toLowerCase()) ||
      o.order_week?.toLowerCase().includes(search.toLowerCase());
    const matchStore = storeFilter === "Alla butiker" || storeName === storeFilter;
    const matchStatus = statusFilterVal === "Alla" || o.status === statusFilterVal;
    return matchSearch && matchStore && matchStatus;
  });

  const totalOrders = orders.length;
  const pending = orders.filter((o: any) => o.status === "Pågående").length;
  const packed = orders.filter((o: any) => o.status === "Packad").length;
  const delivered = orders.filter((o: any) => o.status === "Klar / Levererad" || o.status === "Levererad").length;

  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startPackProcess = async (packerNameVal: string, order: any, lines: any[], pendingLineChange?: { lineId: string; orderId: string; newStatus: string }) => {
    // Save packer name to order
    await supabase.from("shop_orders").update({ packer_name: packerNameVal }).eq("id", order.id);

    // Set all Ny lines to Pågående
    const nyLines = lines.filter((l: any) => !l.status || l.status === "Ny" || l.status === "");
    for (const line of nyLines) {
      updateLineStatus.mutate({ lineId: line.id, newStatus: "Pågående", orderId: order.id });
    }

    // If there was a pending line change beyond just "Pågående", apply it
    if (pendingLineChange) {
      const alreadyHandled = nyLines.some((l: any) => l.id === pendingLineChange.lineId) && pendingLineChange.newStatus === "Pågående";
      if (!alreadyHandled) {
        updateLineStatus.mutate(
          { lineId: pendingLineChange.lineId, newStatus: pendingLineChange.newStatus, orderId: pendingLineChange.orderId },
          { onSuccess: () => toast.success(`Status ändrad till ${pendingLineChange.newStatus}`) }
        );
      }
    }

    toast.success(`Packprocess startad av ${packerNameVal} (${nyLines.length} rader → Pågående)`);
    queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
  };

  const handlePackerConfirm = () => {
    if (!packerName.trim() || !pendingPackAction) return;
    startPackProcess(packerName.trim(), pendingPackAction.order, pendingPackAction.lines, pendingPackAction.pendingLineChange);
    setPackerDialogOpen(false);
    setPackerName("");
    setPendingPackAction(null);
  };

  const handleStatusChange = (lineId: string, orderId: string, newStatus: string) => {
    // Find the order to check if packer_name is set
    const order = orders.find((o: any) => o.id === orderId);
    if (!order) return;

    // If order has no packer_name, show the packer dialog first
    if (!order.packer_name) {
      const lines = order.shop_order_lines || [];
      setPendingPackAction({ order, lines, pendingLineChange: { lineId, orderId, newStatus } });
      setPackerDialogOpen(true);
      return;
    }

    updateLineStatus.mutate(
      { lineId, newStatus, orderId },
      {
        onSuccess: () => toast.success(`Status ändrad till ${newStatus}`),
        onError: () => toast.error("Kunde inte ändra status"),
      }
    );
  };

  const handlePackOrder = (order: any, lines: any[]) => {
    const nyLines = lines.filter((l: any) => !l.status || l.status === "Ny" || l.status === "");
    if (nyLines.length === 0) return;

    if (!order.packer_name) {
      setPendingPackAction({ order, lines });
      setPackerDialogOpen(true);
      return;
    }

    // Already has packer, just transition
    nyLines.forEach((line: any) => {
      updateLineStatus.mutate(
        { lineId: line.id, newStatus: "Pågående", orderId: order.id },
        { onError: () => toast.error("Kunde inte ändra status") }
      );
    });
    toast.success(`Order satt till Pågående (${nyLines.length} rader)`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Beställningshantering</h2>
          <p className="text-xs text-muted-foreground">Spåra och hantera beställningar för alla butiker</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pågående", count: pending, icon: Clock, color: "text-warning" },
          { label: "Packade", count: packed, icon: Package, color: "text-accent-foreground" },
          { label: "Levererade", count: delivered, icon: CheckCircle2, color: "text-success" },
          { label: "Totalt", count: totalOrders, icon: ShoppingCart, color: "text-foreground" },
        ].map((s) => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-3 flex items-center gap-3">
              <div className={`h-8 w-8 rounded-md bg-muted flex items-center justify-center ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-heading font-bold text-foreground">{s.count}</p>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Sök order-ID eller butik..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storeOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilterVal} onValueChange={setStatusFilterVal}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-border">
                     {isGrossist && <th className="pb-1.5 text-left font-medium text-muted-foreground w-24"></th>}
                     <th className="pb-1.5 text-left font-medium text-muted-foreground w-5"></th>
                     <th className="pb-1.5 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Vecka</th>
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Önskat lev.datum</th>
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Skapad</th>
                    <th className="pb-1.5 text-right font-medium text-muted-foreground">Art.</th>
                    <th className="pb-1.5 text-right font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order: any) => {
                    const lines = order.shop_order_lines || [];
                    const isExpanded = expandedOrders.has(order.id);

                    return (
                      <OrderRow
                        key={order.id}
                        order={order}
                        lines={lines}
                        isExpanded={isExpanded}
                        onToggle={() => toggleExpand(order.id)}
                        onSelectOrder={() => {
                          // Expand the order and enter edit mode inline
                          if (!expandedOrders.has(order.id)) toggleExpand(order.id);
                          setEditingOrderId(order.id);
                        }}
                        isGrossist={isGrossist}
                        onStatusChange={handleStatusChange}
                        onPackOrder={handlePackOrder}
                        onPrintFolljesedel={(o) => setPrintFolljesedel(o)}
                        onPrintPacksedel={(o) => setPrintPacksedel(o)}
                        isPending={updateLineStatus.isPending}
                        editingOrderId={editingOrderId}
                        setEditingOrderId={setEditingOrderId}
                        products={products}
                        transportSchedules={transportSchedules}
                        stores={stores}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={isGrossist ? 8 : 7} className="text-center py-8 text-muted-foreground">Inga beställningar hittades</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
            <span>Visar {filtered.length} av {orders.length} beställningar</span>
          </div>
        </CardContent>
      </Card>

      {/* Packer name dialog */}
      <Dialog open={packerDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setPackerDialogOpen(false);
          setPackerName("");
          setPendingPackAction(null);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-heading flex items-center gap-2">
              <Package className="h-4 w-4" /> Starta packprocess
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Ange vem som packar denna order. Alla produkter sätts automatiskt till <Badge variant="outline" className="bg-warning/15 text-warning border-warning/20 text-[10px] mx-1">Pågående</Badge>.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">Packare</Label>
              <Input
                placeholder="Namn på packare..."
                value={packerName}
                onChange={(e) => setPackerName(e.target.value)}
                className="h-8 text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePackerConfirm();
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setPackerDialogOpen(false); setPackerName(""); setPendingPackAction(null); }}>
              Avbryt
            </Button>
            <Button size="sm" className="text-xs gap-1.5" disabled={!packerName.trim()} onClick={handlePackerConfirm}>
              <Package className="h-3.5 w-3.5" /> Starta packning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wholesale editing is now inline — no dialog needed */}

      {/* Följesedel print dialog */}
      <DeliveryNote order={printFolljesedel} open={!!printFolljesedel} onOpenChange={(open) => { if (!open) setPrintFolljesedel(null); }} />

      {/* Packsedel print dialog */}
      <PackingSlip order={printPacksedel} open={!!printPacksedel} onOpenChange={(open) => { if (!open) setPrintPacksedel(null); }} />
    </motion.div>
  );
}

const LIVE_STATUSES = ["Ny", "Pågående", "Packad", "Skickad"];

const rowBgByStatus: Record<string, string> = {
  "": "",
  "Ny": "",
  "Pågående": "bg-amber-50 dark:bg-amber-950/20",
  "Packad": "bg-emerald-50 dark:bg-emerald-950/20",
  "Skickad": "bg-green-50 dark:bg-green-950/20",
  "Levererad": "bg-green-50 dark:bg-green-950/20",
  "Klar / Levererad": "bg-green-50 dark:bg-green-950/20",
  "Ej tillgänglig": "bg-red-50 dark:bg-red-950/20",
};

function OrderRow({
  order,
  lines,
  isExpanded,
  onToggle,
  onSelectOrder,
  isGrossist,
  onStatusChange,
  onPackOrder,
  onPrintFolljesedel,
  onPrintPacksedel,
  isPending,
}: {
  order: any;
  lines: any[];
  isExpanded: boolean;
  onToggle: () => void;
  onSelectOrder?: () => void;
  isGrossist: boolean;
  onStatusChange: (lineId: string, orderId: string, newStatus: string) => void;
  onPackOrder: (order: any, lines: any[]) => void;
  onPrintFolljesedel: (order: any) => void;
  onPrintPacksedel: (order: any) => void;
  isPending: boolean;
}) {
  const canPack = order.status === "Ny" || order.status === "";

  return (
    <>
      <tr
        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors h-9 cursor-pointer"
        onClick={onToggle}
      >
        {isGrossist && (
          <td className="px-1 py-1" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              {canPack && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] gap-1 bg-warning/10 border-warning/30 text-warning hover:bg-warning/20"
                  disabled={isPending}
                  onClick={() => onPackOrder(order, lines)}
                >
                  <Package className="h-3 w-3" />
                  Packa
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => onSelectOrder?.()}
              >
                <Pencil className="h-3 w-3" />
                Redigera
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => onPrintFolljesedel(order)}
              >
                <FileText className="h-3 w-3" />
                Följesedel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1"
                onClick={() => onPrintPacksedel(order)}
              >
                <Printer className="h-3 w-3" />
                Packsedel
              </Button>
            </div>
          </td>
        )}
        <td className="px-1 py-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-1.5 py-1 font-medium text-foreground whitespace-nowrap">{order.stores?.name || "—"}</td>
        <td className="px-1.5 py-1 text-muted-foreground">{order.order_week}</td>
        <td className="px-1.5 py-1 text-muted-foreground whitespace-nowrap">
          {order.desired_delivery_date ? format(new Date(order.desired_delivery_date), "yy-MM-dd") : "—"}
        </td>
        <td className="px-1.5 py-1 text-muted-foreground whitespace-nowrap">
          {order.created_at ? format(new Date(order.created_at), "yy-MM-dd HH:mm") : "—"}
        </td>
        <td className="px-1.5 py-1 text-right text-foreground">{lines.length}</td>
        <td className="px-1.5 py-1 text-right">
          <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-0.5`}>
            {statusIcon[order.status] || null}
            {order.status}
          </Badge>
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={isGrossist ? 8 : 7} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/20 border-b border-border px-4 py-2">
                  {order.packer_name && (
                    <div className="mb-2 text-[10px] text-muted-foreground">
                      Packare: <span className="font-medium text-foreground">{order.packer_name}</span>
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Kategori</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Beställt</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Packat</th>
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Enhet</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Status</th>
                        {isGrossist && <th className="pb-1.5 text-right font-medium text-muted-foreground">Åtgärd</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line: any) => {
                        const lineStatus = line.status || "Ny";
                        const next = getNextStatus(lineStatus);
                        const prev = getPrevStatus(lineStatus);

                        return (
                          <tr key={line.id} className="border-b border-border/30 last:border-0 h-8">
                            <td className="py-1 font-medium text-foreground">{line.products?.name || "—"}</td>
                            <td className="py-1 text-muted-foreground">{line.products?.category || "—"}</td>
                            <td className="py-1 text-right text-foreground">{line.quantity_ordered}</td>
                            <td className="py-1 text-right text-muted-foreground">{Number(line.quantity_delivered || 0) > 0 ? line.quantity_delivered : "–"}</td>
                            <td className="py-1 text-muted-foreground">{line.unit || line.products?.unit || "kg"}</td>
                            <td className="py-1 text-right">
                              <Badge variant="outline" className={`${statusColor[lineStatus] || statusColor["Ny"]} text-[10px] gap-1`}>
                                {statusIcon[lineStatus] || statusIcon["Ny"]}
                                {lineStatus}
                              </Badge>
                            </td>
                            {isGrossist && (
                              <td className="py-1 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {prev && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                      disabled={isPending}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(line.id, order.id, prev);
                                      }}
                                    >
                                      ← {prev}
                                    </Button>
                                  )}
                                  {next && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-6 px-2 text-[10px] gap-1"
                                      disabled={isPending}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStatusChange(line.id, order.id, next);
                                      }}
                                    >
                                      {next} <ArrowRight className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

/* ---- Wholesale Order Detail with Direct Edit ---- */
function WholesaleOrderDetail({ order, products, transportSchedules, stores, onClose }: {
  order: any;
  products: any[];
  transportSchedules: any[];
  stores: any[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const resolveChange = useResolveChangeRequest();
  const { data: pendingChanges = [] } = useOrderChangeRequests(order.id);
  const { activeUser } = useActiveUser();
  const isEditable = LIVE_STATUSES.includes(order.status);

  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<{ line_id: string; product_name: string; unit: string; old_qty: number; new_qty: string }[]>([]);
  const [newProducts, setNewProducts] = useState<{ product_id: string; product_name: string; unit: string; quantity: string }[]>([]);
  const [editProductSearch, setEditProductSearch] = useState("");
  const [editHighlightedIndex, setEditHighlightedIndex] = useState(-1);
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date | undefined>(
    order.desired_delivery_date ? new Date(order.desired_delivery_date + "T00:00:00") : undefined
  );
  const [origDeliveryDate] = useState(order.desired_delivery_date || null);
  const [saving, setSaving] = useState(false);

  // Determine allowed weekdays for this store's transport zone
  const orderStore = stores.find((s: any) => s.id === order.store_id);
  const allowedWeekdays = (() => {
    if (!orderStore) return null;
    const city = (orderStore.city || "").toLowerCase();
    const name = (orderStore.name || "").toLowerCase();
    let zoneKey = "international";
    if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) zoneKey = "gothenburg";
    else if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) zoneKey = "stockholm";
    const days = transportSchedules.filter((s: any) => s.zone_key === zoneKey).map((s: any) => s.departure_weekday);
    return days.length > 0 ? new Set(days) : null;
  })();

  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    if (!allowedWeekdays) return false;
    const jsDay = getDay(date);
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !allowedWeekdays.has(isoDay);
  };

  const startEdit = () => {
    setEditMode(true);
    setEditLines(
      (order.shop_order_lines || []).map((l: any) => ({
        line_id: l.id,
        product_name: l.products?.name || "–",
        unit: l.unit || l.products?.unit || "kg",
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

  const filteredEditProducts = products.filter(p =>
    editProductSearch &&
    (p.name.toLowerCase().includes(editProductSearch.toLowerCase()) ||
      p.sku.toLowerCase().includes(editProductSearch.toLowerCase())) &&
    !existingProductIds.has(p.id)
  ).slice(0, 8);

  const addNewProduct = (p: any) => {
    setNewProducts(prev => [{ product_id: p.id, product_name: p.name, unit: p.unit, quantity: "" }, ...prev]);
    setEditProductSearch("");
    setEditHighlightedIndex(-1);
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    const userName = activeUser ? `${activeUser.first_name} ${activeUser.last_name}` : "Grossist";
    let changeCount = 0;

    try {
      // Update quantities directly
      for (const line of editLines) {
        const newQty = Number(line.new_qty);
        if (newQty !== line.old_qty && newQty > 0) {
          const { error } = await supabase
            .from("shop_order_lines")
            .update({ quantity_ordered: newQty })
            .eq("id", line.line_id);
          if (error) throw error;
          changeCount++;
        }
        // If qty is 0 or removed, delete the line
        if (newQty <= 0) {
          const { error } = await supabase
            .from("shop_order_lines")
            .delete()
            .eq("id", line.line_id);
          if (error) throw error;
          changeCount++;
        }
      }

      // Add new product lines directly
      const deliveryDateStr = editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : order.desired_delivery_date;
      for (const np of newProducts) {
        const qty = Number(np.quantity);
        if (qty > 0) {
          const { error } = await supabase
            .from("shop_order_lines")
            .insert({
              shop_order_id: order.id,
              product_id: np.product_id,
              quantity_ordered: qty,
              unit: np.unit,
              delivery_date: deliveryDateStr,
            });
          if (error) throw error;
          changeCount++;
        }
      }

      // Update delivery date if changed
      const newDateStr = editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : null;
      if (newDateStr !== origDeliveryDate) {
        const { error } = await supabase
          .from("shop_orders")
          .update({ desired_delivery_date: newDateStr } as any)
          .eq("id", order.id);
        if (error) throw error;

        // Also update delivery_date on all existing lines
        if (newDateStr) {
          await supabase
            .from("shop_order_lines")
            .update({ delivery_date: newDateStr })
            .eq("shop_order_id", order.id);
        }
        changeCount++;
      }

      if (changeCount > 0) {
        await logActivity({
          action_type: "update",
          description: `Grossist redigerade order (${changeCount} ändring${changeCount > 1 ? "ar" : ""})`,
          portal: "wholesale",
          entity_type: "shop_order",
          entity_id: order.id,
          performed_by: userName,
        });
        toast.success(`${changeCount} ändring${changeCount > 1 ? "ar" : ""} sparade`);
      } else {
        toast.info("Inga ändringar gjordes");
      }

      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      setEditMode(false);
    } catch (err: any) {
      toast.error("Fel vid sparning: " + (err.message || "Okänt fel"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    const { error } = await supabase.from("shop_order_lines").delete().eq("id", lineId);
    if (error) {
      toast.error("Kunde inte ta bort rad");
      return;
    }
    toast.success("Orderrad borttagen");
    queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
  };

  // Shop-initiated pending change requests
  const shopPendingRequests = pendingChanges.filter((c: any) => c.status === "Väntande" && c.requested_by !== "grossist");

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-heading flex items-center gap-2">
          Order {order.order_week} · {order.stores?.name || "–"}
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
          Skapad {new Date(order.created_at).toLocaleDateString("sv-SE")}
          {order.created_by && <> · Best.av: <span className="font-medium text-foreground">{order.created_by}</span></>}
          {order.desired_delivery_date && (
            <> · Önskat lev.datum: <span className="font-medium text-foreground">{order.desired_delivery_date}</span></>
          )}
          {order.packer_name && (
            <> · Packare: <span className="font-medium text-foreground">{order.packer_name}</span></>
          )}
        </DialogDescription>
      </DialogHeader>

      {order.notes && (
        <div className="bg-muted/30 rounded-md p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Anteckning:</span> {order.notes}
        </div>
      )}

      {/* Shop-initiated pending change requests for wholesale to approve */}
      {shopPendingRequests.length > 0 && !editMode && (
        <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs space-y-2">
          <span className="font-medium text-warning">⏳ {shopPendingRequests.length} ändringsförfrågan/-or från butik väntar på godkännande:</span>
          {shopPendingRequests.map((cr: any) => (
            <div key={cr.id} className="flex items-center justify-between gap-3 bg-background/50 rounded p-2">
              <div className="flex-1 text-[10px]">
                {cr.change_type === "quantity_change" && (
                  <><span className="font-medium text-foreground">{cr.products?.name || "–"}</span>: {cr.old_value} → <span className="font-semibold text-foreground">{cr.new_value}</span> {cr.unit}</>
                )}
                {cr.change_type === "add_line" && (
                  <>Ny produkt: <span className="font-medium text-foreground">{cr.products?.name || "–"}</span> ({cr.new_value} {cr.unit})</>
                )}
                {cr.change_type === "delivery_date" && (
                  <>Leveransdatum: {cr.old_value} → <span className="font-semibold text-foreground">{cr.new_value}</span></>
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
                  <CheckCircle2 className="h-3 w-3" /> Godkänn
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
        </div>
      )}

      {/* View mode */}
      {!editMode && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="p-2.5 text-left font-medium text-muted-foreground">Produkt</th>
                <th className="p-2.5 text-left font-medium text-muted-foreground">Kategori</th>
                <th className="p-2.5 text-left font-medium text-muted-foreground">Enhet</th>
                <th className="p-2.5 text-right font-medium text-muted-foreground">Beställt</th>
                <th className="p-2.5 text-right font-medium text-muted-foreground">Levererat</th>
                <th className="p-2.5 text-left font-medium text-muted-foreground">Avvikelse</th>
                <th className="p-2.5 text-left font-medium text-muted-foreground">Status</th>
                <th className="p-2.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {order.shop_order_lines?.map((line: any) => {
                const lineStatus = line.status || "Ny";
                return (
                  <tr key={line.id} className={`border-b border-border/30 transition-colors ${rowBgByStatus[lineStatus] || ""}`}>
                    <td className="p-2.5 font-medium text-foreground">{line.products?.name || "–"}</td>
                    <td className="p-2.5 text-muted-foreground">{line.products?.category || "–"}</td>
                    <td className="p-2.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                    <td className="p-2.5 text-right font-mono text-foreground">{line.quantity_ordered}</td>
                    <td className="p-2.5 text-right font-mono text-muted-foreground">{line.quantity_delivered || "–"}</td>
                    <td className="p-2.5 text-muted-foreground">{line.deviation || "–"}</td>
                    <td className="p-2.5">
                      <Badge variant="outline" className={`${statusColor[lineStatus] || statusColor["Ny"]} text-[10px] gap-1`}>
                        {statusIcon[lineStatus] || statusIcon["Ny"]}
                        {lineStatus}
                      </Badge>
                    </td>
                    <td className="p-2.5">
                      {isEditable && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteLine(line.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
          <div className="text-xs font-medium text-muted-foreground">Ändra antal på befintliga produkter (sätt till 0 för att ta bort):</div>
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
                  else if (e.key === "Enter" && editHighlightedIndex >= 0) { e.preventDefault(); addNewProduct(filteredEditProducts[editHighlightedIndex]); }
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {filteredEditProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredEditProducts.map((p, idx) => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${idx === editHighlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                    onClick={() => addNewProduct(p)}
                    onMouseEnter={() => setEditHighlightedIndex(idx)}
                  >
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
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
                          autoFocus={idx === 0}
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

      <DialogFooter className="gap-2">
        {editMode ? (
          <>
            <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</Button>
            <Button size="sm" className="gap-1.5" onClick={handleSaveChanges} disabled={saving}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Spara ändringar
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
        )}
      </DialogFooter>
    </>
  );
}