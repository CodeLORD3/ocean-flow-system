import { useState } from "react";
import { motion } from "framer-motion";
import {
  Factory, Package, TrendingUp, Users, ShoppingCart, Plus, Search, FileText,
  DollarSign, Truck, CheckCircle2, Clock, Edit, AlertTriangle, X, Printer,
  ArrowRight, ArrowDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// --- Produktkatalog med priser ---
const productCatalog = [
  { id: 1, sku: "LAX-001", name: "Atlantlax", category: "Lax", unit: "kg", costPrice: 95, wholesalePrice: 125, retailSuggested: 149, stock: 1200, origin: "Norge" },
  { id: 2, sku: "TON-001", name: "Blåfenad tonfisk", category: "Tonfisk", unit: "kg", costPrice: 310, wholesalePrice: 370, retailSuggested: 420, stock: 450, origin: "Japan" },
  { id: 3, sku: "RAK-001", name: "Jätteräkor", category: "Räkor", unit: "kg", costPrice: 120, wholesalePrice: 158, retailSuggested: 189, stock: 80, origin: "Thailand" },
  { id: 4, sku: "TOR-001", name: "Torsk", category: "Torsk", unit: "kg", costPrice: 58, wholesalePrice: 78, retailSuggested: 95, stock: 900, origin: "Norge" },
  { id: 5, sku: "HUM-001", name: "Hummer", category: "Skaldjur", unit: "kg", costPrice: 380, wholesalePrice: 480, retailSuggested: 550, stock: 320, origin: "Sverige" },
  { id: 6, sku: "KRB-001", name: "Kungskrabba", category: "Skaldjur", unit: "kg", costPrice: 490, wholesalePrice: 600, retailSuggested: 680, stock: 45, origin: "Norge" },
  { id: 7, sku: "TON-002", name: "Gulfenad tonfisk", category: "Tonfisk", unit: "kg", costPrice: 195, wholesalePrice: 248, retailSuggested: 285, stock: 780, origin: "Spanien" },
  { id: 8, sku: "LAX-002", name: "Rödlax", category: "Lax", unit: "kg", costPrice: 110, wholesalePrice: 142, retailSuggested: 168, stock: 0, origin: "Kanada" },
  { id: 9, sku: "RAK-002", name: "Nordhavsräkor", category: "Räkor", unit: "kg", costPrice: 72, wholesalePrice: 102, retailSuggested: 125, stock: 1600, origin: "Sverige" },
  { id: 10, sku: "KRB-002", name: "Snökrabba", category: "Skaldjur", unit: "kg", costPrice: 320, wholesalePrice: 395, retailSuggested: 450, stock: 200, origin: "Kanada" },
  { id: 11, sku: "PLT-001", name: "Rödspätta", category: "Plattfisk", unit: "kg", costPrice: 65, wholesalePrice: 90, retailSuggested: 110, stock: 340, origin: "Danmark" },
  { id: 12, sku: "SIL-001", name: "Sill", category: "Sill", unit: "kg", costPrice: 22, wholesalePrice: 35, retailSuggested: 45, stock: 2200, origin: "Sverige" },
];

const storeOptions = ["Stockholm Östermalm", "Stockholm Södermalm", "Göteborg Haga", "Göteborg Linné", "Göteborg Majorna"];

// --- Följesedlar (utleveranser till butiker) ---
const deliveryNotes = [
  { id: "FS-2026-0198", store: "Stockholm Östermalm", date: "2026-03-04", deliveryDate: "2026-03-05", lines: [
    { product: "Atlantlax", qty: 120, unit: "kg", wholesalePrice: 125, total: 15000 },
    { product: "Torsk", qty: 80, unit: "kg", wholesalePrice: 78, total: 6240 },
    { product: "Hummer", qty: 25, unit: "kg", wholesalePrice: 480, total: 12000 },
    { product: "Nordhavsräkor", qty: 60, unit: "kg", wholesalePrice: 102, total: 6120 },
  ], totalKg: 285, totalAmount: 39360, status: "Skickad", createdBy: "Anders M." },
  { id: "FS-2026-0197", store: "Göteborg Haga", date: "2026-03-04", deliveryDate: "2026-03-05", lines: [
    { product: "Atlantlax", qty: 80, unit: "kg", wholesalePrice: 125, total: 10000 },
    { product: "Sill", qty: 200, unit: "kg", wholesalePrice: 35, total: 7000 },
    { product: "Rödspätta", qty: 50, unit: "kg", wholesalePrice: 90, total: 4500 },
  ], totalKg: 330, totalAmount: 21500, status: "Packad", createdBy: "Lisa K." },
  { id: "FS-2026-0196", store: "Stockholm Södermalm", date: "2026-03-03", deliveryDate: "2026-03-04", lines: [
    { product: "Gulfenad tonfisk", qty: 60, unit: "kg", wholesalePrice: 248, total: 14880 },
    { product: "Jätteräkor", qty: 30, unit: "kg", wholesalePrice: 158, total: 4740 },
    { product: "Torsk", qty: 100, unit: "kg", wholesalePrice: 78, total: 7800 },
    { product: "Atlantlax", qty: 90, unit: "kg", wholesalePrice: 125, total: 11250 },
  ], totalKg: 280, totalAmount: 38670, status: "Levererad", createdBy: "Anders M." },
  { id: "FS-2026-0195", store: "Göteborg Linné", date: "2026-03-03", deliveryDate: "2026-03-03", lines: [
    { product: "Atlantlax", qty: 60, unit: "kg", wholesalePrice: 125, total: 7500 },
    { product: "Nordhavsräkor", qty: 80, unit: "kg", wholesalePrice: 102, total: 8160 },
  ], totalKg: 140, totalAmount: 15660, status: "Levererad", createdBy: "Karin S." },
  { id: "FS-2026-0194", store: "Göteborg Majorna", date: "2026-03-02", deliveryDate: "2026-03-03", lines: [
    { product: "Sill", qty: 300, unit: "kg", wholesalePrice: 35, total: 10500 },
    { product: "Torsk", qty: 80, unit: "kg", wholesalePrice: 78, total: 6240 },
    { product: "Rödspätta", qty: 40, unit: "kg", wholesalePrice: 90, total: 3600 },
  ], totalKg: 420, totalAmount: 20340, status: "Levererad", createdBy: "Anders M." },
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
  "Skickad": "bg-primary/10 text-primary border-primary/20",
  "Packad": "bg-warning/15 text-warning border-warning/20",
  "Levererad": "bg-success/15 text-success border-success/20",
  "Utkast": "bg-muted text-muted-foreground border-muted",
  "Klar": "bg-success/15 text-success border-success/20",
  "Pågår": "bg-warning/15 text-warning border-warning/20",
  "Planerad": "bg-muted text-muted-foreground border-muted",
};

// --- Följesedel line type ---
interface FSLineInput { product: string; qty: string; }
const emptyFSLine: FSLineInput = { product: "", qty: "" };

export default function Wholesale() {
  const [search, setSearch] = useState("");
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [fsDialogOpen, setFsDialogOpen] = useState(false);
  const [fsStep, setFsStep] = useState<1 | 2 | 3>(1);
  const [viewFsId, setViewFsId] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<typeof productCatalog[0] | null>(null);
  const [editCost, setEditCost] = useState("");
  const [editWholesale, setEditWholesale] = useState("");
  const [editRetail, setEditRetail] = useState("");
  const { toast } = useToast();

  // Följesedel form state
  const [fsStore, setFsStore] = useState("");
  const [fsDeliveryDate, setFsDeliveryDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [fsNote, setFsNote] = useState("");
  const [fsLines, setFsLines] = useState<FSLineInput[]>([{ ...emptyFSLine }]);

  const resetFsForm = () => { setFsStep(1); setFsStore(""); setFsDeliveryDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); setFsNote(""); setFsLines([{ ...emptyFSLine }]); };
  const addFsLine = () => setFsLines([...fsLines, { ...emptyFSLine }]);
  const removeFsLine = (i: number) => setFsLines(fsLines.filter((_, idx) => idx !== i));
  const updateFsLine = (i: number, field: keyof FSLineInput, value: string) => { const u = [...fsLines]; u[i] = { ...u[i], [field]: value }; setFsLines(u); };

  const getProductByName = (name: string) => productCatalog.find(p => p.name === name);

  const fsLinesWithPrices = fsLines.filter(l => l.product && l.qty).map(l => {
    const p = getProductByName(l.product);
    return { ...l, wholesalePrice: p?.wholesalePrice ?? 0, total: (p?.wholesalePrice ?? 0) * Number(l.qty), stock: p?.stock ?? 0 };
  });

  const filtered = productCatalog.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalStockValue = productCatalog.reduce((s, p) => s + p.stock * p.costPrice, 0);
  const totalWholesaleValue = productCatalog.reduce((s, p) => s + p.stock * p.wholesalePrice, 0);
  const avgMargin = Math.round(productCatalog.reduce((s, p) => s + ((p.wholesalePrice - p.costPrice) / p.wholesalePrice) * 100, 0) / productCatalog.length);

  const openPriceDialog = (product: typeof productCatalog[0]) => {
    setSelectedProduct(product);
    setEditCost(String(product.costPrice));
    setEditWholesale(String(product.wholesalePrice));
    setEditRetail(String(product.retailSuggested));
    setPriceDialogOpen(true);
  };

  const handleSavePrice = () => {
    toast({ title: "Priser uppdaterade", description: `${selectedProduct?.name}: Inköp ${editCost} kr, Grossist ${editWholesale} kr, Rek. butik ${editRetail} kr` });
    setPriceDialogOpen(false);
  };

  const handleCreateFs = () => {
    const totalKg = fsLinesWithPrices.reduce((s, l) => s + Number(l.qty), 0);
    const totalAmount = fsLinesWithPrices.reduce((s, l) => s + l.total, 0);
    toast({ title: "Följesedel skapad", description: `FS till ${fsStore} — ${totalKg} kg — ${totalAmount.toLocaleString("sv-SE")} kr (grossistpris = butikens inköpspris)` });
    setFsDialogOpen(false);
    resetFsForm();
  };

  const viewedFs = viewFsId ? deliveryNotes.find(fs => fs.id === viewFsId) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Flow diagram */}
      <Card className="shadow-card bg-muted/30">
        <CardContent className="p-3">
          <div className="flex items-center justify-center gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Leverantör</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-primary/10 border border-primary/20">
              <Factory className="h-3 w-3 text-primary" />
              <span className="font-medium text-primary">Grossist/Produktion</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-accent/10 border border-accent/20">
              <FileText className="h-3 w-3 text-accent" />
              <span className="font-medium text-accent">Följesedel + Grossistpriser</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted">
              <ShoppingCart className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">5 Butiker (inköpspris)</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Produktion & Grossist</h2>
          <p className="text-xs text-muted-foreground">Centrallager → Följesedel med grossistpriser → Butikernas inköpspris</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { toast({ title: "Exporterar...", description: "Prislista exporteras som PDF" }); }}>
            <Printer className="h-3 w-3" /> Skriv ut prislista
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setFsDialogOpen(true); resetFsForm(); }}>
            <FileText className="h-3 w-3" /> Skapa följesedel
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><Factory className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] text-muted-foreground">Lagervärde (inköp)</p></div><p className="text-lg font-heading font-bold text-foreground">{totalStockValue.toLocaleString("sv-SE")} kr</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><DollarSign className="h-3.5 w-3.5 text-success" /><p className="text-[10px] text-muted-foreground">Grossistvärde</p></div><p className="text-lg font-heading font-bold text-foreground">{totalWholesaleValue.toLocaleString("sv-SE")} kr</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><TrendingUp className="h-3.5 w-3.5 text-accent" /><p className="text-[10px] text-muted-foreground">Grossistmarginal (snitt)</p></div><p className="text-lg font-heading font-bold text-foreground">{avgMargin}%</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><FileText className="h-3.5 w-3.5 text-warning" /><p className="text-[10px] text-muted-foreground">Följesedlar idag</p></div><p className="text-lg font-heading font-bold text-foreground">{deliveryNotes.filter(d => d.date === "2026-03-04").length}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><Users className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] text-muted-foreground">Butiker</p></div><p className="text-lg font-heading font-bold text-foreground">5</p></CardContent></Card>
      </div>

      <Tabs defaultValue="delivery-notes" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="delivery-notes" className="text-xs h-7">Följesedlar</TabsTrigger>
          <TabsTrigger value="catalog" className="text-xs h-7">Produktkatalog & Priser</TabsTrigger>
          <TabsTrigger value="production" className="text-xs h-7">Produktion</TabsTrigger>
        </TabsList>

        {/* Tab 1: Följesedlar */}
        <TabsContent value="delivery-notes">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Följesedlar till butiker</CardTitle>
                  <CardDescription className="text-xs">Varje följesedel innehåller produkter med grossistpris — detta blir butikens inköpspris</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={() => { setFsDialogOpen(true); resetFsForm(); }}>
                  <Plus className="h-3 w-3" /> Ny följesedel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left font-medium text-muted-foreground">FS-nr</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Skapad</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Leveransdatum</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Belopp (grossistpris)</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Skapad av</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                      <th className="pb-2 text-center font-medium text-muted-foreground">Visa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveryNotes.map((dn) => (
                      <tr key={dn.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-mono font-medium text-foreground">{dn.id}</td>
                        <td className="py-2 text-foreground">{dn.store}</td>
                        <td className="py-2 text-muted-foreground">{dn.date}</td>
                        <td className="py-2 text-muted-foreground">{dn.deliveryDate}</td>
                        <td className="py-2 text-right text-foreground">{dn.lines.length}</td>
                        <td className="py-2 text-right text-foreground">{dn.totalKg} kg</td>
                        <td className="py-2 text-right font-medium text-foreground">{dn.totalAmount.toLocaleString("sv-SE")} kr</td>
                        <td className="py-2 text-muted-foreground">{dn.createdBy}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`${statusColor[dn.status]} text-[10px]`}>{dn.status}</Badge>
                        </td>
                        <td className="py-2 text-center">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setViewFsId(dn.id)}>
                            <FileText className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-2 rounded-md bg-muted/40 text-[10px] text-muted-foreground">
                💡 <span className="font-medium">Grossistpriset på följesedeln = butikens inköpspris.</span> Butiken sätter sedan sitt eget försäljningspris till slutkund.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Produktkatalog */}
        <TabsContent value="catalog">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktkatalog & Prissättning</CardTitle>
                  <CardDescription className="text-xs">
                    Inköpspris (från leverantör) → Grossistpris (till butik = butikens inköpspris) → Rek. butikspris (slutkund). Klicka ✏️ för att ändra.
                  </CardDescription>
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
                      <th className="pb-2 text-right font-medium text-muted-foreground">Vårt inköp/kg</th>
                      <th className="pb-2 text-right font-medium text-primary">Grossistpris/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Grossistmarg.</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Rek. butik/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Lager</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Ursprung</th>
                      <th className="pb-2 text-center font-medium text-muted-foreground">Ändra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => {
                      const grossistMargin = Math.round(((product.wholesalePrice - product.costPrice) / product.wholesalePrice) * 100);
                      return (
                        <tr key={product.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-mono text-muted-foreground">{product.sku}</td>
                          <td className="py-2 font-medium text-foreground">{product.name}</td>
                          <td className="py-2 text-muted-foreground">{product.category}</td>
                          <td className="py-2 text-right text-muted-foreground">{product.costPrice} kr</td>
                          <td className="py-2 text-right font-bold text-primary">{product.wholesalePrice} kr</td>
                          <td className="py-2 text-right">
                            <span className={grossistMargin >= 25 ? "text-success font-medium" : grossistMargin >= 20 ? "text-foreground" : "text-warning font-medium"}>
                              {grossistMargin}%
                            </span>
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{product.retailSuggested} kr</td>
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/10 text-[10px] text-foreground">
                <span className="font-semibold text-primary">Grossistpriset</span> är det pris som anges på följesedeln till butikerna. Det blir butikens inköpspris. Butiken bestämmer sedan sitt eget försäljningspris.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Produktion */}
        <TabsContent value="production">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktionsplan — Idag</CardTitle>
                  <CardDescription className="text-xs">Filering, skalning, marinering och kokning — redo för utleverans</CardDescription>
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

      {/* === Skapa följesedel dialog === */}
      <Dialog open={fsDialogOpen} onOpenChange={(open) => { setFsDialogOpen(open); if (!open) resetFsForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {fsStep === 1 && "Steg 1: Välj butik och leveransdatum"}
              {fsStep === 2 && "Steg 2: Lägg till produktrader"}
              {fsStep === 3 && "Steg 3: Granska följesedel"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {fsStep === 1 && "Välj vilken butik som ska ta emot leveransen."}
              {fsStep === 2 && "Välj produkter och kvantiteter. Grossistpriset hämtas automatiskt och blir butikens inköpspris."}
              {fsStep === 3 && "Kontrollera att allt stämmer. Följesedeln skickas till butiken med priser."}
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-2 my-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold ${fsStep >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
                {s < 3 && <div className={`w-8 h-0.5 ${fsStep > s ? "bg-primary" : "bg-muted"}`} />}
              </div>
            ))}
          </div>

          {fsStep === 1 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mottagande butik *</Label>
                <Select value={fsStore} onValueChange={setFsStore}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj butik" /></SelectTrigger>
                  <SelectContent>{storeOptions.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Leveransdatum</Label>
                <Input type="date" value={fsDeliveryDate} onChange={(e) => setFsDeliveryDate(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Anteckning (valfritt)</Label>
                <Textarea value={fsNote} onChange={(e) => setFsNote(e.target.value)} placeholder="T.ex. extra order pga kampanj..." className="text-xs min-h-[50px]" />
              </div>
            </div>
          )}

          {fsStep === 2 && (
            <div className="space-y-3">
              {fsLines.map((line, i) => {
                const prod = getProductByName(line.product);
                return (
                  <div key={i} className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">Rad {i + 1}</span>
                      {fsLines.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFsLine(i)}><X className="h-3 w-3" /></Button>
                      )}
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5 space-y-1">
                        <Label className="text-[10px]">Produkt *</Label>
                        <Select value={line.product} onValueChange={(v) => updateFsLine(i, "product", v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Välj produkt" /></SelectTrigger>
                          <SelectContent>{productCatalog.filter(p => p.stock > 0).map(p => <SelectItem key={p.name} value={p.name} className="text-xs">{p.name} ({p.stock} kg i lager)</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Kvantitet (kg) *</Label>
                        <Input value={line.qty} onChange={(e) => updateFsLine(i, "qty", e.target.value)} placeholder="kg" className="h-7 text-[11px]" type="number" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Grossistpris/kg</Label>
                        <div className="h-7 flex items-center px-2 rounded-md bg-muted text-[11px] font-medium text-primary">
                          {prod ? `${prod.wholesalePrice} kr` : "—"}
                        </div>
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Radtotal</Label>
                        <div className="h-7 flex items-center px-2 rounded-md bg-muted text-[11px] font-bold text-foreground">
                          {prod && line.qty ? `${(prod.wholesalePrice * Number(line.qty)).toLocaleString("sv-SE")} kr` : "—"}
                        </div>
                      </div>
                    </div>
                    {line.qty && prod && Number(line.qty) > prod.stock && (
                      <div className="flex items-center gap-1.5 text-[10px] text-destructive">
                        <AlertTriangle className="h-3 w-3" /> Kvantitet överstiger lagersaldo ({prod.stock} kg)
                      </div>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addFsLine}>
                <Plus className="h-3 w-3" /> Lägg till rad
              </Button>
              <div className="p-2 rounded-md bg-primary/5 border border-primary/10 text-[10px]">
                <span className="font-medium text-primary">Grossistpriset</span> hämtas automatiskt från produktkatalogen och visas på följesedeln. Detta pris blir <span className="font-bold">butikens inköpspris</span>.
              </div>
            </div>
          )}

          {fsStep === 3 && (
            <div className="space-y-3">
              <Card className="shadow-card">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-heading font-bold text-foreground">FÖLJESEDEL</p>
                      <p className="text-[10px] text-muted-foreground">FiskHandel Produktion/Grossist</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono font-bold text-foreground">FS-2026-0199</p>
                      <p className="text-[10px] text-muted-foreground">Datum: {new Date().toISOString().slice(0, 10)}</p>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div><span className="text-muted-foreground">Till butik:</span> <span className="font-medium">{fsStore}</span></div>
                    <div><span className="text-muted-foreground">Leveransdatum:</span> <span className="font-medium">{fsDeliveryDate}</span></div>
                  </div>
                  {fsNote && <p className="text-[10px] text-muted-foreground mb-3">Anteckning: {fsNote}</p>}

                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Kvantitet</th>
                        <th className="pb-1.5 text-right font-medium text-primary">Grossistpris/kg</th>
                        <th className="pb-1.5 text-right font-medium text-muted-foreground">Belopp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fsLinesWithPrices.map((line, i) => (
                        <tr key={i} className="border-b border-border/50 last:border-0">
                          <td className="py-1.5 font-medium text-foreground">{line.product}</td>
                          <td className="py-1.5 text-right text-foreground">{line.qty} kg</td>
                          <td className="py-1.5 text-right font-medium text-primary">{line.wholesalePrice} kr</td>
                          <td className="py-1.5 text-right font-medium text-foreground">{line.total.toLocaleString("sv-SE")} kr</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td className="py-2 font-bold text-foreground">Totalt</td>
                        <td className="py-2 text-right font-bold text-foreground">{fsLinesWithPrices.reduce((s, l) => s + Number(l.qty), 0)} kg</td>
                        <td className="py-2" />
                        <td className="py-2 text-right font-bold text-foreground">{fsLinesWithPrices.reduce((s, l) => s + l.total, 0).toLocaleString("sv-SE")} kr</td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="mt-3 p-2 rounded-md bg-accent/10 border border-accent/20 text-[10px]">
                    <span className="font-medium text-accent">Priser på denna följesedel = butikens inköpspris.</span> Butiken bestämmer sedan sitt eget försäljningspris till slutkund.
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="gap-2">
            {fsStep > 1 && <Button variant="outline" size="sm" className="text-xs" onClick={() => setFsStep((fsStep - 1) as 1 | 2)}>← Tillbaka</Button>}
            {fsStep < 3 ? (
              <Button size="sm" className="text-xs" onClick={() => setFsStep((fsStep + 1) as 2 | 3)}
                disabled={fsStep === 1 ? !fsStore : fsLines.every(l => !l.product || !l.qty)}>Nästa →</Button>
            ) : (
              <Button size="sm" className="text-xs gap-1.5" onClick={handleCreateFs}>
                <CheckCircle2 className="h-3 w-3" /> Skapa följesedel
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Visa följesedel dialog === */}
      <Dialog open={!!viewFsId} onOpenChange={(open) => { if (!open) setViewFsId(null); }}>
        <DialogContent className="max-w-lg">
          {viewedFs && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center justify-between">
                  <span>Följesedel {viewedFs.id}</span>
                  <Badge variant="outline" className={`${statusColor[viewedFs.status]} text-[10px]`}>{viewedFs.status}</Badge>
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {viewedFs.store} — Leveransdatum: {viewedFs.deliveryDate} — Skapad av: {viewedFs.createdBy}
                </DialogDescription>
              </DialogHeader>
              <Separator />
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                    <th className="pb-1.5 text-right font-medium text-muted-foreground">Kvantitet</th>
                    <th className="pb-1.5 text-right font-medium text-primary">Grossistpris/kg</th>
                    <th className="pb-1.5 text-right font-medium text-muted-foreground">Belopp</th>
                  </tr>
                </thead>
                <tbody>
                  {viewedFs.lines.map((line, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-1.5 font-medium text-foreground">{line.product}</td>
                      <td className="py-1.5 text-right text-foreground">{line.qty} {line.unit}</td>
                      <td className="py-1.5 text-right font-medium text-primary">{line.wholesalePrice} kr</td>
                      <td className="py-1.5 text-right font-medium text-foreground">{line.total.toLocaleString("sv-SE")} kr</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border">
                    <td className="py-2 font-bold">Totalt</td>
                    <td className="py-2 text-right font-bold">{viewedFs.totalKg} kg</td>
                    <td className="py-2" />
                    <td className="py-2 text-right font-bold">{viewedFs.totalAmount.toLocaleString("sv-SE")} kr</td>
                  </tr>
                </tfoot>
              </table>
              <div className="p-2 rounded-md bg-accent/10 border border-accent/20 text-[10px]">
                Priser på denna följesedel = <span className="font-bold text-accent">butikens inköpspris</span>
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => toast({ title: "Skriver ut...", description: `Följesedel ${viewedFs.id} skickas till skrivare` })}>
                  <Printer className="h-3 w-3" /> Skriv ut
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Price edit dialog */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Ändra priser — {selectedProduct?.name}</DialogTitle>
            <DialogDescription className="text-xs">SKU: {selectedProduct?.sku} · {selectedProduct?.origin}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Vårt inköpspris (från leverantör, kr/kg)</Label>
              <Input value={editCost} onChange={(e) => setEditCost(e.target.value)} className="h-8 text-xs" type="number" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-primary">Grossistpris (till butik = butikens inköpspris, kr/kg)</Label>
              <Input value={editWholesale} onChange={(e) => setEditWholesale(e.target.value)} className="h-8 text-xs border-primary" type="number" />
              <p className="text-[10px] text-primary">Detta pris visas på följesedeln och blir butikens inköpspris</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rekommenderat butikspris (slutkund, kr/kg)</Label>
              <Input value={editRetail} onChange={(e) => setEditRetail(e.target.value)} className="h-8 text-xs" type="number" />
              <p className="text-[10px] text-muted-foreground">Rekommendation — butiken bestämmer själv</p>
            </div>
            {editCost && editWholesale && editRetail && (
              <div className="p-2 rounded-md bg-muted/50 text-xs space-y-1">
                <p>Grossistmarginal (vår vinst): <span className="font-bold text-success">{Math.round(((Number(editWholesale) - Number(editCost)) / Number(editWholesale)) * 100)}%</span></p>
                <p>Butiksmarginal (om rek. pris): <span className="font-bold text-foreground">{Math.round(((Number(editRetail) - Number(editWholesale)) / Number(editRetail)) * 100)}%</span></p>
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
