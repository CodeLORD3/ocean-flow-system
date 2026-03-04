import { useState } from "react";
import { motion } from "framer-motion";
import { Fish, Search, Plus, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inventoryData = [
  { id: 1, name: "Atlantic Salmon", category: "Salmon", stock: 1200, unit: "kg", price: 14.50, origin: "Norway", status: "In Stock" },
  { id: 2, name: "Bluefin Tuna", category: "Tuna", stock: 450, unit: "kg", price: 42.00, origin: "Japan", status: "In Stock" },
  { id: 3, name: "Tiger Shrimp", category: "Shrimp", stock: 80, unit: "kg", price: 18.75, origin: "Thailand", status: "Low Stock" },
  { id: 4, name: "Pacific Cod", category: "Cod", stock: 900, unit: "kg", price: 9.20, origin: "Alaska", status: "In Stock" },
  { id: 5, name: "Maine Lobster", category: "Lobster", stock: 320, unit: "kg", price: 55.00, origin: "USA", status: "In Stock" },
  { id: 6, name: "King Crab", category: "Crab", stock: 45, unit: "kg", price: 68.00, origin: "Russia", status: "Low Stock" },
  { id: 7, name: "Yellowfin Tuna", category: "Tuna", stock: 780, unit: "kg", price: 28.50, origin: "Philippines", status: "In Stock" },
  { id: 8, name: "Sockeye Salmon", category: "Salmon", stock: 0, unit: "kg", price: 16.80, origin: "Canada", status: "Out of Stock" },
  { id: 9, name: "White Shrimp", category: "Shrimp", stock: 1600, unit: "kg", price: 12.30, origin: "Ecuador", status: "In Stock" },
  { id: 10, name: "Snow Crab", category: "Crab", stock: 200, unit: "kg", price: 45.00, origin: "Canada", status: "In Stock" },
];

const statusColor: Record<string, string> = {
  "In Stock": "bg-success/15 text-success border-success/20",
  "Low Stock": "bg-warning/15 text-warning border-warning/20",
  "Out of Stock": "bg-destructive/10 text-destructive border-destructive/20",
};

export default function Inventory() {
  const [search, setSearch] = useState("");
  const filtered = inventoryData.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-heading font-bold text-foreground">Inventory</h2>
          <p className="text-sm text-muted-foreground">Manage your seafood stock levels</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search inventory..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
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
                  <th className="pb-3 text-left font-medium text-muted-foreground">Product</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Category</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Stock</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Price/kg</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Origin</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-medium text-foreground flex items-center gap-2">
                      <Fish className="h-4 w-4 text-primary/60" />
                      {item.name}
                    </td>
                    <td className="py-3 text-muted-foreground">{item.category}</td>
                    <td className="py-3 text-right text-foreground">{item.stock.toLocaleString()} {item.unit}</td>
                    <td className="py-3 text-right text-foreground">${item.price.toFixed(2)}</td>
                    <td className="py-3 text-muted-foreground">{item.origin}</td>
                    <td className="py-3 text-right">
                      <Badge variant="outline" className={statusColor[item.status]}>{item.status}</Badge>
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
