import { motion } from "framer-motion";
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Truck,
  Store,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProducts } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(210, 60%, 55%)",
  "hsl(340, 60%, 55%)",
  "hsl(160, 50%, 45%)",
];

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-heading font-bold text-foreground">{value}</p>
            {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="h-4.5 w-4.5 text-primary" />
            </div>
            {trend && (
              <div className={`flex items-center gap-0.5 text-[10px] font-medium ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
                {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend.value}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OrganisationOverview() {
  const { data: products = [] } = useProducts();
  const { data: stores = [] } = useStores(true);
  const { data: allCustomers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();

  // Delivery notes (outgoing to shops = sales)
  const { data: deliveryNotes = [] } = useQuery({
    queryKey: ["delivery-notes-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_notes")
        .select("*, stores(name), delivery_note_lines(quantity, wholesale_price, total)")
        .order("delivery_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Incoming deliveries (purchases from suppliers)
  const { data: incomingDeliveries = [] } = useQuery({
    queryKey: ["incoming-deliveries-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_deliveries")
        .select("*, suppliers(name), incoming_delivery_lines(quantity, unit_cost, total_cost)")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Shop orders
  const { data: shopOrders = [] } = useQuery({
    queryKey: ["shop-orders-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // --- Computed KPIs ---
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock * p.cost_price), 0);
  const totalInventoryWholesale = products.reduce((sum, p) => sum + (p.stock * p.wholesale_price), 0);
  const totalStock = products.reduce((sum, p) => sum + p.stock, 0);
  const activeProducts = products.filter(p => p.active).length;

  const totalSales = deliveryNotes.reduce((sum, dn) => sum + (dn.total_amount || 0), 0);
  const totalPurchases = incomingDeliveries.reduce((sum, d) => sum + (d.total_cost || 0), 0);
  const grossMargin = totalSales > 0 ? ((totalSales - totalPurchases) / totalSales * 100).toFixed(1) : "0";

  // --- Sales by store chart ---
  const salesByStore: Record<string, number> = {};
  deliveryNotes.forEach((dn: any) => {
    const storeName = dn.stores?.name || "Okänd";
    salesByStore[storeName] = (salesByStore[storeName] || 0) + (dn.total_amount || 0);
  });
  const salesByStoreData = Object.entries(salesByStore).map(([name, value]) => ({ name, value: Math.round(value) }));

  // --- Inventory by category chart ---
  const invByCategory: Record<string, number> = {};
  products.forEach(p => {
    invByCategory[p.category] = (invByCategory[p.category] || 0) + p.stock;
  });
  const inventoryByCategoryData = Object.entries(invByCategory)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // --- Orders by status ---
  const ordersByStatus: Record<string, number> = {};
  shopOrders.forEach((o: any) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  });
  const orderStatusData = Object.entries(ordersByStatus).map(([name, value]) => ({ name, value }));

  // --- Recent deliveries ---
  const recentDeliveries = deliveryNotes.slice(0, 5);
  const recentPurchases = incomingDeliveries.slice(0, 5);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Organisationsöversikt
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Samlad vy över alla butiker — försäljning, lager, inköp och beställningar.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Total försäljning"
          value={`${totalSales.toLocaleString("sv-SE")} kr`}
          subtitle="Alla följesedlar"
          icon={DollarSign}
          trend={{ value: `${grossMargin}% bruttomarginal`, positive: Number(grossMargin) > 0 }}
        />
        <KpiCard
          title="Lagervärde (kostnad)"
          value={`${totalInventoryValue.toLocaleString("sv-SE")} kr`}
          subtitle={`${totalStock.toLocaleString("sv-SE")} kg i lager`}
          icon={Package}
        />
        <KpiCard
          title="Totala inköp"
          value={`${totalPurchases.toLocaleString("sv-SE")} kr`}
          subtitle={`${incomingDeliveries.length} leveranser`}
          icon={Truck}
        />
        <KpiCard
          title="Butiker / Produkter"
          value={`${stores.length} / ${activeProducts}`}
          subtitle={`${suppliers.length} leverantörer`}
          icon={Store}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sales by Store */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Försäljning per butik</CardTitle>
          </CardHeader>
          <CardContent>
            {salesByStoreData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Ingen försäljningsdata ännu.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={salesByStoreData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "11px",
                    }}
                    formatter={(value: number) => [`${value.toLocaleString("sv-SE")} kr`, "Försäljning"]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Inventory by Category */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Lager per kategori (kg)</CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryByCategoryData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Ingen lagerdata ännu.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={inventoryByCategoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {inventoryByCategoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [`${value} kg`, "Lagersaldo"]} />
                  <Legend wrapperStyle={{ fontSize: "10px" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row: Orders + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Order status */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-1.5">
              <ShoppingCart className="h-4 w-4 text-primary" /> Beställningar per status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {orderStatusData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Inga beställningar.</p>
            ) : (
              <div className="space-y-2">
                {orderStatusData.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-xs text-foreground">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent outgoing deliveries */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" /> Senaste leveranser (utgående)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentDeliveries.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Inga leveranser ännu.</p>
            ) : (
              <div className="space-y-2">
                {recentDeliveries.map((dn: any) => (
                  <div key={dn.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-foreground">{dn.stores?.name || "–"}</p>
                      <p className="text-[10px] text-muted-foreground">{dn.note_number} · {dn.delivery_date}</p>
                    </div>
                    <span className="text-xs font-bold text-foreground">{(dn.total_amount || 0).toLocaleString("sv-SE")} kr</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent purchases */}
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-primary" /> Senaste inköp (inkommande)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPurchases.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Inga inköp ännu.</p>
            ) : (
              <div className="space-y-2">
                {recentPurchases.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-foreground">{d.suppliers?.name || "–"}</p>
                      <p className="text-[10px] text-muted-foreground">{d.delivery_number} · {d.received_date}</p>
                    </div>
                    <span className="text-xs font-bold text-foreground">{(d.total_cost || 0).toLocaleString("sv-SE")} kr</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </motion.div>
  );
}
