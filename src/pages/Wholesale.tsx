import { useState } from "react";
import { motion } from "framer-motion";
import {
  Factory, Package, TrendingUp, Users, ShoppingCart, Plus, Search, FileText,
  DollarSign, Truck, CheckCircle2, Clock, Edit, AlertTriangle, X, Printer,
  ArrowRight, ArrowDown, History, BarChart3
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
import { Skeleton } from "@/components/ui/skeleton";

import { useProducts, useUpdateProduct } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import { useDeliveryNotes, useCreateDeliveryNote } from "@/hooks/useDeliveryNotes";
import { useIncomingDeliveries, useCreateIncomingDelivery } from "@/hooks/useIncomingDeliveries";
import { useProductionBatches, useCreateBatch, useUpdateBatchStatus } from "@/hooks/useProductionBatches";
import { usePriceHistory, useSuppliers } from "@/hooks/usePriceHistory";
import ShopOrderTab from "@/components/wholesale/ShopOrderTab";
import TtottiiiTab from "@/components/wholesale/TtottiiiTab";
import FakturaChTab from "@/components/wholesale/FakturaChTab";
import ProductBankTab from "@/components/wholesale/ProductBankTab";

const statusColor: Record<string, string> = {
  "Skickad": "bg-primary/10 text-primary border-primary/20",
  "Packad": "bg-warning/15 text-warning border-warning/20",
  "Levererad": "bg-success/15 text-success border-success/20",
  "Utkast": "bg-muted text-muted-foreground border-muted",
  "Klar": "bg-success/15 text-success border-success/20",
  "Pågår": "bg-warning/15 text-warning border-warning/20",
  "Planerad": "bg-muted text-muted-foreground border-muted",
  "Mottagen": "bg-success/15 text-success border-success/20",
  "Kontrolleras": "bg-warning/15 text-warning border-warning/20",
};

interface FSLineInput { product_id: string; qty: string; }
interface ILLineInput { product_id: string; qty: string; unit_cost: string; batch_number: string; best_before: string; }

export default function Wholesale() {
  const [search, setSearch] = useState("");
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [fsDialogOpen, setFsDialogOpen] = useState(false);
  const [ilDialogOpen, setIlDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [fsStep, setFsStep] = useState<1 | 2 | 3>(1);
  const [viewFsId, setViewFsId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [editCost, setEditCost] = useState("");
  const [editWholesale, setEditWholesale] = useState("");
  const [editRetail, setEditRetail] = useState("");
  const [editReason, setEditReason] = useState("");
  const { toast } = useToast();

  // FS form
  const [fsStore, setFsStore] = useState("");
  const [fsDeliveryDate, setFsDeliveryDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [fsNote, setFsNote] = useState("");
  const [fsLines, setFsLines] = useState<FSLineInput[]>([{ product_id: "", qty: "" }]);

  // IL form
  const [ilSupplier, setIlSupplier] = useState("");
  const [ilDate, setIlDate] = useState(new Date().toISOString().slice(0, 10));
  const [ilReceivedBy, setIlReceivedBy] = useState("");
  const [ilNote, setIlNote] = useState("");
  const [ilLines, setIlLines] = useState<ILLineInput[]>([{ product_id: "", qty: "", unit_cost: "", batch_number: "", best_before: "" }]);

  // Batch form
  const [batchProductId, setBatchProductId] = useState("");
  const [batchDesc, setBatchDesc] = useState("");
  const [batchQty, setBatchQty] = useState("");
  const [batchDate, setBatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [batchStart, setBatchStart] = useState("");
  const [batchEnd, setBatchEnd] = useState("");
  const [batchOperator, setBatchOperator] = useState("");

  // Queries
  const { data: products = [], isLoading: loadingProducts } = useProducts();
  const { data: stores = [] } = useStores(true);
  const { data: deliveryNotes = [], isLoading: loadingDN } = useDeliveryNotes();
  const { data: incomingDeliveries = [], isLoading: loadingIL } = useIncomingDeliveries();
  const { data: batches = [], isLoading: loadingBatches } = useProductionBatches();
  const { data: priceHistory = [] } = usePriceHistory(selectedProductId || undefined);
  const { data: suppliers = [] } = useSuppliers();

  // Mutations
  const updateProduct = useUpdateProduct();
  const createDeliveryNote = useCreateDeliveryNote();
  const createIncomingDelivery = useCreateIncomingDelivery();
  const createBatch = useCreateBatch();
  const updateBatchStatus = useUpdateBatchStatus();

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // FS helpers
  const resetFsForm = () => { setFsStep(1); setFsStore(""); setFsDeliveryDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10)); setFsNote(""); setFsLines([{ product_id: "", qty: "" }]); };
  const addFsLine = () => setFsLines([...fsLines, { product_id: "", qty: "" }]);
  const removeFsLine = (i: number) => setFsLines(fsLines.filter((_, idx) => idx !== i));
  const updateFsLine = (i: number, field: keyof FSLineInput, value: string) => { const u = [...fsLines]; u[i] = { ...u[i], [field]: value }; setFsLines(u); };

  const fsLinesWithPrices = fsLines.filter(l => l.product_id && l.qty).map(l => {
    const p = products.find(pr => pr.id === l.product_id);
    return { ...l, name: p?.name ?? "", wholesalePrice: p?.wholesale_price ?? 0, total: (p?.wholesale_price ?? 0) * Number(l.qty), stock: p?.stock ?? 0 };
  });

  // IL helpers
  const resetIlForm = () => { setIlSupplier(""); setIlDate(new Date().toISOString().slice(0, 10)); setIlReceivedBy(""); setIlNote(""); setIlLines([{ product_id: "", qty: "", unit_cost: "", batch_number: "", best_before: "" }]); };
  const addIlLine = () => setIlLines([...ilLines, { product_id: "", qty: "", unit_cost: "", batch_number: "", best_before: "" }]);
  const removeIlLine = (i: number) => setIlLines(ilLines.filter((_, idx) => idx !== i));
  const updateIlLine = (i: number, field: keyof ILLineInput, value: string) => { const u = [...ilLines]; u[i] = { ...u[i], [field]: value }; setIlLines(u); };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  );

  const totalStockValue = products.reduce((s, p) => s + Number(p.stock) * Number(p.cost_price), 0);
  const totalWholesaleValue = products.reduce((s, p) => s + Number(p.stock) * Number(p.wholesale_price), 0);
  const avgMargin = products.length > 0 ? Math.round(products.reduce((s, p) => s + ((Number(p.wholesale_price) - Number(p.cost_price)) / Number(p.wholesale_price)) * 100, 0) / products.length) : 0;

  const openPriceDialog = (product: typeof products[0]) => {
    setSelectedProductId(product.id);
    setEditCost(String(product.cost_price));
    setEditWholesale(String(product.wholesale_price));
    setEditRetail(String(product.retail_suggested ?? 0));
    setEditReason("");
    setPriceDialogOpen(true);
  };

  const handleSavePrice = () => {
    if (!selectedProductId) return;
    updateProduct.mutate({
      id: selectedProductId,
      cost_price: Number(editCost),
      wholesale_price: Number(editWholesale),
      retail_suggested: Number(editRetail),
      reason: editReason,
    }, {
      onSuccess: () => {
        toast({ title: "Priser uppdaterade", description: `${selectedProduct?.name}: Grossist ${editWholesale} kr/kg` });
        setPriceDialogOpen(false);
      },
    });
  };

  const handleCreateFs = () => {
    const validLines = fsLines.filter(l => l.product_id && l.qty).map(l => {
      const p = products.find(pr => pr.id === l.product_id);
      return { product_id: l.product_id, quantity: Number(l.qty), wholesale_price: p?.wholesale_price ?? 0 };
    });
    createDeliveryNote.mutate({
      store_id: fsStore,
      delivery_date: fsDeliveryDate,
      notes: fsNote || undefined,
      lines: validLines,
    }, {
      onSuccess: (dn) => {
        toast({ title: "Följesedel skapad", description: `${dn.note_number} — sparad i databasen` });
        setFsDialogOpen(false);
        resetFsForm();
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  const handleCreateIl = () => {
    const validLines = ilLines.filter(l => l.product_id && l.qty && l.unit_cost).map(l => ({
      product_id: l.product_id, quantity: Number(l.qty), unit_cost: Number(l.unit_cost),
      batch_number: l.batch_number || undefined, best_before: l.best_before || undefined,
    }));
    createIncomingDelivery.mutate({
      supplier_id: ilSupplier,
      received_date: ilDate,
      received_by: ilReceivedBy || "Admin",
      notes: ilNote || undefined,
      lines: validLines,
    }, {
      onSuccess: (d) => {
        toast({ title: "Inleverans registrerad", description: `${d.delivery_number} — lagersaldo uppdaterat` });
        setIlDialogOpen(false);
        resetIlForm();
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  const handleCreateBatch = () => {
    createBatch.mutate({
      product_id: batchProductId,
      description: batchDesc || undefined,
      quantity: Number(batchQty),
      planned_date: batchDate,
      start_time: batchStart || undefined,
      end_time: batchEnd || undefined,
      operator: batchOperator || undefined,
    }, {
      onSuccess: () => {
        toast({ title: "Beredning skapad" });
        setBatchDialogOpen(false);
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  const viewedFs = viewFsId ? deliveryNotes.find((fs: any) => fs.id === viewFsId) : null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayDNCount = deliveryNotes.filter((d: any) => d.created_date === todayStr).length;

  if (loadingProducts) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-5 gap-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }

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
          <p className="text-xs text-muted-foreground">Centrallager — alla data sparas permanent i databasen</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setIlDialogOpen(true); resetIlForm(); }}>
            <Package className="h-3 w-3" /> Ny inleverans
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
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><FileText className="h-3.5 w-3.5 text-warning" /><p className="text-[10px] text-muted-foreground">Följesedlar idag</p></div><p className="text-lg font-heading font-bold text-foreground">{todayDNCount}</p></CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3"><div className="flex items-center gap-1.5 mb-1"><Package className="h-3.5 w-3.5 text-primary" /><p className="text-[10px] text-muted-foreground">Inleveranser</p></div><p className="text-lg font-heading font-bold text-foreground">{incomingDeliveries.length}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="shop-orders" className="space-y-3">
        <TabsList className="h-8 flex-wrap">
          <TabsTrigger value="shop-orders" className="text-xs h-7">📋 Beställningar</TabsTrigger>
          <TabsTrigger value="ttottiii" className="text-xs h-7">📊 TTOTTIII</TabsTrigger>
          <TabsTrigger value="product-bank" className="text-xs h-7">🐟 Produktbank</TabsTrigger>
          <TabsTrigger value="delivery-notes" className="text-xs h-7">Följesedlar</TabsTrigger>
          <TabsTrigger value="incoming" className="text-xs h-7">Inleveranser</TabsTrigger>
          <TabsTrigger value="catalog" className="text-xs h-7">Priser</TabsTrigger>
          <TabsTrigger value="production" className="text-xs h-7">Produktion</TabsTrigger>
          <TabsTrigger value="faktura-ch" className="text-xs h-7">🇨🇭 Faktura CH</TabsTrigger>
        </TabsList>

        <TabsContent value="shop-orders"><ShopOrderTab /></TabsContent>
        <TabsContent value="ttottiii"><TtottiiiTab /></TabsContent>
        <TabsContent value="product-bank"><ProductBankTab /></TabsContent>
        <TabsContent value="faktura-ch"><FakturaChTab /></TabsContent>

        {/* Tab 1: Följesedlar */}
        <TabsContent value="delivery-notes">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Följesedlar till butiker</CardTitle>
                  <CardDescription className="text-xs">Grossistpris = butikens inköpspris. Data hämtas från databasen.</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={() => { setFsDialogOpen(true); resetFsForm(); }}>
                  <Plus className="h-3 w-3" /> Ny följesedel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingDN ? <Skeleton className="h-48" /> : deliveryNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga följesedlar ännu. Klicka "Ny följesedel" för att skapa den första.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">FS-nr</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Skapad</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Leveransdatum</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Vikt</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Belopp</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveryNotes.map((dn: any) => (
                        <tr key={dn.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setViewFsId(dn.id)}>
                          <td className="py-2 font-mono font-medium text-foreground">{dn.note_number}</td>
                          <td className="py-2 text-foreground">{dn.stores?.name}</td>
                          <td className="py-2 text-muted-foreground">{dn.created_date}</td>
                          <td className="py-2 text-muted-foreground">{dn.delivery_date}</td>
                          <td className="py-2 text-right text-foreground">{dn.delivery_note_lines?.length ?? 0}</td>
                          <td className="py-2 text-right text-foreground">{Number(dn.total_weight).toLocaleString("sv-SE")} kg</td>
                          <td className="py-2 text-right font-medium text-foreground">{Number(dn.total_amount).toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-right">
                            <Badge variant="outline" className={`${statusColor[dn.status] || ""} text-[10px]`}>{dn.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Inleveranser */}
        <TabsContent value="incoming">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Inleveranser från leverantörer</CardTitle>
                  <CardDescription className="text-xs">Varor som anländer till grossisten — lagersaldo uppdateras automatiskt</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={() => { setIlDialogOpen(true); resetIlForm(); }}>
                  <Plus className="h-3 w-3" /> Ny inleverans
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingIL ? <Skeleton className="h-48" /> : incomingDeliveries.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga inleveranser registrerade ännu.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">IL-nr</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Leverantör</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Vikt</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Kostnad</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Mottagen av</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomingDeliveries.map((il: any) => (
                        <tr key={il.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-mono font-medium text-foreground">{il.delivery_number}</td>
                          <td className="py-2 text-foreground">{il.suppliers?.name}</td>
                          <td className="py-2 text-muted-foreground">{il.received_date}</td>
                          <td className="py-2 text-right text-foreground">{il.incoming_delivery_lines?.length ?? 0}</td>
                          <td className="py-2 text-right text-foreground">{Number(il.total_weight).toLocaleString("sv-SE")} kg</td>
                          <td className="py-2 text-right font-medium text-foreground">{Number(il.total_cost).toLocaleString("sv-SE")} kr</td>
                          <td className="py-2 text-muted-foreground">{il.received_by}</td>
                          <td className="py-2 text-right">
                            <Badge variant="outline" className={`${statusColor[il.status] || ""} text-[10px]`}>{il.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Produktkatalog */}
        <TabsContent value="catalog">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktkatalog & Prissättning</CardTitle>
                  <CardDescription className="text-xs">Inköp → Grossistpris (butikens inköpspris) → Rek. butik. Klicka ✏️ för att ändra priser. Prishistorik sparas.</CardDescription>
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
                      <th className="pb-2 text-right font-medium text-muted-foreground">Marginal</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Rek. butik/kg</th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">Lager</th>
                      <th className="pb-2 text-left font-medium text-muted-foreground">Ursprung</th>
                      <th className="pb-2 text-center font-medium text-muted-foreground">Åtgärd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((product) => {
                      const gm = Math.round(((Number(product.wholesale_price) - Number(product.cost_price)) / Number(product.wholesale_price)) * 100);
                      return (
                        <tr key={product.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-mono text-muted-foreground">{product.sku}</td>
                          <td className="py-2 font-medium text-foreground">{product.name}</td>
                          <td className="py-2 text-muted-foreground">{product.category}</td>
                          <td className="py-2 text-right text-muted-foreground">{Number(product.cost_price)} kr</td>
                          <td className="py-2 text-right font-bold text-primary">{Number(product.wholesale_price)} kr</td>
                          <td className="py-2 text-right">
                            <span className={gm >= 25 ? "text-success font-medium" : gm >= 20 ? "text-foreground" : "text-warning font-medium"}>{gm}%</span>
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{Number(product.retail_suggested ?? 0)} kr</td>
                          <td className="py-2 text-right">
                            {Number(product.stock) === 0 ? (
                              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Slut</Badge>
                            ) : (
                              <span className="text-foreground">{Number(product.stock).toLocaleString("sv-SE")} kg</span>
                            )}
                          </td>
                          <td className="py-2 text-muted-foreground">{product.origin}</td>
                          <td className="py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openPriceDialog(product)} title="Ändra priser">
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedProductId(product.id); setHistoryDialogOpen(true); }} title="Prishistorik">
                                <History className="h-3 w-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-2 rounded-md bg-primary/5 border border-primary/10 text-[10px] text-foreground">
                <span className="font-semibold text-primary">Grossistpriset</span> visas på följesedeln och blir butikens inköpspris. Alla prisändringar loggas i historiken.
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
                  <CardTitle className="text-sm font-heading">Produktionsplan</CardTitle>
                  <CardDescription className="text-xs">Filering, skalning, marinering — klicka status för att uppdatera</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={() => setBatchDialogOpen(true)}>
                  <Plus className="h-3 w-3" /> Lägg till beredning
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingBatches ? <Skeleton className="h-48" /> : batches.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga beredningar planerade.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Batch</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Datum</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Tid</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Operatör</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Svinn</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches.map((item: any) => (
                        <tr key={item.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="py-2 font-medium text-foreground">{item.products?.name}{item.description ? ` (${item.description})` : ""}</td>
                          <td className="py-2 font-mono text-muted-foreground text-[10px]">{item.batch_number}</td>
                          <td className="py-2 text-right text-foreground">{Number(item.quantity)} {item.unit}</td>
                          <td className="py-2 text-muted-foreground">{item.planned_date}</td>
                          <td className="py-2 text-muted-foreground">{item.start_time || "–"}–{item.end_time || "–"}</td>
                          <td className="py-2 text-muted-foreground">{item.operator || "–"}</td>
                          <td className="py-2 text-right text-muted-foreground">{Number(item.waste_kg || 0)} kg</td>
                          <td className="py-2 text-right">
                            <Select value={item.status} onValueChange={(v) => updateBatchStatus.mutate({ id: item.id, status: v })}>
                              <SelectTrigger className="h-6 w-24 text-[10px] border-0 p-0 justify-end">
                                <Badge variant="outline" className={`${statusColor[item.status] || ""} text-[10px]`}>{item.status}</Badge>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Planerad" className="text-xs">Planerad</SelectItem>
                                <SelectItem value="Pågår" className="text-xs">Pågår</SelectItem>
                                <SelectItem value="Klar" className="text-xs">Klar</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {batches.length > 0 && (
                <div className="mt-3 p-2 rounded-md bg-muted/40 text-[10px] text-muted-foreground">
                  Total: <span className="font-bold text-foreground">{batches.reduce((s: number, i: any) => s + Number(i.quantity), 0)} kg</span> · 
                  {batches.filter((i: any) => i.status === "Klar").length} klara · 
                  {batches.filter((i: any) => i.status === "Pågår").length} pågår · 
                  {batches.filter((i: any) => i.status === "Planerad").length} planerade · 
                  Svinn: {batches.reduce((s: number, i: any) => s + Number(i.waste_kg || 0), 0)} kg
                </div>
              )}
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
              {fsStep === 2 && "Grossistpriset hämtas automatiskt och blir butikens inköpspris."}
              {fsStep === 3 && "Kontrollera att allt stämmer innan du skickar."}
            </DialogDescription>
          </DialogHeader>
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
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
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
                const prod = products.find(p => p.id === line.product_id);
                return (
                  <div key={i} className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-muted-foreground">Rad {i + 1}</span>
                      {fsLines.length > 1 && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeFsLine(i)}><X className="h-3 w-3" /></Button>}
                    </div>
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5 space-y-1">
                        <Label className="text-[10px]">Produkt *</Label>
                        <Select value={line.product_id} onValueChange={(v) => updateFsLine(i, "product_id", v)}>
                          <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Välj produkt" /></SelectTrigger>
                          <SelectContent>{products.filter(p => Number(p.stock) > 0).map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({Number(p.stock)} kg)</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Kvantitet (kg) *</Label>
                        <Input value={line.qty} onChange={(e) => updateFsLine(i, "qty", e.target.value)} placeholder="kg" className="h-7 text-[11px]" type="number" />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-[10px]">Grossistpris/kg</Label>
                        <div className="h-7 flex items-center px-2 rounded-md bg-muted text-[11px] font-medium text-primary">
                          {prod ? `${Number(prod.wholesale_price)} kr` : "—"}
                        </div>
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-[10px]">Radtotal</Label>
                        <div className="h-7 flex items-center px-2 rounded-md bg-muted text-[11px] font-bold text-foreground">
                          {prod && line.qty ? `${(Number(prod.wholesale_price) * Number(line.qty)).toLocaleString("sv-SE")} kr` : "—"}
                        </div>
                      </div>
                    </div>
                    {line.qty && prod && Number(line.qty) > Number(prod.stock) && (
                      <div className="flex items-center gap-1.5 text-[10px] text-destructive"><AlertTriangle className="h-3 w-3" /> Överstiger lager ({Number(prod.stock)} kg)</div>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addFsLine}><Plus className="h-3 w-3" /> Lägg till rad</Button>
            </div>
          )}

          {fsStep === 3 && (
            <div className="space-y-3">
              <Card className="shadow-card">
                <CardContent className="p-3">
                  <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div><span className="text-muted-foreground">Till butik:</span> <span className="font-medium">{stores.find(s => s.id === fsStore)?.name}</span></div>
                    <div><span className="text-muted-foreground">Leveransdatum:</span> <span className="font-medium">{fsDeliveryDate}</span></div>
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="border-b border-border"><th className="pb-1.5 text-left text-muted-foreground">Produkt</th><th className="pb-1.5 text-right text-muted-foreground">Kvantitet</th><th className="pb-1.5 text-right text-primary">Grossistpris/kg</th><th className="pb-1.5 text-right text-muted-foreground">Belopp</th></tr></thead>
                    <tbody>
                      {fsLinesWithPrices.map((line, i) => (
                        <tr key={i} className="border-b border-border/50"><td className="py-1.5 text-foreground">{line.name}</td><td className="py-1.5 text-right">{line.qty} kg</td><td className="py-1.5 text-right text-primary">{line.wholesalePrice} kr</td><td className="py-1.5 text-right font-medium">{line.total.toLocaleString("sv-SE")} kr</td></tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t-2 border-border"><td className="py-2 font-bold">Totalt</td><td className="py-2 text-right font-bold">{fsLinesWithPrices.reduce((s, l) => s + Number(l.qty), 0)} kg</td><td></td><td className="py-2 text-right font-bold">{fsLinesWithPrices.reduce((s, l) => s + l.total, 0).toLocaleString("sv-SE")} kr</td></tr></tfoot>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="gap-2">
            {fsStep > 1 && <Button variant="outline" size="sm" onClick={() => setFsStep((fsStep - 1) as 1 | 2)}>Tillbaka</Button>}
            {fsStep < 3 && <Button size="sm" onClick={() => setFsStep((fsStep + 1) as 2 | 3)} disabled={fsStep === 1 && !fsStore}>Nästa</Button>}
            {fsStep === 3 && <Button size="sm" onClick={handleCreateFs} disabled={createDeliveryNote.isPending}>{createDeliveryNote.isPending ? "Sparar..." : "Skapa & skicka"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Inleverans dialog === */}
      <Dialog open={ilDialogOpen} onOpenChange={(open) => { setIlDialogOpen(open); if (!open) resetIlForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ny inleverans från leverantör</DialogTitle>
            <DialogDescription className="text-xs">Registrera varor som anländer till grossisten. Lagersaldo uppdateras automatiskt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Leverantör *</Label>
                <Select value={ilSupplier} onValueChange={setIlSupplier}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj leverantör" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name} ({s.country})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mottagningsdatum</Label>
                <Input type="date" value={ilDate} onChange={e => setIlDate(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Mottagen av</Label>
                <Input value={ilReceivedBy} onChange={e => setIlReceivedBy(e.target.value)} placeholder="Namn" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Anteckning</Label>
                <Input value={ilNote} onChange={e => setIlNote(e.target.value)} placeholder="Valfritt..." className="h-8 text-xs" />
              </div>
            </div>
            <Separator />
            <p className="text-xs font-medium text-foreground">Produktrader</p>
            {ilLines.map((line, i) => (
              <div key={i} className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground">Rad {i + 1}</span>
                  {ilLines.length > 1 && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeIlLine(i)}><X className="h-3 w-3" /></Button>}
                </div>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4 space-y-1">
                    <Label className="text-[10px]">Produkt *</Label>
                    <Select value={line.product_id} onValueChange={v => updateIlLine(i, "product_id", v)}>
                      <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Välj" /></SelectTrigger>
                      <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Kvantitet (kg) *</Label>
                    <Input value={line.qty} onChange={e => updateIlLine(i, "qty", e.target.value)} className="h-7 text-[11px]" type="number" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Inköpspris/kg *</Label>
                    <Input value={line.unit_cost} onChange={e => updateIlLine(i, "unit_cost", e.target.value)} className="h-7 text-[11px]" type="number" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Batchnr</Label>
                    <Input value={line.batch_number} onChange={e => updateIlLine(i, "batch_number", e.target.value)} className="h-7 text-[11px]" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-[10px]">Bäst före</Label>
                    <Input type="date" value={line.best_before} onChange={e => updateIlLine(i, "best_before", e.target.value)} className="h-7 text-[11px]" />
                  </div>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addIlLine}><Plus className="h-3 w-3" /> Lägg till rad</Button>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleCreateIl} disabled={!ilSupplier || ilLines.every(l => !l.product_id || !l.qty || !l.unit_cost) || createIncomingDelivery.isPending}>
              {createIncomingDelivery.isPending ? "Sparar..." : "Registrera inleverans"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Batch dialog === */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Ny beredning</DialogTitle>
            <DialogDescription className="text-xs">Planera filering, skalning eller annan beredning.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Produkt *</Label>
              <Select value={batchProductId} onValueChange={setBatchProductId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beskrivning (t.ex. "filé")</Label>
              <Input value={batchDesc} onChange={e => setBatchDesc(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Kvantitet (kg) *</Label><Input value={batchQty} onChange={e => setBatchQty(e.target.value)} type="number" className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Start</Label><Input value={batchStart} onChange={e => setBatchStart(e.target.value)} placeholder="06:00" className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Slut</Label><Input value={batchEnd} onChange={e => setBatchEnd(e.target.value)} placeholder="10:00" className="h-8 text-xs" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Datum</Label><Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Operatör</Label><Input value={batchOperator} onChange={e => setBatchOperator(e.target.value)} className="h-8 text-xs" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleCreateBatch} disabled={!batchProductId || !batchQty || createBatch.isPending}>
              {createBatch.isPending ? "Sparar..." : "Skapa beredning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Prisredigering === */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Ändra priser — {selectedProduct?.name}</DialogTitle>
            <DialogDescription className="text-xs">Prisändringen sparas och loggas i historiken.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Inköpspris/kg</Label><Input value={editCost} onChange={e => setEditCost(e.target.value)} type="number" className="h-8 text-xs" /></div>
              <div className="space-y-1.5"><Label className="text-xs text-primary font-medium">Grossistpris/kg</Label><Input value={editWholesale} onChange={e => setEditWholesale(e.target.value)} type="number" className="h-8 text-xs border-primary/30" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Rek. butik/kg</Label><Input value={editRetail} onChange={e => setEditRetail(e.target.value)} type="number" className="h-8 text-xs" /></div>
            </div>
            {editCost && editWholesale && (
              <div className="p-2 rounded bg-muted/40 text-xs">
                Grossistmarginal: <span className="font-bold">{Math.round(((Number(editWholesale) - Number(editCost)) / Number(editWholesale)) * 100)}%</span>
                {editRetail && <> · Butiksmarginal (rek): <span className="font-bold">{Math.round(((Number(editRetail) - Number(editWholesale)) / Number(editRetail)) * 100)}%</span></>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Anledning till ändring</Label>
              <Input value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="T.ex. ny leverantörsöverenskommelse" className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleSavePrice} disabled={updateProduct.isPending}>{updateProduct.isPending ? "Sparar..." : "Spara priser"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Prishistorik === */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Prishistorik — {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          {priceHistory.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Inga prisändringar registrerade.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b"><th className="pb-1.5 text-left text-muted-foreground">Datum</th><th className="pb-1.5 text-right text-muted-foreground">Inköp</th><th className="pb-1.5 text-right text-primary">Grossist</th><th className="pb-1.5 text-right text-muted-foreground">Rek. butik</th><th className="pb-1.5 text-left text-muted-foreground">Anledning</th></tr></thead>
                <tbody>
                  {priceHistory.map((ph: any) => (
                    <tr key={ph.id} className="border-b border-border/50"><td className="py-1.5 text-muted-foreground">{new Date(ph.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</td><td className="py-1.5 text-right">{ph.cost_price} kr</td><td className="py-1.5 text-right text-primary font-medium">{ph.wholesale_price} kr</td><td className="py-1.5 text-right">{ph.retail_suggested} kr</td><td className="py-1.5 text-muted-foreground">{ph.reason || "–"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* === Visa följesedel === */}
      <Dialog open={!!viewFsId} onOpenChange={(open) => { if (!open) setViewFsId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Följesedel {viewedFs?.note_number}</DialogTitle>
          </DialogHeader>
          {viewedFs && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Butik:</span> <span className="font-medium">{(viewedFs as any).stores?.name}</span></div>
                <div><span className="text-muted-foreground">Leveransdatum:</span> <span className="font-medium">{viewedFs.delivery_date}</span></div>
                <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={`${statusColor[viewedFs.status] || ""} text-[10px] ml-1`}>{viewedFs.status}</Badge></div>
                <div><span className="text-muted-foreground">Skapad av:</span> <span className="font-medium">{viewedFs.created_by}</span></div>
              </div>
              <Separator />
              <table className="w-full text-xs">
                <thead><tr className="border-b"><th className="pb-1.5 text-left text-muted-foreground">Produkt</th><th className="pb-1.5 text-right text-muted-foreground">Kvantitet</th><th className="pb-1.5 text-right text-primary">Grossistpris</th><th className="pb-1.5 text-right text-muted-foreground">Belopp</th></tr></thead>
                <tbody>
                  {((viewedFs as any).delivery_note_lines || []).map((line: any) => (
                    <tr key={line.id} className="border-b border-border/50"><td className="py-1.5">{line.products?.name}</td><td className="py-1.5 text-right">{Number(line.quantity)} kg</td><td className="py-1.5 text-right text-primary">{Number(line.wholesale_price)} kr</td><td className="py-1.5 text-right font-medium">{Number(line.total).toLocaleString("sv-SE")} kr</td></tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2"><td className="py-2 font-bold">Totalt</td><td className="py-2 text-right font-bold">{Number(viewedFs.total_weight)} kg</td><td></td><td className="py-2 text-right font-bold">{Number(viewedFs.total_amount).toLocaleString("sv-SE")} kr</td></tr></tfoot>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
