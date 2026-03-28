import { useState, useCallback, useMemo } from "react";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Package,
  Tag,
  Printer,
  ChevronRight,
  ChevronDown,
  Layers,
  Check,
  X,
  History,
  Clock,
} from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useProductsWithChildren, useAddSubproduct, useUpdateProduct } from "@/hooks/useProducts";
import { useCategories, useAddCategory } from "@/hooks/useCategories";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import BarcodeDisplay from "@/components/barcode/BarcodeDisplay";
import { generateEAN13 } from "@/lib/barcode";
import { format } from "date-fns";

const UNITS = ["KG", "ST", "L", "FÖRP"];
const PRODUCERS = ["Inköp", "Produktion", "Inköp/Produktion"];

// ── Shelf life helper ────────────────────────────────────────────────────────
function ShelfLifeBadge({ days }: { days: number | null }) {
  if (!days) return <span className="text-[10px] text-muted-foreground/50">–</span>;
  let color = "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
  if (days <= 3) color = "bg-destructive/10 text-destructive border-destructive/20";
  else if (days <= 7) color = "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return (
    <Badge variant="outline" className={`text-[10px] gap-0.5 ${color}`}>
      <Clock className="h-2.5 w-2.5" />
      {days}d
    </Badge>
  );
}

interface InlineEdit {
  cost_price: number;
  wholesale_price: number;
  margin: number;
}

export default function Products() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { site } = useSite();
  const isWholesale = site === "wholesale";
  const { data: products = [], allProducts = [], isLoading } = useProductsWithChildren();
  const { data: dbCategories = [] } = useCategories();
  const addCategory = useAddCategory();
  const addSubproduct = useAddSubproduct();
  const updateProduct = useUpdateProduct();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [barcodePreview, setBarcodePreview] = useState<any>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [subproductDialogOpen, setSubproductDialogOpen] = useState(false);
  const [subproductParentId, setSubproductParentId] = useState<string | null>(null);
  const [subForm, setSubForm] = useState({
    name: "",
    cost_price: "",
    wholesale_price: "",
    retail_suggested: "",
    weight_per_piece: "",
  });
  const [historyProduct, setHistoryProduct] = useState<string | null>(null);

  // Inline price editing (wholesale only)
  const [inlineEdits, setInlineEdits] = useState<Record<string, InlineEdit>>({});

  const calcMargin = (cost: number, price: number) => {
    if (price === 0) return 0;
    return Math.round(((price - cost) / price) * 100);
  };

  const startInlineEdit = (p: any) => {
    setInlineEdits((prev) => ({
      ...prev,
      [p.id]: {
        cost_price: Number(p.cost_price),
        wholesale_price: Number(p.wholesale_price),
        margin: calcMargin(Number(p.cost_price), Number(p.wholesale_price)),
      },
    }));
  };

  const cancelInlineEdit = (id: string) => {
    setInlineEdits((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const updateInlineCost = (id: string, cost: number) => {
    setInlineEdits((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: {
          cost_price: cost,
          margin: current.margin,
          wholesale_price: Number((cost / (1 - current.margin / 100)).toFixed(2)),
        },
      };
    });
  };

  const updateInlineWholesale = (id: string, wholesale: number) => {
    setInlineEdits((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: { ...current, wholesale_price: wholesale, margin: calcMargin(current.cost_price, wholesale) },
      };
    });
  };

  const updateInlineMargin = (id: string, margin: number) => {
    setInlineEdits((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return {
        ...prev,
        [id]: { ...current, margin, wholesale_price: Number((current.cost_price / (1 - margin / 100)).toFixed(2)) },
      };
    });
  };

  const saveInlineEdit = (p: any) => {
    const edit = inlineEdits[p.id];
    if (!edit) return;
    updateProduct.mutate(
      {
        id: p.id,
        cost_price: edit.cost_price,
        wholesale_price: edit.wholesale_price,
        retail_suggested: p.retail_suggested || 0,
        reason: "Inline prisändring",
      },
      {
        onSuccess: () => {
          toast({ title: "Pris uppdaterat", description: `${p.name} sparad.` });
          cancelInlineEdit(p.id);
        },
      },
    );
  };

  const CATEGORIES = useMemo(() => {
    return dbCategories.map((c) => c.name).sort((a, b) => a.localeCompare(b, "sv"));
  }, [dbCategories]);

  const [form, setFormState] = useState({
    name: "",
    category: "",
    unit: "KG",
    sku: "",
    hs_code: "",
    weight_per_piece: "",
    cost_price: "",
    wholesale_price: "",
    retail_suggested: "",
    origin: "",
    producer: "",
    shelf_life_days: "", // NEW
  });

  const setField = (key: string, value: string) => {
    setFormState((f) => {
      const updated = { ...f, [key]: value };
      if (key === "cost_price" && value) {
        updated.wholesale_price = (Number(value) * 1.35).toFixed(2);
      }
      return updated;
    });
  };

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      ((p as any).barcode || "").includes(search) ||
      p.subproducts.some((sp) => sp.name.toLowerCase().includes(search.toLowerCase()));
    const matchCat = filterCategory === "all" || p.category === filterCategory;
    return matchSearch && matchCat;
  });

  const toggleExpand = (id: string) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openAdd = () => {
    setEditId(null);
    setFormState({
      name: "",
      category: "",
      unit: "KG",
      sku: "",
      hs_code: "",
      weight_per_piece: "",
      cost_price: "",
      wholesale_price: "",
      retail_suggested: "",
      origin: "",
      producer: "",
      shelf_life_days: "",
    });
    setDialogOpen(true);
  };

  const openEdit = (p: any) => {
    setEditId(p.id);
    setFormState({
      name: p.name,
      category: p.category,
      unit: p.unit,
      sku: p.sku,
      hs_code: p.hs_code || "",
      weight_per_piece: String(p.weight_per_piece || ""),
      cost_price: String(p.cost_price || ""),
      wholesale_price: String(p.wholesale_price || ""),
      retail_suggested: String(p.retail_suggested || ""),
      origin: p.origin || "",
      producer: (p as any).producer || "",
      shelf_life_days: String((p as any).shelf_life_days || ""), // NEW
    });
    setDialogOpen(true);
  };

  const openAddSubproduct = (parentId: string) => {
    setSubproductParentId(parentId);
    setSubForm({ name: "", cost_price: "", wholesale_price: "", retail_suggested: "", weight_per_piece: "" });
    setSubproductDialogOpen(true);
  };

  const handleSaveSubproduct = () => {
    if (!subproductParentId || !subForm.name) return;
    const parent = products.find((p) => p.id === subproductParentId);
    if (!parent) return;
    addSubproduct.mutate(
      {
        parent_id: subproductParentId,
        name: subForm.name,
        sku: `${parent.sku}-SUB-${Date.now().toString(36)}`,
        category: parent.category,
        unit: parent.unit,
        cost_price: subForm.cost_price ? Number(subForm.cost_price) : 0,
        wholesale_price: subForm.wholesale_price ? Number(subForm.wholesale_price) : 0,
        retail_suggested: subForm.retail_suggested ? Number(subForm.retail_suggested) : 0,
        weight_per_piece: subForm.weight_per_piece ? Number(subForm.weight_per_piece) : 0,
      },
      {
        onSuccess: () => {
          toast({ title: "Delprodukt tillagd", description: subForm.name });
          setSubproductDialogOpen(false);
          setExpandedProducts((prev) => new Set(prev).add(subproductParentId!));
        },
        onError: (err: any) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleSave = async () => {
    if (!form.name || !form.category) return;
    const sku = form.sku || `${form.category.slice(0, 2).toUpperCase()}-${Date.now().toString(36)}`;
    const payload: any = {
      name: form.name,
      category: form.category,
      unit: form.unit,
      sku,
      hs_code: form.hs_code || null,
      weight_per_piece: form.weight_per_piece ? Number(form.weight_per_piece) : 0,
      origin: form.origin || null,
      producer: form.producer || null,
      shelf_life_days: form.shelf_life_days ? Number(form.shelf_life_days) : null, // NEW
    };

    if (editId) {
      const { error } = await supabase.from("products").update(payload).eq("id", editId);
      if (error) {
        toast({ title: "Fel", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Produkt uppdaterad", description: form.name });
    } else {
      payload.cost_price = form.cost_price ? Number(form.cost_price) : 0;
      payload.wholesale_price = form.wholesale_price ? Number(form.wholesale_price) : 0;
      payload.retail_suggested = form.retail_suggested ? Number(form.retail_suggested) : 0;
      const { error } = await supabase.from("products").insert(payload);
      if (error) {
        toast({ title: "Fel", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Produkt tillagd", description: form.name });
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    setDialogOpen(false);
  };

  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    addCategory.mutate(name, {
      onSuccess: () => {
        toast({ title: "Kategori sparad", description: `"${name}" är nu tillgänglig.` });
        setNewCategoryName("");
        setAddCategoryOpen(false);
      },
      onError: (err: any) => {
        toast({
          title: "Fel",
          description: err.message?.includes("duplicate") ? "Kategorin finns redan." : err.message,
          variant: "destructive",
        });
      },
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Produkt borttagen", description: deleteTarget.name });
    qc.invalidateQueries({ queryKey: ["products"] });
    setDeleteTarget(null);
  };

  const generateBarcodeForProduct = async (productId: string) => {
    const existing = allProducts.filter((p: any) => (p as any).barcode).length;
    const barcode = generateEAN13("20", existing + 1);
    const { error } = await supabase.from("products").update({ barcode }).eq("id", productId);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Streckkod genererad", description: barcode });
  };

  const generateAllBarcodes = async () => {
    const without = allProducts.filter((p: any) => !(p as any).barcode);
    if (without.length === 0) {
      toast({ title: "Alla har redan streckkoder" });
      return;
    }
    let seq = allProducts.filter((p: any) => (p as any).barcode).length + 1;
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

  const productsWithout = allProducts.filter((p: any) => !(p as any).barcode).length;
  const productsMissingShelfLife = products.filter((p: any) => !(p as any).shelf_life_days && p.active).length;

  const getAggregated = (p: any) => {
    if (!p.subproducts || p.subproducts.length === 0) return null;
    return {
      cost_price: p.subproducts.reduce((s: number, sp: any) => s + Number(sp.cost_price), 0),
      wholesale_price: p.subproducts.reduce((s: number, sp: any) => s + Number(sp.wholesale_price), 0),
      retail_suggested: p.subproducts.reduce((s: number, sp: any) => s + Number(sp.retail_suggested || 0), 0),
      stock: p.subproducts.reduce((s: number, sp: any) => s + Number(sp.stock), 0),
    };
  };

  if (isLoading)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );

  const renderProductRow = (p: any, isSubproduct: boolean = false, rowIndex: number = 0) => {
    const barcode = (p as any).barcode;
    const hasChildren = p.subproducts && p.subproducts.length > 0;
    const isExpanded = expandedProducts.has(p.id);
    const agg = hasChildren ? getAggregated(p) : null;
    const isAggregatedParent = hasChildren;
    const shelfLifeDays: number | null = (p as any).shelf_life_days || null;

    const costVal = inlineEdits[p.id]?.cost_price ?? Number(p.cost_price);
    const wholesaleVal = inlineEdits[p.id]?.wholesale_price ?? Number(p.wholesale_price);
    const marginVal = inlineEdits[p.id]?.margin ?? calcMargin(Number(p.cost_price), Number(p.wholesale_price));
    const hasChanges =
      !!inlineEdits[p.id] &&
      (inlineEdits[p.id].cost_price !== Number(p.cost_price) ||
        inlineEdits[p.id].wholesale_price !== Number(p.wholesale_price));

    return (
      <tr
        key={p.id}
        className={`border-b border-border/40 hover:bg-muted/40 transition-colors h-7 ${isSubproduct ? "bg-muted/10" : rowIndex % 2 === 1 ? "bg-muted/30" : ""}`}
      >
        {/* Name */}
        <td className="px-2 py-0 font-medium text-foreground">
          <div className="flex items-center gap-1.5">
            {!isSubproduct && hasChildren && (
              <button onClick={() => toggleExpand(p.id)} className="p-0.5 rounded hover:bg-muted">
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            )}
            {isSubproduct && <span className="ml-5 text-muted-foreground">└</span>}
            {!isSubproduct && !hasChildren && <span className="w-5" />}
            <span className={isSubproduct ? "text-muted-foreground" : ""}>{p.name}</span>
            {hasChildren && (
              <Badge variant="secondary" className="text-[9px] px-1 py-0 ml-1">
                {p.subproducts.length} del
              </Badge>
            )}
          </div>
        </td>
        <td className="px-2 py-0 font-mono text-muted-foreground text-[10px]">{p.sku}</td>
        <td className="px-2 py-0 text-[9px] text-muted-foreground whitespace-nowrap">{p.category}</td>
        <td className="px-2 py-0 text-muted-foreground">{p.unit}</td>
        <td className="px-2 py-0 font-mono text-muted-foreground">{(p as any).hs_code || "–"}</td>
        <td className="px-2 py-0">
          <Select
            value={(p as any).producer || "__none__"}
            onValueChange={async (val) => {
              const producer = val === "__none__" ? null : val;
              await supabase
                .from("products")
                .update({ producer } as any)
                .eq("id", p.id);
              qc.invalidateQueries({ queryKey: ["products"] });
            }}
          >
            <SelectTrigger className="h-7 w-28 text-[10px] border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-[10px] text-muted-foreground">
                –
              </SelectItem>
              {PRODUCERS.map((pr) => (
                <SelectItem key={pr} value={pr} className="text-[10px]">
                  {pr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* ── NEW: Hållbarhet column ── */}
        <td className="px-2 py-0 text-center">
          {isAggregatedParent ? (
            <span className="text-[10px] text-muted-foreground">–</span>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <ShelfLifeBadge days={shelfLifeDays} />
              {/* Quick inline edit for shelf life */}
              <input
                type="number"
                min="1"
                max="9999"
                defaultValue={shelfLifeDays || ""}
                placeholder="dagar"
                className="w-12 h-6 text-[10px] text-center rounded border border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background focus:outline-none"
                onBlur={async (e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  if (val === shelfLifeDays) return;
                  await supabase
                    .from("products")
                    .update({ shelf_life_days: val } as any)
                    .eq("id", p.id);
                  qc.invalidateQueries({ queryKey: ["products"] });
                  toast({
                    title: "Hållbarhet sparad",
                    description: `${p.name}: ${val ? `${val} dagar` : "borttagen"}`,
                  });
                }}
              />
              <span className="text-[9px] text-muted-foreground">d</span>
            </div>
          )}
        </td>

        {/* Prices */}
        {isWholesale && (
          <td className="px-2 py-0 text-right">
            {isAggregatedParent ? (
              <span className="font-medium text-foreground">{agg!.cost_price.toFixed(2)}</span>
            ) : (
              <Input
                type="number"
                value={costVal}
                onFocus={(e) => {
                  if (!inlineEdits[p.id]) startInlineEdit(p);
                  e.target.select();
                }}
                onChange={(e) => updateInlineCost(p.id, Number(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveInlineEdit(p);
                }}
                className="h-7 w-24 text-right text-xs ml-auto border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
              />
            )}
          </td>
        )}
        <td className="px-2 py-0 text-right">
          {isAggregatedParent ? (
            <span className="font-medium text-foreground">
              {(agg ? agg.wholesale_price : Number(p.wholesale_price)).toFixed(2)}
            </span>
          ) : isWholesale ? (
            <Input
              type="number"
              value={wholesaleVal}
              onFocus={(e) => {
                if (!inlineEdits[p.id]) startInlineEdit(p);
                e.target.select();
              }}
              onChange={(e) => updateInlineWholesale(p.id, Number(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveInlineEdit(p);
              }}
              className="h-7 w-24 text-right text-xs ml-auto border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
            />
          ) : (
            <span className="font-medium text-foreground">{Number(p.wholesale_price).toFixed(2)}</span>
          )}
        </td>
        {isWholesale && (
          <td className="px-2 py-0 text-right">
            <div className="flex items-center justify-end gap-0.5">
              {isAggregatedParent ? (
                <span className="text-muted-foreground text-xs">
                  {calcMargin(agg!.cost_price, agg!.wholesale_price)}%
                </span>
              ) : (
                <>
                  <Input
                    type="number"
                    value={marginVal}
                    onFocus={(e) => {
                      if (!inlineEdits[p.id]) startInlineEdit(p);
                      e.target.select();
                    }}
                    onChange={(e) => updateInlineMargin(p.id, Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveInlineEdit(p);
                    }}
                    className="h-7 w-14 text-right text-xs border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">%</span>
                </>
              )}
            </div>
          </td>
        )}
        {isWholesale && (
          <td className="px-2 py-0 text-right text-muted-foreground">
            {agg ? agg.retail_suggested.toFixed(2) : p.retail_suggested ? Number(p.retail_suggested).toFixed(2) : "–"}
          </td>
        )}

        {/* Barcode */}
        <td className="px-2 py-0">
          {barcode ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setBarcodePreview(p)}
                className="font-mono text-[10px] text-primary hover:underline"
              >
                {barcode}
              </button>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => printLabel(p)}>
                <Printer className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] gap-1 text-muted-foreground"
              onClick={() => generateBarcodeForProduct(p.id)}
            >
              <Tag className="h-3 w-3" /> Generera
            </Button>
          )}
        </td>

        {/* Stock */}
        <td className="px-2 py-0 text-right font-medium">
          <span className={Number(agg ? agg.stock : p.stock) <= 0 ? "text-destructive" : "text-foreground"}>
            {Number(agg ? agg.stock : p.stock).toFixed(1)}
          </span>
        </td>

        {/* Actions */}
        <td className="px-2 py-0 text-center">
          <div className="flex items-center justify-center gap-1">
            {isWholesale && hasChanges && (
              <>
                <Button
                  variant="default"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => saveInlineEdit(p)}
                  disabled={updateProduct.isPending}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => cancelInlineEdit(p.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            {isWholesale && !isAggregatedParent && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setHistoryProduct(p.id)}
                title="Prishistorik"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            )}
            {isWholesale && !isSubproduct && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => openAddSubproduct(p.id)}
                title="Lägg till delprodukt"
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={() => setDeleteTarget({ id: p.id, name: p.name })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Produkter
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isWholesale
              ? "Central produktbank — produkter, priser, marginaler, hållbarhet och streckkoder."
              : "Central produktbank — alla produkter som används i beställningar, lager och fakturering."}
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

      {/* Warning: products missing shelf life */}
      {productsMissingShelfLife > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium">{productsMissingShelfLife} produkter</span> saknar hållbarhetsinställning —
            ange antal dagar direkt i tabellen för att aktivera automatisk utgångsdatum.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Sök namn, SKU eller streckkod..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select
          value={filterCategory}
          onValueChange={(val) => {
            if (val === "__add_new__") {
              setAddCategoryOpen(true);
            } else {
              setFilterCategory(val);
            }
          }}
        >
          <SelectTrigger className="h-8 text-xs w-44">
            <SelectValue placeholder="Alla kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">
              Alla kategorier
            </SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="text-xs">
                {c}
              </SelectItem>
            ))}
            <SelectItem value="__add_new__" className="text-xs font-medium text-primary">
              + Lägg till kategori
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 h-6">
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Produkt</th>
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">SKU</th>
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Kat.</th>
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Enh.</th>
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">HS</th>
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Prod.</th>
                  <th className="px-2 py-0 text-center font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Håll.</th>
                  {isWholesale && <th className="px-2 py-0 text-right font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Ink.pris</th>}
                  <th className="px-2 py-0 text-right font-medium text-muted-foreground text-[9px] uppercase tracking-wider">
                    {isWholesale ? "Gr.pris" : "Pris"}
                  </th>
                  {isWholesale && <th className="px-2 py-0 text-right font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Marg.</th>}
                  {isWholesale && <th className="px-2 py-0 text-right font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Rek.but.</th>}
                  <th className="px-2 py-0 text-left font-medium text-muted-foreground text-[9px] uppercase tracking-wider">EAN</th>
                  <th className="px-2 py-0 text-right font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Lager</th>
                  <th className="px-2 py-0 text-center font-medium text-muted-foreground text-[9px] uppercase tracking-wider">Åtg.</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={isWholesale ? 14 : 11} className="p-8 text-center text-muted-foreground">
                      Inga produkter hittades.
                    </td>
                  </tr>
                )}
                {(() => {
                  let rowIdx = 0;
                  return filtered.map((p) => {
                    const isExpanded = expandedProducts.has(p.id);
                    const currentIdx = rowIdx++;
                    return (
                      <>{renderProductRow(p, false, currentIdx)}
                        {isExpanded && p.subproducts.map((sp) => renderProductRow(sp, true, rowIdx++))}
                      </>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-[10px] text-muted-foreground">
        Visar <span className="font-bold text-foreground">{filtered.length}</span> av {products.length} aktiva produkter
        {productsWithout > 0 && (
          <>
            {" "}
            · <span className="text-warning font-medium">{productsWithout} saknar streckkod</span>
          </>
        )}
        {productsMissingShelfLife > 0 && (
          <>
            {" "}
            · <span className="text-amber-600 font-medium">{productsMissingShelfLife} saknar hållbarhet</span>
          </>
        )}
      </p>

      {/* Barcode Preview */}
      <Dialog open={!!barcodePreview} onOpenChange={(open) => !open && setBarcodePreview(null)}>
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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => printLabel(barcodePreview)}>
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
            <DialogDescription className="text-xs">Fyll i produktuppgifterna nedan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Produktnamn *</Label>
              <Input value={form.name} onChange={(e) => setField("name", e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kategori *</Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Enhet</Label>
                <Select value={form.unit} onValueChange={(v) => setField("unit", v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u} className="text-xs">
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── NEW: Shelf life field ── */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-primary" />
                Hållbarhet (dagar) *
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="9999"
                  value={form.shelf_life_days}
                  onChange={(e) => setField("shelf_life_days", e.target.value)}
                  placeholder="T.ex. 5"
                  className="h-8 text-xs w-28"
                />
                <span className="text-xs text-muted-foreground">dagar från produktions- eller ankomstdatum</span>
              </div>
              {/* Quick presets */}
              <div className="flex flex-wrap gap-1 mt-1">
                {[
                  { label: "Färsk fisk (3d)", value: "3" },
                  { label: "Beredd (5d)", value: "5" },
                  { label: "Rökt (14d)", value: "14" },
                  { label: "Fryst (180d)", value: "180" },
                  { label: "Torr (365d)", value: "365" },
                ].map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      form.shelf_life_days === preset.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                    }`}
                    onClick={() => setField("shelf_life_days", preset.value)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {editId ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Prod.pris (SEK)</Label>
                    <Input
                      value={form.cost_price}
                      readOnly
                      disabled
                      type="number"
                      className="h-8 text-xs bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Grossistpris (SEK)</Label>
                    <Input
                      value={form.wholesale_price}
                      readOnly
                      disabled
                      type="number"
                      className="h-8 text-xs bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Rek. butikspris</Label>
                    <Input
                      value={form.retail_suggested}
                      readOnly
                      disabled
                      type="number"
                      className="h-8 text-xs bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">🔒 Priser ändras direkt i produktlistan</p>
              </>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prod.pris (SEK)</Label>
                    <Input
                      value={form.cost_price}
                      onChange={(e) => setField("cost_price", e.target.value)}
                      type="number"
                      step="0.01"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      Grossistpris <span className="text-muted-foreground">+35%</span>
                    </Label>
                    <Input
                      value={form.wholesale_price}
                      onChange={(e) => setField("wholesale_price", e.target.value)}
                      type="number"
                      step="0.01"
                      className="h-8 text-xs bg-muted/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Rek. butikspris</Label>
                    <Input
                      value={form.retail_suggested}
                      onChange={(e) => setField("retail_suggested", e.target.value)}
                      type="number"
                      step="0.01"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">HS-kod</Label>
                <Input
                  value={form.hs_code}
                  onChange={(e) => setField("hs_code", e.target.value)}
                  placeholder="T.ex. 16042090"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vikt/st (KG)</Label>
                <Input
                  value={form.weight_per_piece}
                  onChange={(e) => setField("weight_per_piece", e.target.value)}
                  type="number"
                  step="0.001"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Producent</Label>
                <Select value={form.producer} onValueChange={(v) => setField("producer", v)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCERS.map((p) => (
                      <SelectItem key={p} value={p} className="text-xs">
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ursprung</Label>
                <Input
                  value={form.origin}
                  onChange={(e) => setField("origin", e.target.value)}
                  placeholder="T.ex. Norge"
                  className="h-8 text-xs"
                />
              </div>
            </div>
            {!editId && (
              <div className="space-y-1.5">
                <Label className="text-xs">SKU (auto om tomt)</Label>
                <Input
                  value={form.sku}
                  onChange={(e) => setField("sku", e.target.value)}
                  placeholder="T.ex. VK-013"
                  className="h-8 text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!form.name || !form.category}>
              {editId ? "Spara ändringar" : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Subproduct Dialog */}
      <Dialog open={subproductDialogOpen} onOpenChange={setSubproductDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Lägg till delprodukt
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Namn *</Label>
              <Input
                value={subForm.name}
                onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Prod.pris</Label>
                <Input
                  value={subForm.cost_price}
                  onChange={(e) => setSubForm((f) => ({ ...f, cost_price: e.target.value }))}
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grossistpris</Label>
                <Input
                  value={subForm.wholesale_price}
                  onChange={(e) => setSubForm((f) => ({ ...f, wholesale_price: e.target.value }))}
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rek. butik</Label>
                <Input
                  value={subForm.retail_suggested}
                  onChange={(e) => setSubForm((f) => ({ ...f, retail_suggested: e.target.value }))}
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Vikt/st (kg)</Label>
                <Input
                  value={subForm.weight_per_piece}
                  onChange={(e) => setSubForm((f) => ({ ...f, weight_per_piece: e.target.value }))}
                  type="number"
                  step="0.01"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSubproductDialogOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={handleSaveSubproduct} disabled={!subForm.name || addSubproduct.isPending}>
              {addSubproduct.isPending ? "Sparar..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort produkt?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              "{deleteTarget?.name}" markeras som inaktiv. Historik bevaras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Category */}
      <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Lägg till kategori</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Kategorinamn</Label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="h-8 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newCategoryName.trim()) handleAddCategory();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddCategoryOpen(false);
                setNewCategoryName("");
              }}
            >
              Avbryt
            </Button>
            <Button size="sm" disabled={!newCategoryName.trim() || addCategory.isPending} onClick={handleAddCategory}>
              {addCategory.isPending ? "Sparar..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price History */}
      <PriceHistoryDialog productId={historyProduct} onClose={() => setHistoryProduct(null)} />
    </div>
  );
}

function PriceHistoryDialog({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { data: history = [] } = usePriceHistory(productId || "");
  if (!productId) return null;
  return (
    <Dialog open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Prishistorik</DialogTitle>
        </DialogHeader>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 text-center">Ingen prishistorik</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Inköp</TableHead>
                  <TableHead className="text-right">Grossist</TableHead>
                  <TableHead>Anledning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">
                      {h.created_at ? format(new Date(h.created_at), "yyyy-MM-dd") : "–"}
                    </TableCell>
                    <TableCell className="text-right">{h.cost_price?.toFixed(2) ?? "–"}</TableCell>
                    <TableCell className="text-right">{h.wholesale_price?.toFixed(2) ?? "–"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{h.reason || "–"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
