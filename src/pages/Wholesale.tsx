import { useState } from "react";
import { motion } from "framer-motion";
import {
  Factory, Package, TrendingUp, Users, ShoppingCart, Plus, Search, FileText,
  DollarSign, ArrowUpRight, Truck, CheckCircle2, Clock, Edit, BarChart3,
  AlertTriangle
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// --- Produktkatalog med priser ---
const productCatalog = [
  { id: 1, sku: "LAX-001", name: "Atlantlax", category: "Lax", unit: "kg", costPrice: 95, wholesalePrice: 125, retailSuggested: 149, margin: 24, stock: 1200, origin: "Norge" },
  { id: 2, sku: "TON-001", name: "Blåfenad tonfisk", category: "Tonfisk", unit: "kg", costPrice: 310, wholesalePrice: 370, retailSuggested: 420, margin: 16, stock: 450, origin: "Japan" },
  { id: 3, sku: "RAK-001", name: "Jätteräkor", category: "Räkor", unit: "kg", costPrice: 120, wholesalePrice: 158, retailSuggested: 189, margin: 24, stock: 80, origin: "Thailand" },
  { id: 4, sku: "TOR-001", name: "Torsk", category: "Torsk", unit: "kg", costPrice: 58, wholesalePrice: 78, retailSuggested: 95, margin: 26, stock: 900, origin: "Norge" },
  { id: 5, sku: "HUM-001", name: "Hummer", category: "Skaldjur", unit: "kg", costPrice: 380, wholesalePrice: 480, retailSuggested: 550, margin: 21, stock: 320, origin: "Sverige" },
  { id: 6, sku: "KRB-001", name: "Kungskrabba", category: "Skaldjur", unit: "kg", costPrice: 490, wholesalePrice: 600, retailSuggested: 680, margin: 18, stock: 45, origin: "Norge" },
  { id: 7, sku: "TON-002", name: "Gulfenad tonfisk", category: "Tonfisk", unit: "kg", costPrice: 195, wholesalePrice: 248, retailSuggested: 285, margin: 21, stock: 780, origin: "Spanien" },
  { id: 8, sku: "LAX-002", name: "Rödlax", category: "Lax", unit: "kg", costPrice: 110, wholesalePrice: 142, retailSuggested: 168, margin: 23, stock: 0, origin: "Kanada" },
  { id: 9, sku: "RAK-002", name: "Nordhavsräkor", category: "Räkor", unit: "kg", costPrice: 72, wholesalePrice: 102, retailSuggested: 125, margin: 29, stock: 1600, origin: "Sverige" },
  { id: 10, sku: "KRB-002", name: "Snökrabba", category: "Skaldjur", unit: "kg", costPrice: 320, wholesalePrice: 395, retailSuggested: 450, margin: 19, stock: 200, origin: "Kanada" },
  { id: 11, sku: "PLT-001", name: "Rödspätta", category: "Plattfisk", unit: "kg", costPrice: 65, wholesalePrice: 90, retailSuggested: 110, margin: 28, stock: 340, origin: "Danmark" },
  { id: 12, sku: "SIL-001", name: "Sill", category: "Sill", unit: "kg", costPrice: 22, wholesalePrice: 35, retailSuggested: 45, margin: 37, stock: 2200, origin: "Sverige" },
];

// --- Butikspriser (avvikelser från standardpris) ---
const storePricing = [
  { store: "Stockholm Östermalm", priceLevel: "Premium", markup: 1.08, note: "Premiumområde — 8% påslag" },
  { store: "Stockholm Södermalm", priceLevel: "Standard", markup: 1.00, note: "Standardpriser" },
  { store: "Göteborg Haga", priceLevel: "Standard", markup: 1.00, note: "Standardpriser" },
  { store: "Göteborg Linné", priceLevel: "Standard", markup: 1.00, note: "Standardpriser" },
  { store: "Göteborg Majorna", priceLevel: "Budget", markup: 0.95, note: "5% rabatt — volymområde" },
];

// --- Grossistordrar till butiker ---
const wholesaleOrders = [
  { id: "GR-0421", store: "Stockholm Östermalm", date: "2026-03-04", items: 5, totalKg: 380, total: 48200, status: "Packad", delivery: "2026-03-05" },
  { id: "GR-0420", store: "Göteborg Haga", date: "2026-03-04", items: 3, totalKg: 250, total: 31500, status: "Under beredning", delivery: "2026-03-05" },
  { id: "GR-0419", store: "Stockholm Södermalm", date: "2026-03-03", items: 4, totalKg: 420, total: 38900, status: "Levererad", delivery: "2026-03-04" },
  { id: "GR-0418", store: "Göteborg Linné", date: "2026-03-03", items: 2, totalKg: 150, total: 18200, status: "Levererad", delivery: "2026-03-03" },
  { id: "GR-0417", store: "Göteborg Majorna", date: "2026-03-02", items: 3, totalKg: 280, total: 24600, status: "Levererad", delivery: "2026-03-03" },
  { id: "GR-0416", store: "Stockholm Östermalm", date: "2026-03-02", items: 6, totalKg: 510, total: 62300, status: "Levererad", delivery: "2026-03-02" },
];

// --- Produktionsplan ---
const productionPlan = [
  { product: "Atlantlax (filé)", batch: "PROD-2026-0304-A", qty: 200, unit: "kg", startTime: "06:00", endTime: "10:00", status: "Klar", operator: "Anders M." },
  { product: "Torsk (filé)", batch: "PROD-2026-0304-B", qty: 150, unit: "kg", startTime: "07:00", endTime: "10:30", status: "Pågår", operator: "Lisa K." },
  { product: "Räkor (skalade)", batch: "PROD-2026-0304-C", qty: 80, unit: "kg", startTime: "08:00", endTime: "11:00", status: "Planerad", operator: "Anders M." },
  { product: "Sill (marinerad)", batch: "PROD-2026-0304-D", qty: 300, unit: "kg", startTime: "06:30", endTime: "12:00", status: "Pågår", operator: "Karin S." },
  { product: "Hummer (kokt)", batch: "PROD-2026-0304-E", qty: 40, unit: "kg", startTime: "09:00", endTime: "11:00", status: "Planerad", operator: "Lisa K." },
];

const statusColor: Record<string, string> = {
  "Packad": "bg-primary/10 text-primary border-primary/20",
  "Under beredning": "bg-warning/15 text-warning border-warning/20",
  "Levererad": "bg-success/15 text-success border-success/20",
  "Klar": "bg-success/15 text-success border-success/20",
  "Pågår": "bg-warning/15 text-warning border-warning/20",
  "Planerad": "bg-muted text-muted-foreground border-muted",
};

export default function Wholesale() {
  const [search, setSearch] = useState("");
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<typeof productCatalog[0] | null>(null);
  const [editCost, setEditCost] = useState("");
  const [editWholesale, setEditWholesale] = useState("");
  const [editRetail, setEditRetail] = useState("");
  const { toast } = useToast();

  const filtered = productCatalog.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalStockValue = productCatalog.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const totalWholesaleValue = productCatalog.reduce((s, p) => s + p.stock * p.wholesalePrice, 0);
  const avgMargin = Math.round(productCatalog.reduce((s, p) => s + p.margin, 0) / productCatalog.length);
  const todayOrders = wholesaleOrders.filter(o => o.date === "2026-03-04").length;

  const openPriceDialog = (product: typeof productCatalog[0]) => {
    setSelectedProduct(product);
    setEditCost(String(product.costPrice));
    setEditWholesale(String(product.wholesalePrice));
    setEditRetail(String(product.retailSuggested));
    setPriceDialogOpen(true);
  };

  const handleSavePrice = () => {
    toast({
      title: "Priser uppdaterade",
      description: `${selectedProduct?.name}: Inköp ${editCost} kr, Grossist ${editWholesale} kr, Butik ${editRetail} kr`,
    });
    setPriceDialogOpen(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Produktion & Grossist</h2>
          <p className="text-xs text-muted-foreground">Centrallager, prissättning, produktkatalog och distribution till 5 butiker</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <FileText className="h-3 w-3" /> Exportera prislista
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8">
            <Plus className="h-3 w-3" /> Ny grossistorder
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Factory className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Lagervärde (inköp)</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{totalStockValue.toLocaleString("sv-SE")} kr</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="h-3.5 w-3.5 text-success" />
              <p className="text-[10px] text-muted-foreground">Grossistvärde</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{totalWholesaleValue.toLocaleString("sv-SE")} kr</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <p className="text-[10px] text-muted-foreground">Snittmarginal</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{avgMargin}%</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingCart className="h-3.5 w-3.5 text-warning" />
              <p className="text-[10px] text-muted-foreground">Ordrar idag</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{todayOrders}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Butiker</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">5</p>
            <p className="text-[10px] text-muted-foreground">Alla anslutna</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="catalog" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="catalog" className="text-xs h-7">Produktkatalog & Priser</TabsTrigger>
          <TabsTrigger value="store-pricing" className="text-xs h-7">Butikspriser</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs h-7">Grossistordrar</TabsTrigger>
          <TabsTrigger value="production" className="text-xs h-7">Produktion</TabsTrigger>
        </TabsList>

        {/* Tab 1: Produktkatalog med priser */}
        <TabsContent value="catalog">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktkatalog</CardTitle>
                  <CardDescription className="text-xs">Alla produkter med inköpspris, grossistpris och rekommenderat butikspris. Klicka ✏️ för att ändra.</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Sök produkt eller SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
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
                      <th className="pb-2 text-right font-medium text-muted-foreground">Inköpspris/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Grossistpris/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Rek. butik/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Marginal</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Lager</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Ursprung</th>
                      <th className="pb-2 text-center font-medium text-muted-foreground">Ändra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => (
                      <tr key={product.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-mono text-muted-foreground">{product.sku}</td>
                        <td className="py-2 font-medium text-foreground">{product.name}</td>
                        <td className="py-2 text-muted-foreground">{product.category}</td>
                        <td className="py-2 text-right text-muted-foreground">{product.costPrice} kr</td>
                        <td className="py-2 text-right font-medium text-foreground">{product.wholesalePrice} kr</td>
                        <td className="py-2 text-right text-foreground">{product.retailSuggested} kr</td>
                        <td className="py-2 text-right">
                          <span className={product.margin >= 25 ? "text-success font-medium" : product.margin >= 20 ? "text-foreground" : "text-warning font-medium"}>
                            {product.margin}%
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          {product.stock === 0 ? (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Slut</Badge>
                          ) : (
                            <span className="text-foreground">{product.stock.toLocaleString("sv-SE")} kg</span>
                          )}
                        </td>
                        <td className="py-2 text-muted-foreground">{product.origin}</td>
                        <td className="py-2 text-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPriceDialog(product)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Butikspriser */}
        <TabsContent value="store-pricing">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Prisnivåer per butik</CardTitle>
              <CardDescription className="text-xs">Varje butik har en prisnivå som appliceras på det rekommenderade butikspriset</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Prisnivå</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Multipel</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Anteckning</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Ex: Atlantlax/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Ex: Hummer/kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storePricing.map((sp) => (
                      <tr key={sp.store} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium text-foreground">{sp.store}</td>
                        <td className="py-2">
                          <Badge variant="outline" className={
                            sp.priceLevel === "Premium" ? "bg-warning/15 text-warning border-warning/20 text-[10px]" :
                            sp.priceLevel === "Budget" ? "bg-success/15 text-success border-success/20 text-[10px]" :
                            "bg-primary/10 text-primary border-primary/20 text-[10px]"
                          }>
                            {sp.priceLevel}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono text-foreground">×{sp.markup.toFixed(2)}</td>
                        <td className="py-2 text-muted-foreground">{sp.note}</td>
                        <td className="py-2 text-right font-medium text-foreground">{Math.round(149 * sp.markup)} kr</td>
                        <td className="py-2 text-right font-medium text-foreground">{Math.round(550 * sp.markup)} kr</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Butikspriset beräknas: Rekommenderat butikspris × prisnivåmultipel. Butikerna kan även sätta egna priser lokalt.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Grossistordrar */}
        <TabsContent value="orders">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Grossistordrar till butiker</CardTitle>
                  <CardDescription className="text-xs">Interna ordrar från produktion/centrallager till butikerna</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7"><Plus className="h-3 w-3" /> Ny order</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Order-ID</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Artiklar</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Totalt</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Leverans</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wholesaleOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-mono font-medium text-foreground">{order.id}</td>
                        <td className="py-2 text-foreground">{order.store}</td>
                        <td className="py-2 text-muted-foreground">{order.date}</td>
                        <td className="py-2 text-right text-foreground">{order.items}</td>
                        <td className="py-2 text-right text-foreground">{order.totalKg} kg</td>
                        <td className="py-2 text-right font-medium text-foreground">{order.total.toLocaleString("sv-SE")} kr</td>
                        <td className="py-2 text-muted-foreground">{order.delivery}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`${statusColor[order.status]} text-[10px]`}>{order.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Produktion */}
        <TabsContent value="production">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktionsplan — Idag</CardTitle>
                  <CardDescription className="text-xs">Filering, skalning, marinering och kokning</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7"><Plus className="h-3 w-3" /> Lägg till beredning</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Batch</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Tid</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Operatör</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionPlan.map((item) => (
                      <tr key={item.batch} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium text-foreground">{item.product}</td>
                        <td className="py-2 font-mono text-muted-foreground text-[10px]">{item.batch}</td>
                        <td className="py-2 text-right text-foreground">{item.qty} {item.unit}</td>
                        <td className="py-2 text-muted-foreground">{item.startTime}–{item.endTime}</td>
                        <td className="py-2 text-muted-foreground">{item.operator}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`${statusColor[item.status]} text-[10px]`}>{item.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-2 rounded-md bg-muted/40 text-[10px] text-muted-foreground">
                Total produktion idag: <span className="font-bold text-foreground">{productionPlan.reduce((s, i) => s + i.qty, 0)} kg</span> · {productionPlan.filter(i => i.status === "Klar").length} klara · {productionPlan.filter(i => i.status === "Pågår").length} pågår · {productionPlan.filter(i => i.status === "Planerad").length} planerade
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Price edit dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Ändra priser — {selectedProduct?.name}</DialogTitle>
            <DialogDescription className="text-xs">
              SKU: {selectedProduct?.sku} · Kategori: {selectedProduct?.category} · Ursprung: {selectedProduct?.origin}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Inköpspris (kr/kg)</Label>
              <Input value={editCost} onChange={(e) => setEditCost(e.target.value)} className="h-8 text-xs" type="number" />
              <p className="text-[10px] text-muted-foreground">Priset ni betalar till leverantören</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Grossistpris (kr/kg)</Label>
              <Input value={editWholesale} onChange={(e) => setEditWholesale(e.target.value)} className="h-8 text-xs" type="number" />
              <p className="text-[10px] text-muted-foreground">Internt pris till butikerna</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rekommenderat butikspris (kr/kg)</Label>
              <Input value={editRetail} onChange={(e) => setEditRetail(e.target.value)} className="h-8 text-xs" type="number" />
              <p className="text-[10px] text-muted-foreground">Rek. slutkundspris — butiken kan avvika med sin prisnivå</p>
            </div>

            {editCost && editWholesale && editRetail && (
              <div className="p-2 rounded-md bg-muted/50 text-xs space-y-1">
                <p>Grossistmarginal: <span className="font-bold text-success">{Math.round(((Number(editWholesale) - Number(editCost)) / Number(editWholesale)) * 100)}%</span></p>
                <p>Butiksmarginal (std): <span className="font-bold text-foreground">{Math.round(((Number(editRetail) - Number(editWholesale)) / Number(editRetail)) * 100)}%</span></p>
                <p>Total kedja: <span className="font-bold text-primary">{Math.round(((Number(editRetail) - Number(editCost)) / Number(editRetail)) * 100)}%</span></p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setPriceDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" className="text-xs" onClick={handleSavePrice}>Spara priser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
