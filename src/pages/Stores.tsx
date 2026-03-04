import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Clock, Users, TrendingUp, Package, ShoppingCart, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const stores = [
  { id: 1, name: "Stockholm Östermalm", address: "Östermalmshallen, Östermalmstorg, Stockholm", phone: "08-123 45 67", hours: "Mån–Lör 09:30–18:00", staff: 6, city: "Stockholm", status: "Öppen", revenue: 320000, target: 300000, orders: 28, stock: 1850, sqm: 95, manager: "Johan Eriksson" },
  { id: 2, name: "Stockholm Södermalm", address: "Hornsgatan 42, Stockholm", phone: "08-234 56 78", hours: "Mån–Lör 10:00–18:00", staff: 4, city: "Stockholm", status: "Öppen", revenue: 275000, target: 260000, orders: 22, stock: 1420, sqm: 72, manager: "Oskar Lundgren" },
  { id: 3, name: "Göteborg Haga", address: "Haga Nygata 18, Göteborg", phone: "031-345 67 89", hours: "Mån–Lör 09:00–17:30", staff: 5, city: "Göteborg", status: "Öppen", revenue: 248000, target: 240000, orders: 19, stock: 1650, sqm: 88, manager: "Erik Johansson" },
  { id: 4, name: "Göteborg Linné", address: "Linnégatan 56, Göteborg", phone: "031-456 78 90", hours: "Mån–Lör 10:00–18:00", staff: 4, city: "Göteborg", status: "Öppen", revenue: 195000, target: 210000, orders: 15, stock: 980, sqm: 65, manager: "Lars Pettersson" },
  { id: 5, name: "Göteborg Majorna", address: "Mariaplan 3, Göteborg", phone: "031-567 89 01", hours: "Mån–Fre 09:30–17:00, Lör 09:30–15:00", staff: 3, city: "Göteborg", status: "Öppen", revenue: 142000, target: 150000, orders: 12, stock: 720, sqm: 55, manager: "Karl Andersson" },
  
];

const cityColor: Record<string, string> = {
  Stockholm: "bg-primary/10 text-primary border-primary/20",
  Göteborg: "bg-accent/15 text-accent border-accent/20",
};

export default function Stores() {
  const totalRevenue = stores.reduce((s, st) => s + st.revenue, 0);
  const totalStaff = stores.reduce((s, st) => s + st.staff, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground">Butikshantering</h2>
        <p className="text-xs text-muted-foreground">Era 5 fiskaffärer — 2 Stockholm, 3 Göteborg</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Butiker</p><p className="text-xl font-heading font-bold text-foreground">6</p><p className="text-[10px] text-muted-foreground">Alla öppna</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total omsättning</p><p className="text-xl font-heading font-bold text-foreground">{totalRevenue.toLocaleString("sv-SE")} kr</p><p className="text-[10px] text-muted-foreground">Aktuell månad</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Anställda totalt</p><p className="text-xl font-heading font-bold text-foreground">{totalStaff}</p><p className="text-[10px] text-muted-foreground">Alla butiker</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total yta</p><p className="text-xl font-heading font-bold text-foreground">{stores.reduce((s, st) => s + st.sqm, 0)} m²</p><p className="text-[10px] text-muted-foreground">Butiks- och lageryta</p></CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {stores.map((store) => {
          const revenuePercent = Math.round((store.revenue / store.target) * 100);
          return (
            <Card key={store.id} className="shadow-card hover:shadow-card-hover transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-heading font-semibold text-foreground text-sm">{store.name}</h3>
                    <p className="text-[10px] text-muted-foreground">{store.manager} — Butikschef</p>
                  </div>
                  <Badge variant="outline" className={`${cityColor[store.city]} text-[10px]`}>{store.city}</Badge>
                </div>

                {/* Revenue vs target */}
                <div className="mb-3 p-2 rounded-md bg-muted/40">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Intäkt vs budget</span>
                    <span className={revenuePercent >= 100 ? "text-success font-medium" : "text-warning font-medium"}>{revenuePercent}%</span>
                  </div>
                  <Progress value={Math.min(revenuePercent, 100)} className="h-1.5" />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>{store.revenue.toLocaleString("sv-SE")} kr</span>
                    <span>Mål: {store.target.toLocaleString("sv-SE")} kr</span>
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center p-1.5 rounded bg-muted/30">
                    <p className="text-xs font-bold text-foreground">{store.orders}</p>
                    <p className="text-[9px] text-muted-foreground">Ordrar</p>
                  </div>
                  <div className="text-center p-1.5 rounded bg-muted/30">
                    <p className="text-xs font-bold text-foreground">{store.stock} kg</p>
                    <p className="text-[9px] text-muted-foreground">Lager</p>
                  </div>
                  <div className="text-center p-1.5 rounded bg-muted/30">
                    <p className="text-xs font-bold text-foreground">{store.staff}</p>
                    <p className="text-[9px] text-muted-foreground">Personal</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                    <span className="text-[10px]">{store.address}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0 text-primary/60" />
                    <span className="text-[10px]">{store.phone}</span>
                  </div>
                  <div className="flex items-start gap-1.5 text-muted-foreground">
                    <Clock className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />
                    <span className="text-[10px]">{store.hours}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}
