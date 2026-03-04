import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ScanLine, Camera, Printer, Search, Plus, Tag, Package,
  CheckCircle2, AlertTriangle, ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import { useStorageLocations, useUpsertStockLocation } from "@/hooks/useStorageLocations";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import BarcodeScanner from "@/components/barcode/BarcodeScanner";
import BarcodeDisplay from "@/components/barcode/BarcodeDisplay";
import BarcodeLabel from "@/components/barcode/BarcodeLabel";
import { generateEAN13, isValidEAN13 } from "@/lib/barcode";

type ScanMode = "lookup" | "inventory" | "receive" | "deliver";

export default function BarcodePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const { data: stores = [] } = useStores();
  const { data: locations = [] } = useStorageLocations();
  const upsertStock = useUpsertStockLocation();

  const [scanMode, setScanMode] = useState<ScanMode>("lookup");
  const [showScanner, setShowScanner] = useState(false);
  const [scannedProduct, setScannedProduct] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);

  // Action form
  const [actionQty, setActionQty] = useState("");
  const [actionLocation, setActionLocation] = useState("");

  // Generate form
  const [genSelectedProducts, setGenSelectedProducts] = useState<string[]>([]);

  const handleScan = (code: string) => {
    const product = products.find((p: any) => (p as any).barcode === code);
    if (product) {
      setScannedProduct(product);
      toast({ title: "Produkt hittad!", description: product.name });
      if (scanMode !== "lookup") {
        setActionDialogOpen(true);
      }
    } else {
      toast({
        title: "Okänd streckkod",
        description: `Kod: ${code} — ingen produkt matchade`,
        variant: "destructive",
      });
    }
    setShowScanner(false);
  };

  const handleGenerateBarcodes = async () => {
    if (genSelectedProducts.length === 0) return;
    // Find products without barcodes and generate
    let seq = products.filter((p: any) => (p as any).barcode).length + 1;
    for (const pid of genSelectedProducts) {
      const product = products.find(p => p.id === pid);
      if (!product || (product as any).barcode) continue;
      const barcode = generateEAN13("20", seq++);
      await supabase.from("products").update({ barcode }).eq("id", pid);
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Streckkoder genererade", description: `${genSelectedProducts.length} produkter uppdaterade` });
    setGenerateDialogOpen(false);
    setGenSelectedProducts([]);
  };

  const handleGenerateAll = async () => {
    const withoutBarcode = products.filter((p: any) => !(p as any).barcode);
    if (withoutBarcode.length === 0) { toast({ title: "Alla har redan streckkoder" }); return; }
    let seq = products.filter((p: any) => (p as any).barcode).length + 1;
    for (const p of withoutBarcode) {
      const barcode = generateEAN13("20", seq++);
      await supabase.from("products").update({ barcode }).eq("id", p.id);
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Klart!", description: `${withoutBarcode.length} streckkoder genererade` });
    setGenerateDialogOpen(false);
  };

  const handleAction = () => {
    if (!scannedProduct || !actionQty || !actionLocation) return;
    const qty = Number(actionQty);
    upsertStock.mutate({
      product_id: scannedProduct.id,
      location_id: actionLocation,
      quantity: qty,
    }, {
      onSuccess: () => {
        const modeText = scanMode === "receive" ? "Inleverans registrerad" : scanMode === "deliver" ? "Utleverans registrerad" : "Inventering sparad";
        toast({ title: modeText, description: `${scannedProduct.name}: ${qty} ${scannedProduct.unit}` });
        setActionDialogOpen(false);
        setActionQty("");
        setActionLocation("");
      },
    });
  };

  const productsWithBarcode = products.filter((p: any) => (p as any).barcode);
  const productsWithoutBarcode = products.filter((p: any) => !(p as any).barcode);

  const filteredProducts = productsWithBarcode.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    ((p as any).barcode || "").includes(search)
  );

  const handlePrintAll = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    const labels = filteredProducts.map((p: any) => `
      <div class="label">
        <div class="name">${p.name}</div>
        <div class="sku">${p.sku}</div>
        <svg id="bc-${p.id}"></svg>
        <div class="price">${Number(p.wholesale_price)} kr/${p.unit}</div>
      </div>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Streckkoder</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: Arial; margin: 0; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .label { border: 1px solid #ddd; padding: 8px; text-align: center; break-inside: avoid; }
        .name { font-size: 11px; font-weight: bold; }
        .sku { font-size: 9px; color: #666; margin-bottom: 4px; }
        .price { font-size: 11px; font-weight: bold; margin-top: 2px; }
        svg { max-width: 100%; height: 50px; }
      </style></head><body>
      <div class="grid">${labels}</div>
      <script>
        ${filteredProducts.map((p: any) => `try{JsBarcode("#bc-${p.id}","${(p as any).barcode}",{format:"EAN13",width:1.5,height:40,displayValue:true,fontSize:10,margin:4})}catch(e){}`).join(";")}
        setTimeout(()=>{window.print();},500);
      <\/script></body></html>
    `);
    printWindow.document.close();
  };

  if (isLoading) return <div className="p-4"><Skeleton className="h-96" /></div>;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Streckkoder & Skanning</h2>
          <p className="text-xs text-muted-foreground">Scanna, generera och skriv ut EAN-13 streckkoder</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setGenerateDialogOpen(true)}>
            <Tag className="h-3 w-3" /> Generera koder
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={handlePrintAll}>
            <Printer className="h-3 w-3" /> Skriv ut alla
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Med streckkod</p>
          <p className="text-xl font-heading font-bold text-success">{productsWithBarcode.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Utan streckkod</p>
          <p className="text-xl font-heading font-bold text-destructive">{productsWithoutBarcode.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt produkter</p>
          <p className="text-xl font-heading font-bold text-foreground">{products.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Lagerställen</p>
          <p className="text-xl font-heading font-bold text-foreground">{locations.length}</p>
        </CardContent></Card>
      </div>

      {/* Scanner section */}
      <Card className="shadow-card border-primary/10">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Snabbskanning</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Select value={scanMode} onValueChange={v => setScanMode(v as ScanMode)}>
                <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lookup" className="text-xs">🔍 Slå upp produkt</SelectItem>
                  <SelectItem value="inventory" className="text-xs">📋 Inventering</SelectItem>
                  <SelectItem value="receive" className="text-xs">📦 Inleverans</SelectItem>
                  <SelectItem value="deliver" className="text-xs">🚚 Utleverans</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowScanner(!showScanner)}>
                <Camera className="h-3 w-3" /> {showScanner ? "Stäng kamera" : "Öppna kamera"}
              </Button>
            </div>
          </div>

          {showScanner && (
            <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
          )}

          {scannedProduct && !showScanner && (
            <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <div>
                  <p className="text-sm font-medium text-foreground">{scannedProduct.name}</p>
                  <p className="text-[10px] text-muted-foreground">SKU: {scannedProduct.sku} · Streckkod: {(scannedProduct as any).barcode} · Lager: {Number(scannedProduct.stock)} {scannedProduct.unit}</p>
                </div>
                {scanMode !== "lookup" && (
                  <Button size="sm" className="ml-auto text-xs h-7" onClick={() => setActionDialogOpen(true)}>
                    {scanMode === "inventory" ? "Registrera antal" : scanMode === "receive" ? "Ta emot" : "Leverera"}
                  </Button>
                )}
              </div>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground mt-2">
            💡 Välj läge, öppna kameran och scanna en EAN-13 streckkod. Produkten hittas automatiskt i systemet.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="labels" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="labels" className="text-xs h-7">🏷️ Streckkoder & Etiketter</TabsTrigger>
          <TabsTrigger value="missing" className="text-xs h-7">⚠️ Saknar streckkod ({productsWithoutBarcode.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="labels">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produktetiketter</CardTitle>
                  <CardDescription className="text-xs">Klicka "Skriv ut" på en etikett eller skriv ut alla på en gång.</CardDescription>
                </div>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Sök produkt/kod..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {filteredProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga produkter med streckkoder. Klicka "Generera koder" ovan.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredProducts.map((p: any) => (
                    <BarcodeLabel
                      key={p.id}
                      barcode={(p as any).barcode}
                      productName={p.name}
                      sku={p.sku}
                      price={Number(p.wholesale_price)}
                      unit={p.unit}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Produkter utan streckkod</CardTitle>
                  <CardDescription className="text-xs">Generera streckkoder för dessa produkter.</CardDescription>
                </div>
                <Button size="sm" className="gap-1.5 text-xs h-7" onClick={handleGenerateAll}>
                  <Tag className="h-3 w-3" /> Generera alla ({productsWithoutBarcode.length})
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {productsWithoutBarcode.length === 0 ? (
                <p className="text-xs text-success py-8 text-center">✅ Alla produkter har streckkoder!</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">SKU</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Kategori</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productsWithoutBarcode.map((p: any) => (
                        <tr key={p.id} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-1.5 font-medium text-foreground">{p.name}</td>
                          <td className="py-1.5 font-mono text-muted-foreground text-[10px]">{p.sku}</td>
                          <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{p.category}</Badge></td>
                          <td className="py-1.5 text-muted-foreground">{p.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Generate dialog */}
      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Generera EAN-13 streckkoder</DialogTitle>
            <DialogDescription className="text-xs">Generera streckkoder för produkter som saknar. Prefix "20" används (intern användning).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-muted/30 rounded-lg text-xs">
              <p><strong>{productsWithoutBarcode.length}</strong> produkter saknar streckkod</p>
              <p><strong>{productsWithBarcode.length}</strong> produkter har redan streckkod</p>
            </div>
            <Button className="w-full gap-2" onClick={handleGenerateAll}>
              <Tag className="h-4 w-4" /> Generera alla {productsWithoutBarcode.length} streckkoder
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Action dialog (inventory/receive/deliver) */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              {scanMode === "inventory" && "📋 Inventering"}
              {scanMode === "receive" && "📦 Inleverans"}
              {scanMode === "deliver" && "🚚 Utleverans"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {scannedProduct?.name} ({scannedProduct?.sku})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lagerställe *</Label>
              <Select value={actionLocation} onValueChange={setActionLocation}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj lagerställe" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id} className="text-xs">
                      {loc.name} ({loc.stores?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">
                {scanMode === "inventory" ? "Räknad kvantitet *" : scanMode === "receive" ? "Mottagen kvantitet *" : "Levererad kvantitet *"}
              </Label>
              <Input value={actionQty} onChange={e => setActionQty(e.target.value)} type="number" className="h-8 text-xs" placeholder={scannedProduct?.unit} />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleAction} disabled={!actionQty || !actionLocation || upsertStock.isPending}>
              {upsertStock.isPending ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
