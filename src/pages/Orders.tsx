import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Filter } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ordersData = [
  { id: "ORD-2847", customer: "Pacific Fresh Co.", date: "2026-03-04", items: 4, total: 12450, status: "Processing" },
  { id: "ORD-2846", customer: "Harbor Bistro", date: "2026-03-03", items: 2, total: 8200, status: "Shipped" },
  { id: "ORD-2845", customer: "Ocean Delights", date: "2026-03-03", items: 3, total: 5680, status: "Delivered" },
  { id: "ORD-2844", customer: "Bay View Restaurant", date: "2026-03-02", items: 5, total: 9340, status: "Processing" },
  { id: "ORD-2843", customer: "Coastal Catering", date: "2026-03-02", items: 1, total: 4120, status: "Delivered" },
  { id: "ORD-2842", customer: "Seaside Market", date: "2026-03-01", items: 6, total: 15600, status: "Shipped" },
  { id: "ORD-2841", customer: "Fisherman's Wharf", date: "2026-03-01", items: 3, total: 7890, status: "Delivered" },
  { id: "ORD-2840", customer: "Blue Tide Foods", date: "2026-02-28", items: 2, total: 3200, status: "Cancelled" },
];

const statusColor: Record<string, string> = {
  Processing: "bg-warning/15 text-warning border-warning/20",
  Shipped: "bg-primary/10 text-primary border-primary/20",
  Delivered: "bg-success/15 text-success border-success/20",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Orders() {
  const [search, setSearch] = useState("");
  const filtered = ordersData.filter((o) =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Orders</h2>
          <p className="text-sm text-muted-foreground">Track and manage customer orders</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Order
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search orders..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" /> Filters
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-3 text-left font-medium text-muted-foreground">Order ID</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Customer</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Items</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-medium text-foreground">{order.id}</td>
                    <td className="py-3 text-foreground">{order.customer}</td>
                    <td className="py-3 text-muted-foreground">{order.date}</td>
                    <td className="py-3 text-right text-foreground">{order.items}</td>
                    <td className="py-3 text-right font-medium text-foreground">${order.total.toLocaleString()}</td>
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
