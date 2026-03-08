import { useState, useCallback, useMemo } from "react";
import { Plus, Search, Edit, Trash2, Package, Tag, Printer, ScanLine, DollarSign, Check, X } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import BarcodeDisplay from "@/components/barcode/BarcodeDisplay";
import { generateEAN13 } from "@/lib/barcode";

const DEFAULT_CATEGORIES = ["Färsk Fisk", "Skaldjur", "Varmkök", "Rökta Produkter", "Såser & Röror", "Frukt & Grönt"];
const UNITS = ["KG", "ST", "L", "FÖRP"];

export default function Products() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { site } = useSite();
  const isWholesale = site === "wholesale";
  const { data: products = [], isLoading } = useProducts();
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [inlineCostPrice, setInlineCostPrice] = useState("");
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [barcodePreview, setBarcodePreview] = useState<any>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Dynamic categories: defaults + any custom ones from existing products
  const CATEGORIES = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    const all = new Set([...DEFAULT_CATEGORIES, ...fromProducts]);
    return Array.from(all).sort((a, b) => a.localeCompare(b, "sv"));
  }, [products]);

  const [form, setForm] = useState({
    name: "", category: "", unit: "KG", sku: "",
    hs_code: "", weight_per_piece: "", cost_price: "", wholesale_price: "", retail_suggested: "",
    origin: "",
  });

  const setField = (key: string, value: string) => {
    setForm(f => {
      const updated = { ...f, [key]: value };
      // Auto-calc wholesale_price as cost_price * 1.35 when cost_price changes
      if (key === "cost_price" && value) {
        updated.wholesale_price = (Number(value) * 1.35).toFixed(2);
      }
      return updated;
    });
  };

  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).barcode || "").includes(search);
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", category: "", unit: "KG", sku: "", hs_code: "", weight_per_piece: "", cost_price: "", wholesale_price: "", retail_suggested: "", origin: "" });
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setForm({
      name: p.name, category: p.category, unit: p.unit,
      sku: p.sku, hs_code: p.hs_code || "", weight_per_piece: String(p.weight_per_piece || ""),
      cost_price: String(p.cost_price || ""), wholesale_price: String(p.wholesale_price || ""),
      retail_suggested: String(p.retail_suggested || ""), origin: p.origin || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.category) return;
    const sku = form.sku || `${form.category.slice(0, 2).toUpperCase()}-${Date.now().toString(36)}`;
    const payload = {
      name: form.name, category: form.category, unit: form.unit, sku,
      hs_code: form.hs_code || null,
      weight_per_piece: form.weight_per_piece ? Number(form.weight_per_piece) : 0,
      cost_price: form.cost_price ? Number(form.cost_price) : 0,
      wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : 0,
      retail_suggested: form.retail_suggested ? Number(form.retail_suggested) : 0,
      origin: form.origin || null,
    };

    if (editId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editId);
      if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
      // Log price history
      await supabase.from("price_history").insert({
        product_id: editId,
        cost_price: payload.cost_price,
        wholesale_price: payload.wholesale_price,
        retail_suggested: payload.retail_suggested,
        reason: "Manuell ändring via produktdialog",
        changed_by: "Admin",
      });
      toast({ title: "Produkt uppdaterad", description: form.name });
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Produkt tillagd", description: form.name });
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    setDialogOpen(false);
  };

  const handleInlinePriceSave = async (productId: string, cost: number) => {
    if (isNaN(cost) || cost <= 0) return;
    const wholesale = Number((cost * 1.35).toFixed(2));
    const { error } = await supabase.from("products").update({
      cost_price: cost,
      wholesale_price: wholesale,
      updated_at: new Date().toISOString(),
    }).eq("id", productId);
    if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
    await supabase.from("price_history").insert({
      product_id: productId,
      cost_price: cost,
      wholesale_price: wholesale,
      reason: "Daglig prisuppdatering",
      changed_by: "Admin",
    });
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Pris uppdaterat", description: `Grossistpris: ${wholesale.toFixed(2)} SEK` });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", deleteTarget.id);
    if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Produkt borttagen", description: deleteTarget.name });
    qc.invalidateQueries({ queryKey: ["products"] });
    setDeleteTarget(null);
  };

  const generateBarcodeForProduct = async (productId: string) => {
    const existing = products.filter((p: any) => (p as any).barcode).length;
    const barcode = generateEAN13("20", existing + 1);
    const { error } = await supabase.from("products").update({ barcode }).eq("id", productId);
    if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Streckkod genererad", description: barcode });
  };

  const generateAllBarcodes = async () => {
    const without = products.filter((p: any) => !(p as any).barcode);
    if (without.length === 0) { toast({ title: "Alla har redan streckkoder" }); return; }
    let seq = products.filter((p: any) => (p as any).barcode).length + 1;
    for (const p of without) {
      const barcode = generateEAN13("20", seq++);
      await supabase.from("products").update({ barcode }).eq("id", p.id);
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Klart!", description: `${without.length} streckkoder genererade` });
  };

  const printLabel = (p: any) => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Etikett</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      <style>body{font-family:Arial;text-align:center;padding:20px;} .name{font-size:14px;font-weight:bold;} .sku{font-size:10px;color:#666;} .price{font-size:13px;font-weight:bold;margin-top:4px;} svg{max-width:200px;height:60px;}</style>
      </head><body>
      <div class="name">${p.name}</div><div class="sku">${p.sku}</div>
      <svg id="bc"></svg>
      <div class="price">${Number(p.wholesale_price).toFixed(2)} kr/${p.unit}</div>
      <script>try{JsBarcode("#bc","${(p as any).barcode}",{format:"EAN13",width:2,height:50,displayValue:true,fontSize:12,margin:8})}catch(e){};setTimeout(()=>window.print(),400)<\/script>
      </body></html>`);
    w.document.close();
  };

  const productsWithout = products.filter((p: any) => !(p as any).barcode).length;

  if (isLoading) return (
    <div className="p-6 space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96" /></div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Produkter
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Central produktbank — alla produkter som används i beställningar, lager och fakturering.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {productsWithout > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={generateAllBarcodes}>
              <Tag className="h-3.5 w-3.5" /> Generera alla streckkoder ({productsWithout})
            </Button>
          )}
          <Button size="sm" className="gap-1.5 text-xs" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Lägg till produkt
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Sök namn, SKU eller streckkod..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
        </div>
        <Select value={filterCategory} onValueChange={(val) => {
          if (val === "__add_new__") {
            setAddCategoryOpen(true);
          } else {
            setFilterCategory(val);
          }
        }}>
          <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Alla kategorier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alla kategorier</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            <SelectItem value="__add_new__" className="text-xs font-medium text-primary">+ Lägg till kategori</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                 <tr className="border-b border-border bg-muted/30">
                   <th className="p-3 text-left font-medium text-muted-foreground">PRODUKTNAMN</th>
                   <th className="p-3 text-left font-medium text-muted-foreground">SKU</th>
                   <th className="p-3 text-left font-medium text-muted-foreground">KATEGORI</th>
                   <th className="p-3 text-left font-medium text-muted-foreground">ENHET</th>
                   {isWholesale && <th className="p-3 text-right font-medium text-muted-foreground">PROD.PRIS (SEK)</th>}
                   <th className="p-3 text-right font-medium text-muted-foreground">{isWholesale ? "GROSSISTPRIS" : "PRIS"} (SEK)</th>
                   {isWholesale && <th className="p-3 text-right font-medium text-muted-foreground">BUTIKSPRIS</th>}
                   <th className="p-3 text-left font-medium text-muted-foreground">STRECKKOD</th>
                   <th className="p-3 text-right font-medium text-muted-foreground">LAGER</th>
                   <th className="p-3 text-center font-medium text-muted-foreground">ÅTGÄRD</th>
                 </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">Inga produkter hittades.</td></tr>
                )}
                {filtered.map(p => {
                  const barcode = (p as any).barcode;
                  return (
                     <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                       <td className="p-3 font-medium text-foreground">{p.name}</td>
                       <td className="p-3 font-mono text-muted-foreground text-[10px]">{p.sku}</td>
                       <td className="p-3"><Badge variant="outline" className="text-[10px]">{p.category}</Badge></td>
                       <td className="p-3 text-muted-foreground">{p.unit}</td>
                       {isWholesale && (
                         <td className="p-3 text-right">
                           <Input
                             defaultValue={Number(p.cost_price).toFixed(2)}
                             type="number"
                             step="0.01"
                             className="h-6 w-20 text-xs text-right ml-auto"
                             onBlur={e => {
                               const val = Number(e.target.value);
                               if (val > 0 && val !== Number(p.cost_price)) {
                                 setInlineCostPrice(String(val));
                                 handleInlinePriceSave(p.id, val);
                               }
                             }}
                             onKeyDown={e => {
                               if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                             }}
                           />
                         </td>
                       )}
                       <td className="p-3 text-right font-medium text-foreground">{Number(p.wholesale_price).toFixed(2)}</td>
                       {isWholesale && (
                         <td className="p-3 text-right text-muted-foreground">{p.retail_suggested ? Number(p.retail_suggested).toFixed(2) : "–"}</td>
                       )}
                       <td className="p-3">
                         {barcode ? (
                           <div className="flex items-center gap-1.5">
                             <button
                               onClick={() => setBarcodePreview(p)}
                               className="font-mono text-[10px] text-primary hover:underline cursor-pointer"
                             >
                               {barcode}
                             </button>
                             <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => printLabel(p)} title="Skriv ut etikett">
                               <Printer className="h-3 w-3" />
                             </Button>
                           </div>
                         ) : (
                           <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 text-muted-foreground" onClick={() => generateBarcodeForProduct(p.id)}>
                             <Tag className="h-3 w-3" /> Generera
                           </Button>
                         )}
                       </td>
                       <td className="p-3 text-right font-medium">
                         <span className={Number(p.stock) <= 0 ? "text-destructive" : "text-foreground"}>
                           {Number(p.stock).toFixed(1)}
                         </span>
                       </td>
                       <td className="p-3 text-center">
                         <div className="flex items-center justify-center gap-1">
                           <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                             <Edit className="h-3.5 w-3.5" />
                           </Button>
                           <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget({ id: p.id, name: p.name })}>
                             <Trash2 className="h-3.5 w-3.5" />
                           </Button>
                         </div>
                       </td>
                     </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        Visar <span className="font-bold text-foreground">{filtered.length}</span> av {products.length} aktiva produkter
        {productsWithout > 0 && <> · <span className="text-warning font-medium">{productsWithout} saknar streckkod</span></>}
      </p>

      {/* Barcode Preview Dialog */}
      <Dialog open={!!barcodePreview} onOpenChange={open => !open && setBarcodePreview(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">{barcodePreview?.name}</DialogTitle>
            <DialogDescription className="text-xs">SKU: {barcodePreview?.sku}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-4">
            {barcodePreview && <BarcodeDisplay value={(barcodePreview as any).barcode} width={2} height={70} />}
            <p className="text-xs text-muted-foreground font-mono">{(barcodePreview as any)?.barcode}</p>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { printLabel(barcodePreview); }}>
              <Printer className="h-3.5 w-3.5" /> Skriv ut etikett
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera produkt" : "Lägg till produkt"}</DialogTitle>
            <DialogDescription className="text-xs">Fyll i produktuppgifterna nedan. Produkten blir tillgänglig i beställningar och lager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Produktnamn *</Label>
              <Input value={form.name} onChange={e => setField("name", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori *</Label>
                <Select value={form.category} onValueChange={v => setField("category", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enhet</Label>
                <Select value={form.unit} onValueChange={v => setField("unit", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Produktionspris (SEK)</Label>
                <Input value={form.cost_price} onChange={e => setField("cost_price", e.target.value)} type="number" step="0.01" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grossistpris (SEK) <span className="text-muted-foreground">+35%</span></Label>
                <Input value={form.wholesale_price} onChange={e => setField("wholesale_price", e.target.value)} type="number" step="0.01" className="h-8 text-xs bg-muted/50" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rek. butikspris (SEK)</Label>
                <Input value={form.retail_suggested} onChange={e => setField("retail_suggested", e.target.value)} type="number" step="0.01" className="h-8 text-xs" />
              </div>
            </div>
            {form.cost_price && (
              <p className="text-[10px] text-muted-foreground">
                💡 Produktionspris {Number(form.cost_price).toFixed(2)} × 1.35 = Grossistpris {(Number(form.cost_price) * 1.35).toFixed(2)} SEK
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">HS-kod</Label>
                <Input value={form.hs_code} onChange={e => setField("hs_code", e.target.value)} placeholder="T.ex. 16042090" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vikt/st (KG)</Label>
                <Input value={form.weight_per_piece} onChange={e => setField("weight_per_piece", e.target.value)} type="number" step="0.001" className="h-8 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Ursprung</Label>
                <Input value={form.origin} onChange={e => setField("origin", e.target.value)} placeholder="T.ex. Norge" className="h-8 text-xs" />
              </div>
              {!editId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">SKU (auto om tomt)</Label>
                  <Input value={form.sku} onChange={e => setField("sku", e.target.value)} placeholder="T.ex. VK-013" className="h-8 text-xs" />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name || !form.category}>
              {editId ? "Spara ändringar" : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort produkt?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              "{deleteTarget?.name}" markeras som inaktiv och visas inte längre i listor, beställningar eller lager. Historik bevaras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Add Category Dialog */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Lägg till kategori</DialogTitle>
            <DialogDescription className="text-xs">Ange namn på den nya kategorin. Den blir tillgänglig direkt i alla dropdown-menyer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Kategorinamn</Label>
            <Input
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="T.ex. Marinader"
              className="h-8 text-xs"
              autoFocus
              onKeyDown={e => {
                if (e.key === "Enter" && newCategoryName.trim()) {
                  // Just set as filter — it'll appear in dropdowns once a product uses it
                  setFilterCategory(newCategoryName.trim());
                  toast({ title: "Kategori tillagd", description: `"${newCategoryName.trim()}" — tilldela produkter till denna kategori för att den ska synas permanent.` });
                  setNewCategoryName("");
                  setAddCategoryOpen(false);
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setAddCategoryOpen(false); setNewCategoryName(""); }}>Avbryt</Button>
            <Button size="sm" disabled={!newCategoryName.trim()} onClick={() => {
              setFilterCategory(newCategoryName.trim());
              toast({ title: "Kategori tillagd", description: `"${newCategoryName.trim()}" — tilldela produkter till denna kategori för att den ska synas permanent.` });
              setNewCategoryName("");
              setAddCategoryOpen(false);
            }}>Lägg till</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
