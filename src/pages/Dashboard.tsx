import { motion } from "framer-motion";
import {
  Fish, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, Store,
  ArrowUpRight, ArrowDownRight, Package, Users, Clock, Truck, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useProducts } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(210, 60%, 55%)",
  "hsl(340, 60%, 55%)",
  "hsl(160, 50%, 45%)",
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

const statusColor: Record<string, string> = {
  Ny: "",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Skickad: "bg-primary/15 text-primary border-primary/20",
  Levererad: "bg-emerald-500/15 text-emerald-600 border-emerald-500/20",
  Packad: "bg-success/15 text-success border-success/20",
};

export default function Dashboard() {
  const { data: products = [] } = useProducts();
  const { data: stores = [] } = useStores(true);
  const { data: allCustomers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();

  const { data: deliveryNotes = [] } = useQuery({
    queryKey: ["delivery-notes-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_notes")
        .select("*, stores(name)")
        .order("delivery_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: incomingDeliveries = [] } = useQuery({
    queryKey: ["incoming-deliveries-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_deliveries")
        .select("*, suppliers(name)")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: shopOrders = [] } = useQuery({
    queryKey: ["shop-orders-dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // --- KPIs ---
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock * p.cost_price), 0);
  const activeProducts = products.filter(p => p.active).length;
  const totalSales = deliveryNotes.reduce((sum, dn) => sum + (dn.total_amount || 0), 0);
  const totalPurchases = incomingDeliveries.reduce((sum, d) => sum + (d.total_cost || 0), 0);
  const lowStockProducts = products.filter(p => p.active && p.stock <= 10);
  const categories = [...new Set(products.map(p => p.category))];

  // --- Sales by store ---
  const salesByStore: Record<string, number> = {};
  deliveryNotes.forEach((dn: any) => {
    const name = dn.stores?.name || "Okänd";
    salesByStore[name] = (salesByStore[name] || 0) + (dn.total_amount || 0);
  });
  const salesByStoreData = Object.entries(salesByStore)
    .map(([name, value]) => ({ name, revenue: Math.round(value) }))
    .sort((a, b) => b.revenue - a.revenue);

  // --- Inventory by category ---
  const invByCategory: Record<string, number> = {};
  products.forEach(p => {
    invByCategory[p.category] = (invByCategory[p.category] || 0) + p.stock;
  });
  const categoryData = Object.entries(invByCategory)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // --- Recent deliveries ---
  const recentDeliveries = deliveryNotes.slice(0, 5);
  const recentPurchases = incomingDeliveries.slice(0, 5);
  const recentOrders = shopOrders.slice(0, 5);

  const kpis = [
    { label: "Totalt lager", value: `${totalStock.toLocaleString("sv-SE")} kg`, icon: Fish, detail: `${categories.length} kategorier` },
    { label: "Aktiva produkter", value: `${activeProducts}`, icon: Package, detail: `av ${products.length} totalt` },
    { label: "Total försäljning", value: `${totalSales.toLocaleString("sv-SE")} kr`, icon: DollarSign, detail: `${deliveryNotes.length} följesedlar` },
    { label: "Lagervärde", value: `${totalInventoryValue.toLocaleString("sv-SE")} kr`, icon: TrendingUp, detail: "Kostnadsvärde" },
    { label: "Totala inköp", value: `${totalPurchases.toLocaleString("sv-SE")} kr`, icon: Truck, detail: `${incomingDeliveries.length} leveranser` },
    { label: "Butiker", value: `${stores.length}`, icon: Store, detail: `${suppliers.length} leverantörer` },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi) => (
          <motion.div key={kpi.label} variants={fadeUp}>
            <Card className="shadow-card hover:shadow-card-hover transition-shadow h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
                    <kpi.icon className="h-4 w-4 text-primary" />
                  </div>
                </div>
                <p className="text-lg font-heading font-bold text-foreground leading-tight">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
                <p className="text-[9px] text-muted-foreground/70 mt-1">{kpi.detail}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        <motion.div variants={fadeUp} className="xl:col-span-3 space-y-4">
          {/* Sales by store bar chart */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Försäljning per butik</CardTitle>
              <CardDescription className="text-xs">Baserat på följesedlar</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                {salesByStoreData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-16">Ingen försäljningsdata ännu.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={salesByStoreData} layout="vertical" barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" width={100} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString("sv-SE")} kr`, "Försäljning"]} />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Category pie chart */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Lager per kategori (kg)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                {categoryData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-16">Ingen lagerdata ännu.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}`}>
                        {categoryData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v} kg`, "Lagersaldo"]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Right sidebar */}
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Low stock alerts */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Lagervarningar
                </CardTitle>
                {lowStockProducts.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{lowStockProducts.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStockProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Inga lagervarningar.</p>
              ) : (
                lowStockProducts.slice(0, 5).map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                    <div>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">{p.stock} {p.unit} i lager</p>
                    </div>
                    <Badge variant="outline" className={
                      p.stock <= 0 ? "bg-destructive/10 text-destructive border-destructive/20 text-[10px]" :
                      "bg-warning/15 text-warning border-warning/20 text-[10px]"
                    }>
                      {p.stock <= 0 ? "Slut" : "Lågt"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent purchases */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                <Truck className="h-4 w-4 text-muted-foreground" />
                Senaste inköp
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentPurchases.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Inga inköp ännu.</p>
              ) : (
                <div className="space-y-2">
                  {recentPurchases.map((d: any) => (
                    <div key={d.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground font-medium">{d.suppliers?.name || "–"}</p>
                        <p className="text-[10px] text-muted-foreground">{d.delivery_number} · {d.received_date}</p>
                      </div>
                      <span className="text-xs font-bold text-foreground shrink-0">{(d.total_cost || 0).toLocaleString("sv-SE")} kr</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Orders */}
      <motion.div variants={fadeUp}>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Senaste beställningar</CardTitle>
            <CardDescription className="text-xs">De {recentOrders.length} senaste butikbeställningarna</CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Inga beställningar ännu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order: any) => (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-medium text-foreground">{order.stores?.name || "–"}</td>
                        <td className="py-2.5 text-muted-foreground">{order.order_week}</td>
                        <td className="py-2.5 text-muted-foreground">{order.created_at ? new Date(order.created_at).toLocaleDateString("sv-SE") : "–"}</td>
                        <td className="py-2.5 text-right">
                          <Badge variant="outline" className={`${statusColor[order.status] || "bg-muted text-muted-foreground"} text-[10px]`}>
                            {order.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
