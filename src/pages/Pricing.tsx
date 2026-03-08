import { useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useUpdateProduct } from "@/hooks/useProducts";
import { usePriceHistory } from "@/hooks/usePriceHistory";
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
import { DollarSign, History, Search } from "lucide-react";
import { format } from "date-fns";

export default function Pricing() {
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useCategories();
  const updateProduct = useUpdateProduct();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [editProduct, setEditProduct] = useState<any>(null);
  const [editPrices, setEditPrices] = useState({ cost_price: 0, wholesale_price: 0, retail_suggested: 0 });
  const [reason, setReason] = useState("");
  const [historyProduct, setHistoryProduct] = useState<string | null>(null);

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
    updateProduct.mutate(
      { id: editProduct.id, ...editPrices, reason: reason || "Manuell ändring" },
      {
        onSuccess: () => {
          toast({ title: "Pris uppdaterat", description: `${editProduct.name} har fått nya priser.` });
          setEditProduct(null);
        },
      }
    );
  };

  const margin = (cost: number, wholesale: number) => {
    if (cost === 0) return 0;
    return Math.round(((wholesale - cost) / cost) * 100);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Prissättning</h1>
        <p className="text-muted-foreground text-sm">Hantera produktpriser, marginaler och prishistorik</p>
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
            <DollarSign className="h-5 w-5" /> Produktpriser
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
                    <TableHead className="text-right">Inköpspris</TableHead>
                    <TableHead className="text-right">Grossistpris</TableHead>
                    <TableHead className="text-right">Rek. butik</TableHead>
                    <TableHead className="text-right">Marginal</TableHead>
                    <TableHead className="text-right">Åtgärd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.sku}</TableCell>
                      <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                      <TableCell className="text-right">{Number(p.cost_price).toFixed(2)} kr</TableCell>
                      <TableCell className="text-right">{Number(p.wholesale_price).toFixed(2)} kr</TableCell>
                      <TableCell className="text-right">{Number(p.retail_suggested || 0).toFixed(2)} kr</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={margin(p.cost_price, p.wholesale_price) >= 30 ? "default" : "destructive"}>
                          {margin(p.cost_price, p.wholesale_price)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => openEdit(p)}>Ändra pris</Button>
                        <Button size="sm" variant="ghost" onClick={() => setHistoryProduct(p.id)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Inga produkter hittades</TableCell></TableRow>
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
          <DialogHeader><DialogTitle>Ändra pris – {editProduct?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Inköpspris (kr)</Label>
              <Input type="number" value={editPrices.cost_price} onChange={(e) => setEditPrices((p) => ({ ...p, cost_price: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Grossistpris (kr)</Label>
              <Input type="number" value={editPrices.wholesale_price} onChange={(e) => setEditPrices((p) => ({ ...p, wholesale_price: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Rek. butikspris (kr)</Label>
              <Input type="number" value={editPrices.retail_suggested} onChange={(e) => setEditPrices((p) => ({ ...p, retail_suggested: Number(e.target.value) }))} />
            </div>
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
