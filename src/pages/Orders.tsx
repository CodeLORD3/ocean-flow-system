import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Filter } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ordersData = [
  { id: "ORD-2847", store: "Stockholm Östermalm", date: "2026-03-04", items: 4, total: 12450, status: "Behandlas" },
  { id: "ORD-2846", store: "Göteborg Haga", date: "2026-03-03", items: 2, total: 8200, status: "Skickad" },
  { id: "ORD-2845", store: "Zürich", date: "2026-03-03", items: 3, total: 5680, status: "Levererad" },
  { id: "ORD-2844", store: "Stockholm Södermalm", date: "2026-03-02", items: 5, total: 9340, status: "Behandlas" },
  { id: "ORD-2843", store: "Göteborg Linné", date: "2026-03-02", items: 1, total: 4120, status: "Levererad" },
  { id: "ORD-2842", store: "Göteborg Majorna", date: "2026-03-01", items: 6, total: 15600, status: "Skickad" },
  { id: "ORD-2841", store: "Stockholm Östermalm", date: "2026-03-01", items: 3, total: 7890, status: "Levererad" },
  { id: "ORD-2840", store: "Zürich", date: "2026-02-28", items: 2, total: 3200, status: "Avbruten" },
];

const statusColor: Record<string, string> = {
  Behandlas: "bg-warning/15 text-warning border-warning/20",
  Skickad: "bg-primary/10 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Orders() {
  const [search, setSearch] = useState("");
  const filtered = ordersData.filter((o) =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.store.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Beställningar</h2>
          <p className="text-sm text-muted-foreground">Spåra och hantera beställningar för alla butiker</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Ny beställning
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Sök beställningar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" /> Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 text-left font-medium text-muted-foreground">Order-ID</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Butik</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Datum</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Artiklar</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Totalt</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-medium text-foreground">{order.id}</td>
                    <td className="py-3 text-foreground">{order.store}</td>
                    <td className="py-3 text-muted-foreground">{order.date}</td>
                    <td className="py-3 text-right text-foreground">{order.items}</td>
                    <td className="py-3 text-right font-medium text-foreground">{order.total.toLocaleString("sv-SE")} kr</td>
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
  );
}
