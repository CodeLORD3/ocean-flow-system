import { useState } from "react";
import { motion } from "framer-motion";
import { Fish, Search, Plus, Filter } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const inventoryData = [
  { id: 1, name: "Atlantlax", category: "Lax", stock: 1200, unit: "kg", price: 149, origin: "Norge", status: "I lager" },
  { id: 2, name: "Blåfenad tonfisk", category: "Tonfisk", stock: 450, unit: "kg", price: 420, origin: "Japan", status: "I lager" },
  { id: 3, name: "Jätteräkor", category: "Räkor", stock: 80, unit: "kg", price: 189, origin: "Thailand", status: "Lågt lager" },
  { id: 4, name: "Torsk", category: "Torsk", stock: 900, unit: "kg", price: 95, origin: "Norge", status: "I lager" },
  { id: 5, name: "Hummer", category: "Skaldjur", stock: 320, unit: "kg", price: 550, origin: "Sverige", status: "I lager" },
  { id: 6, name: "Kungskrabba", category: "Skaldjur", stock: 45, unit: "kg", price: 680, origin: "Norge", status: "Lågt lager" },
  { id: 7, name: "Gulfenad tonfisk", category: "Tonfisk", stock: 780, unit: "kg", price: 285, origin: "Spanien", status: "I lager" },
  { id: 8, name: "Rödlax", category: "Lax", stock: 0, unit: "kg", price: 168, origin: "Kanada", status: "Slut" },
  { id: 9, name: "Nordhavsräkor", category: "Räkor", stock: 1600, unit: "kg", price: 125, origin: "Sverige", status: "I lager" },
  { id: 10, name: "Snökrabba", category: "Skaldjur", stock: 200, unit: "kg", price: 450, origin: "Kanada", status: "I lager" },
  { id: 11, name: "Rödspätta", category: "Plattfisk", stock: 340, unit: "kg", price: 110, origin: "Danmark", status: "I lager" },
  { id: 12, name: "Sill", category: "Sill", stock: 2200, unit: "kg", price: 45, origin: "Sverige", status: "I lager" },
];

const statusColor: Record<string, string> = {
  "I lager": "bg-success/15 text-success border-success/20",
  "Lågt lager": "bg-warning/15 text-warning border-warning/20",
  "Slut": "bg-destructive/10 text-destructive border-destructive/20",
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
          <h2 className="text-2xl font-heading font-bold text-foreground">Lager</h2>
          <p className="text-sm text-muted-foreground">Hantera lagernivåer för alla butiker</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> Lägg till produkt
        </Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Sök i lagret..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
                  <th className="pb-3 text-left font-medium text-muted-foreground">Produkt</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Kategori</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Lager</th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">Pris/kg</th>
                  <th className="pb-3 text-left font-medium text-muted-foreground">Ursprung</th>
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
                    <td className="py-3 text-right text-foreground">{item.stock.toLocaleString("sv-SE")} {item.unit}</td>
                    <td className="py-3 text-right text-foreground">{item.price} kr</td>
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
