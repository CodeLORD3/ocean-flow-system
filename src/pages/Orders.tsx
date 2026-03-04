import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Filter, ShoppingCart, Clock, CheckCircle2, Truck, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ordersData = [
  { id: "ORD-2847", store: "Stockholm Östermalm", date: "2026-03-04", time: "09:15", items: 4, products: "Lax (200kg), Torsk (100kg), Räkor (50kg), Sill (80kg)", total: 12450, status: "Behandlas", payment: "Faktura 30d", customer: "Restaurang Sjöstaden", delivery: "2026-03-05" },
  { id: "ORD-2846", store: "Göteborg Haga", date: "2026-03-03", time: "14:22", items: 2, products: "Hummer (50kg), Kungskrabba (30kg)", total: 8200, status: "Skickad", payment: "Förskott", customer: "Hotel Gothia", delivery: "2026-03-04" },
  { id: "ORD-2845", store: "Zürich", date: "2026-03-03", time: "08:45", items: 3, products: "Räkor (80kg), Torsk (60kg), Tonfisk (40kg)", total: 5680, status: "Levererad", payment: "Faktura 15d", customer: "Zürich Seafood Bar", delivery: "2026-03-03" },
  { id: "ORD-2844", store: "Stockholm Södermalm", date: "2026-03-02", time: "16:30", items: 5, products: "Tonfisk (120kg), Räkor (90kg), Lax (60kg), Sill (200kg), Rödspätta (40kg)", total: 9340, status: "Behandlas", payment: "Faktura 30d", customer: "ICA Söder", delivery: "2026-03-04" },
  { id: "ORD-2843", store: "Göteborg Linné", date: "2026-03-02", time: "11:10", items: 1, products: "Lax (75kg)", total: 4120, status: "Levererad", payment: "Kontant", customer: "Fiskekrogen", delivery: "2026-03-02" },
  { id: "ORD-2842", store: "Göteborg Majorna", date: "2026-03-01", time: "13:45", items: 6, products: "Sill (500kg), Räkor (200kg), Torsk (150kg), Rödspätta (80kg), Lax (100kg), Hummer (20kg)", total: 15600, status: "Skickad", payment: "Faktura 30d", customer: "Coop Majorna", delivery: "2026-03-03" },
  { id: "ORD-2841", store: "Stockholm Östermalm", date: "2026-03-01", time: "09:30", items: 3, products: "Lax (100kg), Tonfisk (50kg), Hummer (25kg)", total: 7890, status: "Levererad", payment: "Faktura 30d", customer: "NK Saluhall", delivery: "2026-03-01" },
  { id: "ORD-2840", store: "Zürich", date: "2026-02-28", time: "15:00", items: 2, products: "Torsk (100kg), Räkor (60kg)", total: 3200, status: "Avbruten", payment: "—", customer: "Baur au Lac", delivery: "—" },
];

const statusColor: Record<string, string> = {
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  Behandlas: <Clock className="h-3.5 w-3.5" />,
  Skickad: <Truck className="h-3.5 w-3.5" />,
  Levererad: <CheckCircle2 className="h-3.5 w-3.5" />,
  Avbruten: <XCircle className="h-3.5 w-3.5" />,
};

const storeFilter = ["Alla butiker", "Stockholm Östermalm", "Stockholm Södermalm", "Göteborg Haga", "Göteborg Linné", "Göteborg Majorna", "Zürich"];
const statusFilter = ["Alla", "Behandlas", "Skickad", "Levererad", "Avbruten"];

export default function Orders() {
  const [search, setSearch] = useState("");
  const [store, setStore] = useState("Alla butiker");
  const [status, setStatus] = useState("Alla");

  const filtered = ordersData.filter((o) => {
    const matchSearch = o.id.toLowerCase().includes(search.toLowerCase()) || o.customer.toLowerCase().includes(search.toLowerCase());
    const matchStore = store === "Alla butiker" || o.store === store;
    const matchStatus = status === "Alla" || o.status === status;
    return matchSearch && matchStore && matchStatus;
  });

  const totalOrders = ordersData.length;
  const pending = ordersData.filter(o => o.status === "Behandlas").length;
  const shipped = ordersData.filter(o => o.status === "Skickad").length;
  const totalValue = ordersData.reduce((s, o) => s + o.total, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Beställningshantering</h2>
          <p className="text-xs text-muted-foreground">Skapa, spåra och hantera beställningar för alla butiker</p>
        </div>
        <Button size="sm" className="gap-1.5 text-xs h-8">
          <Plus className="h-3 w-3" /> Ny beställning
        </Button>
      </div>

      {/* Status pipeline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Behandlas", count: pending, icon: Clock, color: "text-warning" },
          { label: "Skickade", count: shipped, icon: Truck, color: "text-primary" },
          { label: "Levererade", count: ordersData.filter(o => o.status === "Levererad").length, icon: CheckCircle2, color: "text-success" },
          { label: "Totalt värde", count: `${totalValue.toLocaleString("sv-SE")} kr`, icon: ShoppingCart, color: "text-foreground" },
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
              <Input placeholder="Sök order-ID eller kund..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={store} onValueChange={setStore}>
              <SelectTrigger className="w-48 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {storeFilter.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilter.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Order-ID</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Kund</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Produkter</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Artiklar</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Betalning</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Leverans</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Totalt</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 font-medium text-foreground font-mono">{order.id}</td>
                    <td className="py-2 text-foreground">{order.customer}</td>
                    <td className="py-2 text-muted-foreground">{order.store}</td>
                    <td className="py-2 text-muted-foreground">{order.date} {order.time}</td>
                    <td className="py-2 text-muted-foreground max-w-48 truncate text-[10px]">{order.products}</td>
                    <td className="py-2 text-right text-foreground">{order.items}</td>
                    <td className="py-2 text-right text-muted-foreground text-[10px]">{order.payment}</td>
                    <td className="py-2 text-muted-foreground">{order.delivery}</td>
                    <td className="py-2 text-right font-medium text-foreground">{order.total.toLocaleString("sv-SE")} kr</td>
                    <td className="py-2 text-right">
                      <Badge variant="outline" className={`${statusColor[order.status]} text-[10px] gap-1`}>
                        {statusIcon[order.status]}
                        {order.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
            <span>Visar {filtered.length} av {ordersData.length} beställningar</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2">← Föregående</Button>
              <span>Sida 1 av 1</span>
              <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2">Nästa →</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
