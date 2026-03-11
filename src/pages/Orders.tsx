import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Clock, CheckCircle2, Truck, XCircle, Package, ShoppingCart, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useQueryClient } from "@tanstack/react-query";
import { syncBehandlasFromStock } from "@/lib/orderStatusSync";
import { useUpdateOrderLineStatus, STATUS_FLOW } from "@/hooks/useUpdateOrderLineStatus";
import { useSite } from "@/contexts/SiteContext";
import { format } from "date-fns";
import { toast } from "sonner";

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

  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const queryClient = useQueryClient();
  const syncRan = useRef(false);
  const { site } = useSite();
  const updateLineStatus = useUpdateOrderLineStatus();

  const isGrossist = site === "wholesale";

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

  const handleStatusChange = (lineId: string, orderId: string, newStatus: string) => {
    updateLineStatus.mutate(
      { lineId, newStatus, orderId },
      {
        onSuccess: () => toast.success(`Status ändrad till ${newStatus}`),
        onError: () => toast.error("Kunde inte ändra status"),
      }
    );
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
          { label: "Behandlas", count: pending, icon: Clock, color: "text-warning" },
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
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground w-6"></th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Önskat leveransdatum</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Skapad</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Artiklar</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
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
                        isGrossist={isGrossist}
                        onStatusChange={handleStatusChange}
                        isPending={updateLineStatus.isPending}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Inga beställningar hittades</td></tr>
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
    </motion.div>
  );
}

function OrderRow({
  order,
  lines,
  isExpanded,
  onToggle,
  isGrossist,
  onStatusChange,
  isPending,
}: {
  order: any;
  lines: any[];
  isExpanded: boolean;
  onToggle: () => void;
  isGrossist: boolean;
  onStatusChange: (lineId: string, orderId: string, newStatus: string) => void;
  isPending: boolean;
}) {
  return (
    <>
      <tr
        className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors h-9 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-1 py-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </td>
        <td className="px-2 py-1 font-medium text-foreground">{order.stores?.name || "—"}</td>
        <td className="px-2 py-1 text-muted-foreground">{order.order_week}</td>
        <td className="px-2 py-1 text-muted-foreground">
          {order.desired_delivery_date ? format(new Date(order.desired_delivery_date), "yyyy-MM-dd") : "—"}
        </td>
        <td className="px-2 py-1 text-muted-foreground">
          {order.created_at ? format(new Date(order.created_at), "yyyy-MM-dd HH:mm") : "—"}
        </td>
        <td className="px-2 py-1 text-right text-foreground">{lines.length}</td>
        <td className="px-2 py-1 text-right">
          <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1`}>
            {statusIcon[order.status] || null}
            {order.status}
          </Badge>
        </td>
      </tr>
      <AnimatePresence>
        {isExpanded && (
          <tr>
            <td colSpan={7} className="p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="bg-muted/20 border-b border-border px-4 py-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Kategori</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Beställt</th>
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
