import { motion } from "framer-motion";
import { Fish, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, Store } from "lucide-react";
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
  { label: "Totalt lager", value: "8 240 kg", change: "+8,2%", icon: Fish, trend: "up" as const },
  { label: "Aktiva beställningar", value: "67", change: "+12,5%", icon: ShoppingCart, trend: "up" as const },
  { label: "Månadsintäkt", value: "1 284 320 kr", change: "+15,3%", icon: DollarSign, trend: "up" as const },
  { label: "Lågt lager-varningar", value: "4", change: "-2", icon: AlertTriangle, trend: "down" as const },
];

const revenueData = [
  { month: "Jan", revenue: 986000, orders: 120 },
  { month: "Feb", revenue: 1105000, orders: 135 },
  { month: "Mar", revenue: 1048000, orders: 128 },
  { month: "Apr", revenue: 1245000, orders: 156 },
  { month: "Maj", revenue: 1162000, orders: 168 },
  { month: "Jun", revenue: 1284000, orders: 184 },
];

const storePerformance = [
  { name: "Stockholm Östermalm", revenue: 320000 },
  { name: "Stockholm Södermalm", revenue: 275000 },
  { name: "Göteborg Haga", revenue: 248000 },
  { name: "Göteborg Linné", revenue: 195000 },
  { name: "Göteborg Majorna", revenue: 142000 },
  { name: "Zürich", revenue: 104000 },
];

const recentOrders = [
  { id: "ORD-2847", store: "Stockholm Östermalm", items: "Lax, Torsk", total: "12 450 kr", status: "Behandlas" },
  { id: "ORD-2846", store: "Göteborg Haga", items: "Hummer, Krabba", total: "8 200 kr", status: "Levererad" },
  { id: "ORD-2845", store: "Zürich", items: "Räkor, Torsk", total: "5 680 kr", status: "Skickad" },
  { id: "ORD-2844", store: "Stockholm Södermalm", items: "Tonfisk, Räkor", total: "9 340 kr", status: "Behandlas" },
  { id: "ORD-2843", store: "Göteborg Linné", items: "Lax", total: "4 120 kr", status: "Levererad" },
];

const statusColor: Record<string, string> = {
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
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
      <div>
        <h2 className="text-2xl font-heading font-bold text-foreground">Översikt</h2>
        <p className="text-sm text-muted-foreground">6 butiker — Stockholm · Göteborg · Zürich</p>
      </div>

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
                  {kpi.change} jämfört med förra månaden
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
              <CardTitle className="text-base font-heading">Intäkter per månad</CardTitle>
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
                    <YAxis tick={{ fontSize: 12 }} stroke="hsl(215 15% 50%)" tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("sv-SE")} kr`, "Intäkt"]} />
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
              <CardTitle className="text-base font-heading">Intäkt per butik</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={storePerformance} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                    <XAxis type="number" tick={{ fontSize: 10 }} stroke="hsl(215 15% 50%)" tickFormatter={(v) => `${v / 1000}k`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} stroke="hsl(215 15% 50%)" width={110} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("sv-SE")} kr`, "Intäkt"]} />
                    <Bar dataKey="revenue" fill="hsl(172 55% 40%)" radius={[0, 4, 4, 0]} />
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
            <CardTitle className="text-base font-heading">Senaste beställningar</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-3 text-left font-medium text-muted-foreground">Order-ID</th>
                    <th className="pb-3 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-3 text-left font-medium text-muted-foreground">Produkter</th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">Totalt</th>
                    <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 font-medium text-foreground">{order.id}</td>
                      <td className="py-3 text-foreground">{order.store}</td>
                      <td className="py-3 text-muted-foreground">{order.items}</td>
                      <td className="py-3 text-right font-medium text-foreground">{order.total}</td>
                      <td className="py-3 text-right">
                        <Badge variant="outline" className={statusColor[order.status]}>{order.status}</Badge>
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
