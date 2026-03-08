import { useState, useCallback } from "react";
import { useProducts, useUpdateProduct } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useSite } from "@/contexts/SiteContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Check, DollarSign, History, Search, Store, X } from "lucide-react";
import { format } from "date-fns";

interface InlineEdit {
  cost_price: number;
  wholesale_price: number;
  margin: number;
}

export default function Pricing() {
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const { site } = useSite();
  const isShop = site === "shop";
  const updateProduct = useUpdateProduct();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editPrices, setEditPrices] = useState({ cost_price: 0, wholesale_price: 0, retail_suggested: 0 });
  const [reason, setReason] = useState("");
  const [historyProduct, setHistoryProduct] = useState<string | null>(null);

  // Inline editing state for grossist rows: productId -> edit values
  const [inlineEdits, setInlineEdits] = useState<Record<string, InlineEdit>>({});

  const calcMargin = (cost: number, wholesale: number) => {
    if (cost === 0) return 0;
    return Math.round(((wholesale - cost) / cost) * 100);
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
      const m = current.margin;
      return { ...prev, [id]: { cost_price: cost, margin: m, wholesale_price: Number((cost * (1 + m / 100)).toFixed(2)) } };
    });
  };

  const updateInlineWholesale = (id: string, wholesale: number) => {
    setInlineEdits((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, wholesale_price: wholesale, margin: calcMargin(current.cost_price, wholesale) } };
    });
  };

  const updateInlineMargin = (id: string, margin: number) => {
    setInlineEdits((prev) => {
      const current = prev[id];
      if (!current) return prev;
      return { ...prev, [id]: { ...current, margin, wholesale_price: Number((current.cost_price * (1 + margin / 100)).toFixed(2)) } };
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
      }
    )
  };

  const filtered = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = catFilter === "all" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const openEdit = (p: any) => {
    setEditProduct(p);
    setEditPrices({ cost_price: p.cost_price, wholesale_price: p.wholesale_price, retail_suggested: p.retail_suggested || 0 });
    setReason("");
  };

  const handleSave = () => {
    if (!editProduct) return;

    if (isShop) {
      // Shop can only change retail_suggested (selling price)
      updateProduct.mutate(
        {
          id: editProduct.id,
          cost_price: editProduct.cost_price,
          wholesale_price: editProduct.wholesale_price,
          retail_suggested: editPrices.retail_suggested,
          reason: reason || "Butiksprisändring",
        },
        {
          onSuccess: () => {
            toast({ title: "Försäljningspris uppdaterat", description: `${editProduct.name} har fått nytt försäljningspris.` });
            setEditProduct(null);
          },
        }
      );
    } else {
      // Wholesale can change all prices
      updateProduct.mutate(
        { id: editProduct.id, ...editPrices, reason: reason || "Manuell ändring" },
        {
          onSuccess: () => {
            toast({ title: "Pris uppdaterat", description: `${editProduct.name} har fått nya priser.` });
            setEditProduct(null);
          },
        }
      );
    }
  };

  const margin = calcMargin;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prissättning</h1>
        <p className="text-muted-foreground text-sm">
          {isShop
            ? "Hantera försäljningspriser för butiken. Grossistpris är fast."
            : "Hantera produktpriser, marginaler och prishistorik"}
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Sök produkt eller SKU..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla kategorier</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            {isShop ? <Store className="h-5 w-5" /> : <DollarSign className="h-5 w-5" />}
            {isShop ? "Butikspriser" : "Produktpriser"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground py-8 text-center">Laddar...</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Kategori</TableHead>
                    {!isShop && <TableHead className="text-right">Inköpspris</TableHead>}
                    <TableHead className="text-right">Grossistpris</TableHead>
                    <TableHead className="text-right">{isShop ? "Försäljningspris" : "Rek. butik"}</TableHead>
                    {!isShop && <TableHead className="text-right">Marginal</TableHead>}
                    <TableHead className="text-right">Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const costVal = inlineEdits[p.id]?.cost_price ?? Number(p.cost_price);
                    const wholesaleVal = inlineEdits[p.id]?.wholesale_price ?? Number(p.wholesale_price);
                    const marginVal = inlineEdits[p.id]?.margin ?? calcMargin(Number(p.cost_price), Number(p.wholesale_price));
                    const hasChanges = !!inlineEdits[p.id] && (
                      inlineEdits[p.id].cost_price !== Number(p.cost_price) ||
                      inlineEdits[p.id].wholesale_price !== Number(p.wholesale_price)
                    );
                    return (
                    <TableRow key={p.id} className="h-9">
                      <TableCell className="py-1 font-medium">{p.name}</TableCell>
                      <TableCell className="py-1 text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="py-1"><Badge variant="outline">{p.category}</Badge></TableCell>
                      {!isShop && (
                        <TableCell className="py-1 text-right">
                          <Input
                            type="number"
                            value={costVal}
                            onFocus={(e) => { if (!inlineEdits[p.id]) startInlineEdit(p); e.target.select(); }}
                            onChange={(e) => updateInlineCost(p.id, Number(e.target.value))}
                            onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(p); }}
                            className="h-7 w-24 text-right text-sm ml-auto border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
                          />
                        </TableCell>
                      )}
                      <TableCell className="py-1 text-right">
                        {!isShop ? (
                          <Input
                            type="number"
                            value={wholesaleVal}
                            onFocus={(e) => { if (!inlineEdits[p.id]) startInlineEdit(p); e.target.select(); }}
                            onChange={(e) => updateInlineWholesale(p.id, Number(e.target.value))}
                            onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(p); }}
                            className="h-7 w-24 text-right text-sm ml-auto border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
                          />
                        ) : (
                          <span>{Number(p.wholesale_price).toFixed(2)} kr</span>
                        )}
                      </TableCell>
                      <TableCell className="py-1 text-right">{Number(p.retail_suggested || 0).toFixed(2)} kr</TableCell>
                      {!isShop && (
                        <TableCell className="py-1 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              value={marginVal}
                              onFocus={(e) => { if (!inlineEdits[p.id]) startInlineEdit(p); e.target.select(); }}
                              onChange={(e) => updateInlineMargin(p.id, Number(e.target.value))}
                              onKeyDown={(e) => { if (e.key === "Enter") saveInlineEdit(p); }}
                              className="h-7 w-16 text-right text-sm border-transparent bg-transparent hover:border-input focus:border-input focus:bg-background"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                      )}
                      <TableCell className="py-1 text-right space-x-1">
                        {!isShop && hasChanges && (
                          <>
                            <Button size="sm" variant="default" className="h-6 w-6 p-0" onClick={() => saveInlineEdit(p)} disabled={updateProduct.isPending}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => cancelInlineEdit(p.id)}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {isShop && (
                          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => openEdit(p)}>
                            Ändra försäljningspris
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setHistoryProduct(p.id)}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={isShop ? 6 : 8} className="text-center text-muted-foreground py-8">Inga produkter hittades</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editProduct} onOpenChange={(o) => !o && setEditProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isShop ? `Ändra försäljningspris – ${editProduct?.name}` : `Ändra pris – ${editProduct?.name}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isShop ? (
              <>
                <div>
                  <Label className="text-muted-foreground">Grossistpris (kr) — fast</Label>
                  <Input type="number" value={editProduct?.wholesale_price || 0} readOnly disabled className="bg-muted/50 cursor-not-allowed" />
                </div>
                <div>
                  <Label>Försäljningspris (kr)</Label>
                  <Input type="number" value={editPrices.retail_suggested} onChange={(e) => setEditPrices((p) => ({ ...p, retail_suggested: Number(e.target.value) }))} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>Inköpspris (kr)</Label>
                  <Input type="number" value={editPrices.cost_price} onChange={(e) => {
                    const cost = Number(e.target.value);
                    setEditPrices((p) => ({ ...p, cost_price: cost, wholesale_price: Number((cost * 1.35).toFixed(2)) }));
                  }} />
                </div>
                <div>
                  <Label>Grossistpris (kr) <span className="text-muted-foreground text-xs">+35% auto</span></Label>
                  <Input type="number" value={editPrices.wholesale_price} onChange={(e) => setEditPrices((p) => ({ ...p, wholesale_price: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Rek. butikspris (kr)</Label>
                  <Input type="number" value={editPrices.retail_suggested} onChange={(e) => setEditPrices((p) => ({ ...p, retail_suggested: Number(e.target.value) }))} />
                </div>
              </>
            )}
            <div>
              <Label>Anledning</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Varför ändras priset?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Avbryt</Button>
            <Button onClick={handleSave} disabled={updateProduct.isPending}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History dialog */}
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
        <DialogHeader><DialogTitle>Prishistorik</DialogTitle></DialogHeader>
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
                    <TableCell className="text-sm">{h.created_at ? format(new Date(h.created_at), "yyyy-MM-dd") : "–"}</TableCell>
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
