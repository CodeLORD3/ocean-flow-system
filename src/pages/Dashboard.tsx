import { motion } from "framer-motion";
import {
  Fish, ShoppingCart, DollarSign, TrendingUp, AlertTriangle, Store,
  ArrowUpRight, ArrowDownRight, Package, Users, Clock, CheckCircle2,
  XCircle, Truck, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";

const kpis = [
  { label: "Totalt lager", value: "8 240 kg", change: "+8,2%", icon: Fish, trend: "up" as const, detail: "12 produktkategorier" },
  { label: "Aktiva beställningar", value: "67", change: "+12,5%", icon: ShoppingCart, trend: "up" as const, detail: "18 behandlas, 32 skickade" },
  { label: "Månadsintäkt", value: "1 284 320 kr", change: "+15,3%", icon: DollarSign, trend: "up" as const, detail: "Budget: 1 200 000 kr" },
  { label: "Lågt lager-varningar", value: "4", change: "-2", icon: AlertTriangle, trend: "down" as const, detail: "2 kritiska, 2 varning" },
  { label: "Leveransprecision", value: "94,2%", change: "+1,8%", icon: Truck, trend: "up" as const, detail: "Mål: 95%" },
  { label: "Antal kunder", value: "1 842", change: "+67", icon: Users, trend: "up" as const, detail: "+3,8% denna månad" },
];

const revenueData = [
  { month: "Sep", revenue: 892000, kostnad: 612000, orders: 98 },
  { month: "Okt", revenue: 986000, kostnad: 658000, orders: 120 },
  { month: "Nov", revenue: 1105000, kostnad: 721000, orders: 135 },
  { month: "Dec", revenue: 1048000, kostnad: 695000, orders: 128 },
  { month: "Jan", revenue: 1245000, kostnad: 812000, orders: 156 },
  { month: "Feb", revenue: 1162000, kostnad: 756000, orders: 168 },
  { month: "Mar", revenue: 1284000, kostnad: 834000, orders: 184 },
];

const storePerformance = [
  { name: "Sthlm Östermalm", revenue: 320000, target: 300000, margin: 28.4 },
  { name: "Sthlm Södermalm", revenue: 275000, target: 260000, margin: 25.1 },
  { name: "Gbg Haga", revenue: 248000, target: 240000, margin: 26.8 },
  { name: "Gbg Linné", revenue: 195000, target: 210000, margin: 22.3 },
  { name: "Gbg Majorna", revenue: 142000, target: 150000, margin: 21.5 },
  { name: "Zürich", revenue: 104000, target: 120000, margin: 31.2 },
];

const categoryData = [
  { name: "Lax", value: 35, color: "hsl(205, 78%, 28%)" },
  { name: "Skaldjur", value: 25, color: "hsl(172, 55%, 40%)" },
  { name: "Torsk", value: 15, color: "hsl(38, 92%, 50%)" },
  { name: "Tonfisk", value: 12, color: "hsl(152, 60%, 40%)" },
  { name: "Övrigt", value: 13, color: "hsl(215, 15%, 50%)" },
];

const recentOrders = [
  { id: "ORD-2847", store: "Stockholm Östermalm", items: "Lax (200kg), Torsk (100kg)", total: "12 450 kr", status: "Behandlas", date: "2026-03-04 09:15", payment: "Faktura 30d" },
  { id: "ORD-2846", store: "Göteborg Haga", items: "Hummer (50kg), Krabba (30kg)", total: "8 200 kr", status: "Skickad", date: "2026-03-03 14:22", payment: "Förskott" },
  { id: "ORD-2845", store: "Zürich", items: "Räkor (80kg), Torsk (60kg)", total: "5 680 kr", status: "Levererad", date: "2026-03-03 08:45", payment: "Faktura 15d" },
  { id: "ORD-2844", store: "Stockholm Södermalm", items: "Tonfisk (120kg), Räkor (90kg)", total: "9 340 kr", status: "Behandlas", date: "2026-03-02 16:30", payment: "Faktura 30d" },
  { id: "ORD-2843", store: "Göteborg Linné", items: "Lax (75kg)", total: "4 120 kr", status: "Levererad", date: "2026-03-02 11:10", payment: "Kontant" },
];

const lowStockAlerts = [
  { product: "Jätteräkor", current: 80, min: 100, store: "Alla butiker", severity: "kritisk" },
  { product: "Kungskrabba", current: 45, min: 60, store: "Alla butiker", severity: "kritisk" },
  { product: "Rödlax", current: 0, min: 50, store: "Alla butiker", severity: "slut" },
  { product: "Hummer", current: 320, min: 300, store: "Zürich", severity: "varning" },
];

const activityLog = [
  { time: "09:32", action: "Order ORD-2847 skapad", user: "Johan E.", type: "order" },
  { time: "09:15", action: "Inleverans från Norsk Sjömat AB — 450 kg", user: "System", type: "delivery" },
  { time: "08:45", action: "Lagerjustering: Sill -120 kg (Gbg Haga)", user: "Anna L.", type: "inventory" },
  { time: "08:30", action: "Personalschema uppdaterat vecka 11", user: "Maria S.", type: "staff" },
  { time: "08:00", action: "Daglig backup genomförd", user: "System", type: "system" },
  { time: "07:45", action: "Leverantörsfaktura #4521 godkänd", user: "Johan E.", type: "finance" },
];

const statusColor: Record<string, string> = {
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

export default function Dashboard() {
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
                  <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${kpi.trend === "up" ? "text-success" : "text-destructive"}`}>
                    {kpi.trend === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {kpi.change}
                  </span>
                </div>
                <p className="text-lg font-heading font-bold text-foreground leading-tight">{kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.label}</p>
                <p className="text-[9px] text-muted-foreground/70 mt-1">{kpi.detail}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main content area */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {/* Charts — 3 cols */}
        <motion.div variants={fadeUp} className="xl:col-span-3 space-y-4">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Intäkter & Kostnader</CardTitle>
                  <CardDescription className="text-xs">Senaste 7 månaderna — alla butiker</CardDescription>
                </div>
                <Tabs defaultValue="revenue" className="h-8">
                  <TabsList className="h-7 text-xs">
                    <TabsTrigger value="revenue" className="text-xs h-6 px-2">Intäkt</TabsTrigger>
                    <TabsTrigger value="margin" className="text-xs h-6 px-2">Marginal</TabsTrigger>
                    <TabsTrigger value="orders" className="text-xs h-6 px-2">Ordrar</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(205 78% 28%)" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(205 78% 28%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(0 72% 51%)" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="hsl(215 15% 50%)" />
                    <YAxis tick={{ fontSize: 10 }} stroke="hsl(215 15% 50%)" tickFormatter={(v) => `${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString("sv-SE")} kr`]} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                    <Area name="Intäkt" type="monotone" dataKey="revenue" stroke="hsl(205 78% 28%)" fill="url(#revGrad)" strokeWidth={2} />
                    <Area name="Kostnad" type="monotone" dataKey="kostnad" stroke="hsl(0 72% 51%)" fill="url(#costGrad)" strokeWidth={1.5} strokeDasharray="4 2" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Store performance + Category split */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Card className="shadow-card lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading">Butiksprestanda</CardTitle>
                <CardDescription className="text-xs">Intäkt vs budget — aktuell månad</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={storePerformance} layout="vertical" barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 20% 88%)" />
                      <XAxis type="number" tick={{ fontSize: 9 }} stroke="hsl(215 15% 50%)" tickFormatter={(v) => `${v / 1000}k`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 9 }} stroke="hsl(215 15% 50%)" width={90} />
                      <Tooltip formatter={(v: number) => [`${v.toLocaleString("sv-SE")} kr`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                      <Bar name="Intäkt" dataKey="revenue" fill="hsl(205 78% 28%)" radius={[0, 3, 3, 0]} barSize={10} />
                      <Bar name="Budget" dataKey="target" fill="hsl(214 20% 88%)" radius={[0, 3, 3, 0]} barSize={10} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading">Produktkategorier</CardTitle>
                <CardDescription className="text-xs">Försäljningsandel %</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
                        {categoryData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => [`${v}%`]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: "10px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* Right sidebar — 1 col */}
        <motion.div variants={fadeUp} className="space-y-4">
          {/* Low stock alerts */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Lagervarningar
                </CardTitle>
                <Badge variant="destructive" className="text-[10px]">{lowStockAlerts.length}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lowStockAlerts.map((alert, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 text-xs">
                  <div>
                    <p className="font-medium text-foreground">{alert.product}</p>
                    <p className="text-[10px] text-muted-foreground">{alert.current}/{alert.min} kg</p>
                  </div>
                  <Badge variant="outline" className={
                    alert.severity === "slut" ? "bg-destructive/10 text-destructive border-destructive/20 text-[10px]" :
                    alert.severity === "kritisk" ? "bg-warning/15 text-warning border-warning/20 text-[10px]" :
                    "bg-primary/10 text-primary border-primary/20 text-[10px]"
                  }>
                    {alert.severity === "slut" ? "Slut" : alert.severity === "kritisk" ? "Kritisk" : "Varning"}
                  </Badge>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full text-xs h-7 mt-1">
                Visa alla varningar →
              </Button>
            </CardContent>
          </Card>

          {/* Activity log */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Aktivitetslogg
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {activityLog.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-muted-foreground font-mono w-10 shrink-0">{item.time}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground leading-tight">{item.action}</p>
                      <p className="text-[10px] text-muted-foreground">{item.user}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full text-xs h-7 mt-2">
                Visa hela loggen →
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Orders - full width */}
      <motion.div variants={fadeUp}>
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Senaste beställningar</CardTitle>
                <CardDescription className="text-xs">Visar de 5 senaste — alla butiker</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="text-xs h-7">Visa alla →</Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">Order-ID</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Produkter</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Betalning</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Totalt</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 font-medium text-foreground">{order.id}</td>
                      <td className="py-2.5 text-foreground">{order.store}</td>
                      <td className="py-2.5 text-muted-foreground max-w-48 truncate">{order.items}</td>
                      <td className="py-2.5 text-muted-foreground">{order.date}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{order.payment}</td>
                      <td className="py-2.5 text-right font-medium text-foreground">{order.total}</td>
                      <td className="py-2.5 text-right">
                        <Badge variant="outline" className={`${statusColor[order.status]} text-[10px]`}>{order.status}</Badge>
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
