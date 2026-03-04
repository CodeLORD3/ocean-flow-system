import { motion } from "framer-motion";
import { Fish, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const kpis = [
  { label: "Total Inventory", value: "12,450 kg", change: "+8.2%", icon: Fish, trend: "up" },
  { label: "Active Orders", value: "184", change: "+12.5%", icon: ShoppingCart, trend: "up" },
  { label: "Monthly Revenue", value: "$284,320", change: "+15.3%", icon: DollarSign, trend: "up" },
  { label: "Low Stock Alerts", value: "7", change: "-2", icon: AlertTriangle, trend: "down" },
];

const revenueData = [
  { month: "Jan", revenue: 186000, orders: 120 },
  { month: "Feb", revenue: 205000, orders: 135 },
  { month: "Mar", revenue: 198000, orders: 128 },
  { month: "Apr", revenue: 245000, orders: 156 },
  { month: "May", revenue: 262000, orders: 168 },
  { month: "Jun", revenue: 284000, orders: 184 },
];

const inventoryByCategory = [
  { name: "Salmon", stock: 3200 },
  { name: "Tuna", stock: 2800 },
  { name: "Shrimp", stock: 2100 },
  { name: "Cod", stock: 1800 },
  { name: "Lobster", stock: 1500 },
  { name: "Crab", stock: 1050 },
];

const recentOrders = [
  { id: "ORD-2847", customer: "Pacific Fresh Co.", items: "Salmon, Tuna", total: "$12,450", status: "Processing" },
  { id: "ORD-2846", customer: "Harbor Bistro", items: "Lobster, Crab", total: "$8,200", status: "Shipped" },
  { id: "ORD-2845", customer: "Ocean Delights", items: "Shrimp, Cod", total: "$5,680", status: "Delivered" },
  { id: "ORD-2844", customer: "Bay View Restaurant", items: "Tuna, Shrimp", total: "$9,340", status: "Processing" },
  { id: "ORD-2843", customer: "Coastal Catering", items: "Salmon", total: "$4,120", status: "Delivered" },
];

const statusColor: Record<string, string> = {
  Processing: "bg-warning/15 text-warning border-warning/20",
  Shipped: "bg-primary/10 text-primary border-primary/20",
  Delivered: "bg-success/15 text-success border-success/20",
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Dashboard() {
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <motion.div key={kpi.label} variants={fadeUp}>
            <Card className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                    <p className="mt-1 text-2xl font-heading font-bold text-foreground">{kpi.value}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <kpi.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <p className={`mt-2 text-xs font-medium ${kpi.trend === "up" ? "text-success" : "text-destructive"}`}>
                  {kpi.change} from last month
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={fadeUp} className="lg:col-span-2">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">Revenue Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(205 78% 28%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(205 78% 28%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="hsl(215 15% 50%)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(215 15% 50%)" tickFormatter={(v) => `$${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]} />
                    <Area type="monotone" dataKey="revenue" stroke="hsl(205 78% 28%)" fill="url(#revGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeUp}>
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading">Stock by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={inventoryByCategory} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(215 15% 50%)" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(215 15% 50%)" width={60} />
                    <Tooltip />
                    <Bar dataKey="stock" fill="hsl(172 55% 40%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Orders */}
      <motion.div variants={fadeUp}>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-heading">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left font-medium text-muted-foreground">Order ID</th>
                    <th className="pb-3 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="pb-3 text-left font-medium text-muted-foreground">Items</th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">Total</th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium text-foreground">{order.id}</td>
                      <td className="py-3 text-foreground">{order.customer}</td>
                      <td className="py-3 text-muted-foreground">{order.items}</td>
                      <td className="py-3 text-right font-medium text-foreground">{order.total}</td>
                      <td className="py-3 text-right">
                        <Badge variant="outline" className={statusColor[order.status]}>
                          {order.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
