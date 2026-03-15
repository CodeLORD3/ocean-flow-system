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
import { useSite } from "@/contexts/SiteContext";
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
  const { site, activeStoreId, activeStoreName } = useSite();
  const isShop = site === "shop" && !!activeStoreId;

  const { data: products = [] } = useProducts();
  const { data: stores = [] } = useStores(true);
  const { data: allCustomers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();

  // Shop-specific: get storage locations for this store
  const { data: shopLocations = [] } = useQuery({
    queryKey: ["shop-storage-locations", activeStoreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id, name, zone")
        .eq("store_id", activeStoreId!);
      if (error) throw error;
      return data;
    },
    enabled: isShop,
  });

  // Shop-specific: stock from product_stock_locations for this store's locations
  const shopLocationIds = shopLocations.map((l) => l.id);
  const { data: shopStock = [] } = useQuery({
    queryKey: ["shop-stock-locations", shopLocationIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("product_id, quantity, unit_cost, location_id")
        .in("location_id", shopLocationIds);
      if (error) throw error;
      return data;
    },
    enabled: isShop && shopLocationIds.length > 0,
  });

  // Shop orders filtered by store
  const { data: shopOrders = [] } = useQuery({
    queryKey: ["shop-orders-dashboard", activeStoreId],
    queryFn: async () => {
      let q = supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(quantity_ordered, quantity_delivered, unit, product_id, products(name, wholesale_price, cost_price, category))")
        .order("created_at", { ascending: false });
      if (isShop) q = q.eq("store_id", activeStoreId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Delivery notes filtered by store
  const { data: deliveryNotes = [] } = useQuery({
    queryKey: ["delivery-notes-dashboard", activeStoreId],
    queryFn: async () => {
      let q = supabase
        .from("delivery_notes")
        .select("*, stores(name), delivery_note_lines(quantity, wholesale_price, total)")
        .order("delivery_date", { ascending: false });
      if (isShop) q = q.eq("store_id", activeStoreId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Incoming deliveries (only for wholesale/production, not relevant per shop)
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
    enabled: !isShop,
  });

  // --- KPIs ---
  let totalStock: number;
  let totalInventoryValue: number;
  let lowStockItems: { name: string; stock: number; unit: string }[] = [];

  if (isShop) {
    // Aggregate stock from product_stock_locations for this shop
    const stockByProduct: Record<string, number> = {};
    const valueByProduct: Record<string, number> = {};
    shopStock.forEach((sl) => {
      stockByProduct[sl.product_id] = (stockByProduct[sl.product_id] || 0) + sl.quantity;
      const product = products.find((p) => p.id === sl.product_id);
      const unitCost = sl.unit_cost ?? product?.cost_price ?? 0;
      valueByProduct[sl.product_id] = (valueByProduct[sl.product_id] || 0) + sl.quantity * unitCost;
    });
    totalStock = Object.values(stockByProduct).reduce((s, v) => s + v, 0);
    totalInventoryValue = Object.values(valueByProduct).reduce((s, v) => s + v, 0);
    lowStockItems = Object.entries(stockByProduct)
      .filter(([, qty]) => qty <= 10)
      .map(([pid, qty]) => {
        const p = products.find((pr) => pr.id === pid);
        return { name: p?.name || "Okänd", stock: qty, unit: p?.unit || "kg" };
      })
      .filter((item) => products.find((p) => p.name === item.name)?.active);
  } else {
    totalStock = products.reduce((sum, p) => sum + p.stock, 0);
    totalInventoryValue = products.reduce((sum, p) => sum + p.stock * p.cost_price, 0);
    lowStockItems = products
      .filter((p) => p.active && p.stock <= 10)
      .map((p) => ({ name: p.name, stock: p.stock, unit: p.unit }));
  }

  const activeProducts = products.filter((p) => p.active).length;
  const categories = [...new Set(products.map((p) => p.category))];

  // Sales from delivery notes
  const totalSales = deliveryNotes.reduce((sum, dn: any) => {
    const lines = dn.delivery_note_lines || [];
    return sum + lines.reduce((ls: number, l: any) => ls + (l.total || 0), 0);
  }, 0);

  // Orders value (delivered)
  const totalOrderValue = shopOrders.reduce((sum, o: any) => {
    const lines = o.shop_order_lines || [];
    return sum + lines.reduce((ls: number, l: any) => {
      return ls + (l.quantity_delivered || 0) * (l.products?.wholesale_price || 0);
    }, 0);
  }, 0);

  const totalPurchases = incomingDeliveries.reduce((sum, d) => sum + ((d as any).total_cost || 0), 0);

  // --- Sales by store (wholesale only) ---
  const salesByStore: Record<string, number> = {};
  if (!isShop) {
    deliveryNotes.forEach((dn: any) => {
      const name = dn.stores?.name || "Okänd";
      const lineTotal = (dn.delivery_note_lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0);
      salesByStore[name] = (salesByStore[name] || 0) + lineTotal;
    });
  }
  const salesByStoreData = Object.entries(salesByStore)
    .map(([name, value]) => ({ name, revenue: Math.round(value) }))
    .sort((a, b) => b.revenue - a.revenue);

  // --- Inventory by category ---
  let categoryData: { name: string; value: number }[] = [];
  if (isShop) {
    const catMap: Record<string, number> = {};
    shopStock.forEach((sl) => {
      const p = products.find((pr) => pr.id === sl.product_id);
      if (p) catMap[p.category] = (catMap[p.category] || 0) + sl.quantity;
    });
    categoryData = Object.entries(catMap)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  } else {
    const invByCategory: Record<string, number> = {};
    products.forEach((p) => {
      invByCategory[p.category] = (invByCategory[p.category] || 0) + p.stock;
    });
    categoryData = Object.entries(invByCategory)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }

  const recentDeliveries = deliveryNotes.slice(0, 5);
  const recentPurchases = incomingDeliveries.slice(0, 5);
  const recentOrders = shopOrders.slice(0, 5);

  const kpis = isShop
    ? [
        { label: "Lagersaldo", value: `${totalStock.toLocaleString("sv-SE")} kg`, icon: Fish, detail: `${activeStoreName}` },
        { label: "Lagervärde", value: `${totalInventoryValue.toLocaleString("sv-SE")} kr`, icon: TrendingUp, detail: "Kostnadsvärde" },
        { label: "Ordervärde (levererat)", value: `${totalOrderValue.toLocaleString("sv-SE")} kr`, icon: DollarSign, detail: `${shopOrders.length} ordrar` },
        { label: "Följesedlar", value: `${deliveryNotes.length}`, icon: Truck, detail: `${totalSales.toLocaleString("sv-SE")} kr totalt` },
        { label: "Aktiva produkter", value: `${activeProducts}`, icon: Package, detail: `av ${products.length} totalt` },
        { label: "Lagervarningar", value: `${lowStockItems.length}`, icon: AlertTriangle, detail: lowStockItems.length > 0 ? "Produkter med lågt lager" : "Inga varningar" },
      ]
    : [
        { label: "Totalt lager", value: `${totalStock.toLocaleString("sv-SE")} kg`, icon: Fish, detail: `${categories.length} kategorier` },
        { label: "Aktiva produkter", value: `${activeProducts}`, icon: Package, detail: `av ${products.length} totalt` },
        { label: "Total försäljning", value: `${totalSales.toLocaleString("sv-SE")} kr`, icon: DollarSign, detail: `${deliveryNotes.length} följesedlar` },
        { label: "Lagervärde", value: `${totalInventoryValue.toLocaleString("sv-SE")} kr`, icon: TrendingUp, detail: "Kostnadsvärde" },
        { label: "Totala inköp", value: `${totalPurchases.toLocaleString("sv-SE")} kr`, icon: Truck, detail: `${incomingDeliveries.length} leveranser` },
        { label: "Butiker", value: `${stores.length}`, icon: Store, detail: `${suppliers.length} leverantörer` },
      ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
      {/* Title for shop */}
      {isShop && (
        <motion.div variants={fadeUp}>
          <h1 className="text-lg font-heading font-bold text-foreground">{activeStoreName} — Översikt</h1>
        </motion.div>
      )}

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
          {/* Sales by store (wholesale) or Order history (shop) */}
          {!isShop && (
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
          )}

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
                {lowStockItems.length > 0 && (
                  <Badge variant="destructive" className="text-[10px]">{lowStockItems.length}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStockItems.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">Inga lagervarningar.</p>
              ) : (
                lowStockItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                    <div>
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">{item.stock} {item.unit} i lager</p>
                    </div>
                    <Badge variant="outline" className={
                      item.stock <= 0 ? "bg-destructive/10 text-destructive border-destructive/20 text-[10px]" :
                      "bg-warning/15 text-warning border-warning/20 text-[10px]"
                    }>
                      {item.stock <= 0 ? "Slut" : "Lågt"}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent purchases (wholesale only) */}
          {!isShop && (
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
          )}

          {/* Recent deliveries (shop) */}
          {isShop && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  Senaste följesedlar
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentDeliveries.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Inga följesedlar ännu.</p>
                ) : (
                  <div className="space-y-2">
                    {recentDeliveries.map((dn: any) => (
                      <div key={dn.id} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground font-medium">{dn.note_number}</p>
                          <p className="text-[10px] text-muted-foreground">{dn.delivery_date} · {dn.status}</p>
                        </div>
                        <span className="text-xs font-bold text-foreground shrink-0">{(dn.total_amount || 0).toLocaleString("sv-SE")} kr</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* Recent Orders */}
      <motion.div variants={fadeUp}>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Senaste beställningar</CardTitle>
            <CardDescription className="text-xs">
              {isShop ? `Beställningar från ${activeStoreName}` : `De ${recentOrders.length} senaste butikbeställningarna`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentOrders.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Inga beställningar ännu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {!isShop && <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>}
                      <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Leveransdatum</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Packare</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order: any) => (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        {!isShop && <td className="py-2.5 font-medium text-foreground">{order.stores?.name || "–"}</td>}
                        <td className="py-2.5 text-muted-foreground">{order.order_week}</td>
                        <td className="py-2.5 text-muted-foreground">{order.desired_delivery_date || "–"}</td>
                        <td className="py-2.5 text-muted-foreground">{order.packer_name || "–"}</td>
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
