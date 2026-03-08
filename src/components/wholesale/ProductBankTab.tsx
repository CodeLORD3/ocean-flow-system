import { useState, useMemo } from "react";
import { Plus, Search, Edit, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const DEFAULT_CATEGORIES = ["Färsk Fisk", "Skaldjur", "Varmkök", "Rökta Produkter", "Såser & Röror", "Frukt & Grönt"];

export default function ProductBankTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: products = [], isLoading } = useProducts();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formUnit, setFormUnit] = useState("KG");
  const [formHsCode, setFormHsCode] = useState("");
  const [formWeight, setFormWeight] = useState("");
  const [formSku, setFormSku] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);

  // Merge default categories with any custom categories from existing products
  const CATEGORIES = useMemo(() => {
    const fromProducts = products.map(p => p.category).filter(Boolean);
    const all = new Set([...DEFAULT_CATEGORIES, ...fromProducts]);
    return Array.from(all).sort((a, b) => a.localeCompare(b, "sv"));
  }, [products]);

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditId(null);
    setFormName(""); setFormCategory(""); setFormUnit("KG"); setFormHsCode(""); setFormWeight(""); setFormSku("");
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setFormName(p.name); setFormCategory(p.category); setFormUnit(p.unit); setFormHsCode(p.hs_code || ""); setFormWeight(String(p.weight_per_piece || "")); setFormSku(p.sku);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName || !formCategory) return;
    const sku = formSku || `${formCategory.slice(0, 2).toUpperCase()}-${Date.now().toString(36)}`;
    const payload = {
      name: formName,
      category: formCategory,
      unit: formUnit,
      hs_code: formHsCode || null,
      weight_per_piece: formWeight ? Number(formWeight) : 0,
      sku,
    };

    if (editId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editId);
      if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Produkt uppdaterad", description: formName });
    } else {
      const { error } = await supabase.from("products").insert(payload);
      if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
      toast({ title: "Produkt tillagd", description: formName });
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    setDialogOpen(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Ta bort "${name}"? Produkten markeras som inaktiv.`)) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
    if (error) { toast({ title: "Fel", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Produkt borttagen", description: name });
    qc.invalidateQueries({ queryKey: ["products"] });
  };

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div>
              <CardTitle className="text-sm font-heading">🐟 Produktbank</CardTitle>
              <CardDescription className="text-xs">Lägg till, redigera eller ta bort produkter. Ändringar syns direkt i butikernas beställningar och TTOTTIII.</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input placeholder="Sök produkt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
              </div>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={openAdd}>
                <Plus className="h-3 w-3" /> Lägg till produkt
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">PRODUKTNAMN</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">KATEGORI</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">ENHET</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">HS-KOD</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">VIKT/ST (KG)</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">SKU</th>
                  <th className="pb-2 text-center font-medium text-muted-foreground">ÅTGÄRD</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIES.map(cat => {
                  const catProds = filtered.filter(p => p.category === cat);
                  if (catProds.length === 0) return null;
                  return (
                    <>
                      <tr key={cat}><td colSpan={7} className="pt-3 pb-1 text-[10px] font-bold text-muted-foreground">▸ {cat}</td></tr>
                      {catProds.map(p => (
                        <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="py-1.5 font-medium text-foreground">{p.name}</td>
                          <td className="py-1.5"><Badge variant="outline" className="text-[10px]">{p.category}</Badge></td>
                          <td className="py-1.5 text-muted-foreground">{p.unit}</td>
                          <td className="py-1.5 font-mono text-muted-foreground">{(p as any).hs_code || "–"}</td>
                          <td className="py-1.5 text-right text-muted-foreground">{(p as any).weight_per_piece ? Number((p as any).weight_per_piece).toFixed(3) : "–"}</td>
                          <td className="py-1.5 font-mono text-muted-foreground text-[10px]">{p.sku}</td>
                          <td className="py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}><Edit className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(p.id, p.name)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-muted-foreground">
            Totalt <span className="font-bold text-foreground">{filtered.length}</span> produkter · ➕ Lägg till nya produkter med knappen ovan
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">{editId ? "Redigera produkt" : "Lägg till produkt"}</DialogTitle>
            <DialogDescription className="text-xs">Produkten dyker automatiskt upp i butikernas dropdown-listor och i TTOTTIII.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Produktnamn *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori *</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj" /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enhet</Label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KG" className="text-xs">KG</SelectItem>
                    <SelectItem value="ST" className="text-xs">ST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">HS-kod (för export)</Label>
                <Input value={formHsCode} onChange={e => setFormHsCode(e.target.value)} placeholder="T.ex. 16042090" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vikt/styck (KG) <span className="text-muted-foreground">— bara för ST</span></Label>
                <Input value={formWeight} onChange={e => setFormWeight(e.target.value)} type="number" step="0.001" className="h-8 text-xs" />
              </div>
            </div>
            {!editId && (
              <div className="space-y-1.5">
                <Label className="text-xs">SKU (lämna tomt för autogenerering)</Label>
                <Input value={formSku} onChange={e => setFormSku(e.target.value)} className="h-8 text-xs" placeholder="T.ex. VK-013" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleSave} disabled={!formName || !formCategory}>
              {editId ? "Spara ändringar" : "Lägg till produkt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
