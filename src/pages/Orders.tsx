import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Search, Plus, ShoppingCart, Clock, CheckCircle2, Truck, XCircle, Package } from "lucide-react";
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
import { format } from "date-fns";

const statusColor: Record<string, string> = {
  Ny: "bg-muted text-muted-foreground border-border",
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-accent/15 text-accent-foreground border-accent/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  "Klar / Levererad": "bg-success/15 text-success border-success/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3.5 w-3.5" />,
  Behandlas: <Clock className="h-3.5 w-3.5" />,
  Packad: <Package className="h-3.5 w-3.5" />,
  Skickad: <Truck className="h-3.5 w-3.5" />,
  "Klar / Levererad": <CheckCircle2 className="h-3.5 w-3.5" />,
  Levererad: <CheckCircle2 className="h-3.5 w-3.5" />,
  Avbruten: <XCircle className="h-3.5 w-3.5" />,
};

export default function Orders() {
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("Alla butiker");
  const [statusFilterVal, setStatusFilterVal] = useState("Alla");

  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const queryClient = useQueryClient();
  const syncRan = useRef(false);

  // On mount, sync order statuses with current Grossist Flytande stock
  useEffect(() => {
    if (syncRan.current) return;
    syncRan.current = true;
    syncBehandlasFromStock().then(() => {
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
    });
  }, []);

  const storeOptions = ["Alla butiker", ...stores.map((s: any) => s.name)];
  const statusOptions = ["Alla", "Ny", "Behandlas", "Packad", "Skickad", "Klar / Levererad"];

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
  const pending = orders.filter((o: any) => o.status === "Behandlas").length;
  const packed = orders.filter((o: any) => o.status === "Packad").length;
  const delivered = orders.filter((o: any) => o.status === "Klar / Levererad" || o.status === "Levererad").length;

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
                    <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Önskat leveransdatum</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Skapad</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Artiklar</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Produkter</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order: any) => {
                    const lines = order.shop_order_lines || [];
                    const productSummary = lines
                      .slice(0, 3)
                      .map((l: any) => `${l.products?.name || "?"} (${l.quantity_ordered}${l.unit || "kg"})`)
                      .join(", ");
                    const extra = lines.length > 3 ? ` +${lines.length - 3}` : "";

                    return (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors h-9">
                        <td className="px-2 py-1 font-medium text-foreground">{order.stores?.name || "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground">{order.order_week}</td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {order.desired_delivery_date ? format(new Date(order.desired_delivery_date), "yyyy-MM-dd") : "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {order.created_at ? format(new Date(order.created_at), "yyyy-MM-dd HH:mm") : "—"}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground">{lines.length}</td>
                        <td className="px-2 py-1 text-muted-foreground max-w-48 truncate text-[10px]">
                          {productSummary}{extra}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1`}>
                            {statusIcon[order.status] || null}
                            {order.status}
                          </Badge>
                        </td>
                      </tr>
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
