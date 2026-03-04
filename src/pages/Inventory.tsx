import { useState } from "react";
import { motion } from "framer-motion";
import { Fish, Search, Plus, Filter, Package, AlertTriangle, TrendingUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const inventoryData = [
  { id: 1, sku: "LAX-001", name: "Atlantlax", category: "Lax", stock: 1200, minStock: 200, unit: "kg", price: 149, cost: 95, origin: "Norge", supplier: "Norsk Sjömat AB", status: "I lager", lastDelivery: "2026-03-02", nextDelivery: "2026-03-06" },
  { id: 2, sku: "TON-001", name: "Blåfenad tonfisk", category: "Tonfisk", stock: 450, minStock: 100, unit: "kg", price: 420, cost: 310, origin: "Japan", supplier: "Mediterranean Imports", status: "I lager", lastDelivery: "2026-02-28", nextDelivery: "2026-03-08" },
  { id: 3, sku: "RAK-001", name: "Jätteräkor", category: "Räkor", stock: 80, minStock: 100, unit: "kg", price: 189, cost: 120, origin: "Thailand", supplier: "Mediterranean Imports", status: "Lågt lager", lastDelivery: "2026-02-25", nextDelivery: "2026-03-05" },
  { id: 4, sku: "TOR-001", name: "Torsk", category: "Torsk", stock: 900, minStock: 150, unit: "kg", price: 95, cost: 58, origin: "Norge", supplier: "Norsk Sjömat AB", status: "I lager", lastDelivery: "2026-03-03", nextDelivery: "2026-03-07" },
  { id: 5, sku: "HUM-001", name: "Hummer", category: "Skaldjur", stock: 320, minStock: 50, unit: "kg", price: 550, cost: 380, origin: "Sverige", supplier: "Smögen Shellfish", status: "I lager", lastDelivery: "2026-03-01", nextDelivery: "2026-03-09" },
  { id: 6, sku: "KRB-001", name: "Kungskrabba", category: "Skaldjur", stock: 45, minStock: 60, unit: "kg", price: 680, cost: 490, origin: "Norge", supplier: "Norsk Sjömat AB", status: "Lågt lager", lastDelivery: "2026-02-27", nextDelivery: "2026-03-06" },
  { id: 7, sku: "TON-002", name: "Gulfenad tonfisk", category: "Tonfisk", stock: 780, minStock: 100, unit: "kg", price: 285, cost: 195, origin: "Spanien", supplier: "Mediterranean Imports", status: "I lager", lastDelivery: "2026-03-02", nextDelivery: "2026-03-10" },
  { id: 8, sku: "LAX-002", name: "Rödlax", category: "Lax", stock: 0, minStock: 50, unit: "kg", price: 168, cost: 110, origin: "Kanada", supplier: "Norsk Sjömat AB", status: "Slut", lastDelivery: "2026-02-15", nextDelivery: "2026-03-05" },
  { id: 9, sku: "RAK-002", name: "Nordhavsräkor", category: "Räkor", stock: 1600, minStock: 300, unit: "kg", price: 125, cost: 72, origin: "Sverige", supplier: "Göteborgs Fiskauktion", status: "I lager", lastDelivery: "2026-03-04", nextDelivery: "2026-03-08" },
  { id: 10, sku: "KRB-002", name: "Snökrabba", category: "Skaldjur", stock: 200, minStock: 40, unit: "kg", price: 450, cost: 320, origin: "Kanada", supplier: "Norsk Sjömat AB", status: "I lager", lastDelivery: "2026-03-01", nextDelivery: "2026-03-11" },
  { id: 11, sku: "PLT-001", name: "Rödspätta", category: "Plattfisk", stock: 340, minStock: 80, unit: "kg", price: 110, cost: 65, origin: "Danmark", supplier: "Göteborgs Fiskauktion", status: "I lager", lastDelivery: "2026-03-03", nextDelivery: "2026-03-07" },
  { id: 12, sku: "SIL-001", name: "Sill", category: "Sill", stock: 2200, minStock: 500, unit: "kg", price: 45, cost: 22, origin: "Sverige", supplier: "Kungshamns Fisk", status: "I lager", lastDelivery: "2026-03-04", nextDelivery: "2026-03-06" },
];

const statusColor: Record<string, string> = {
  "I lager": "bg-success/15 text-success border-success/20",
  "Lågt lager": "bg-warning/15 text-warning border-warning/20",
  "Slut": "bg-destructive/10 text-destructive border-destructive/20",
};

const categories = ["Alla", "Lax", "Tonfisk", "Räkor", "Skaldjur", "Torsk", "Plattfisk", "Sill"];

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Alla");

  const filtered = inventoryData.filter((i) => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase()) || i.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === "Alla" || i.category === category;
    return matchSearch && matchCat;
  });

  const totalStock = inventoryData.reduce((s, i) => s + i.stock, 0);
  const totalValue = inventoryData.reduce((s, i) => s + i.stock * i.cost, 0);
  const lowStockCount = inventoryData.filter(i => i.status !== "I lager").length;
  const avgMargin = Math.round(inventoryData.reduce((s, i) => s + ((i.price - i.cost) / i.price) * 100, 0) / inventoryData.length);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Lagerhantering</h2>
          <p className="text-xs text-muted-foreground">Realtidsöversikt av lagernivåer, värdering och leveranser</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Package className="h-3 w-3" /> Registrera inleverans
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8">
            <Plus className="h-3 w-3" /> Ny produkt
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Totalt lager</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalStock.toLocaleString("sv-SE")} kg</p>
            <p className="text-[10px] text-muted-foreground">{inventoryData.length} produkter</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Lagervärde (inköp)</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalValue.toLocaleString("sv-SE")} kr</p>
            <p className="text-[10px] text-muted-foreground">Försäljn.värde: {inventoryData.reduce((s, i) => s + i.stock * i.price, 0).toLocaleString("sv-SE")} kr</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Snittmarginal</p>
            <p className="text-xl font-heading font-bold text-foreground">{avgMargin}%</p>
            <p className="text-[10px] text-muted-foreground">Mål: 35%</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Varningar</p>
            <p className="text-xl font-heading font-bold text-destructive">{lowStockCount}</p>
            <p className="text-[10px] text-muted-foreground">Produkter under min.nivå</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Sök produkt eller SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Kategori</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Lager</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Min</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Inköp/kg</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Sälj/kg</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Marginal</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Leverantör</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Ursprung</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Nästa lev.</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const margin = Math.round(((item.price - item.cost) / item.price) * 100);
                  const stockPercent = Math.min(100, Math.round((item.stock / (item.minStock * 3)) * 100));
                  return (
                    <tr key={item.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 font-mono text-muted-foreground">{item.sku}</td>
                      <td className="py-2 font-medium text-foreground flex items-center gap-1.5">
                        <Fish className="h-3 w-3 text-primary/60" />
                        {item.name}
                      </td>
                      <td className="py-2 text-muted-foreground">{item.category}</td>
                      <td className="py-2 text-right text-foreground">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={stockPercent} className="w-12 h-1.5" />
                          <span>{item.stock.toLocaleString("sv-SE")} {item.unit}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-muted-foreground">{item.minStock}</td>
                      <td className="py-2 text-right text-muted-foreground">{item.cost} kr</td>
                      <td className="py-2 text-right text-foreground">{item.price} kr</td>
                      <td className="py-2 text-right">
                        <span className={margin > 35 ? "text-success font-medium" : margin > 25 ? "text-foreground" : "text-warning font-medium"}>{margin}%</span>
                      </td>
                      <td className="py-2 text-muted-foreground text-[10px]">{item.supplier}</td>
                      <td className="py-2 text-muted-foreground">{item.origin}</td>
                      <td className="py-2 text-muted-foreground">{item.nextDelivery}</td>
                      <td className="py-2 text-right">
                        <Badge variant="outline" className={`${statusColor[item.status]} text-[10px]`}>{item.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-3 text-[10px] text-muted-foreground">
            <span>Visar {filtered.length} av {inventoryData.length} produkter</span>
            <span>Senast uppdaterad: {new Date().toLocaleString("sv-SE")}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
