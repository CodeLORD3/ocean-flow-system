import { useState } from "react";
import { displayOrderWeek } from "@/lib/orderWeek";
import { Plus, X, ShoppingCart, Store } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useShopOrders, useCreateShopOrder } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useProducts } from "@/hooks/useProducts";

const CATEGORIES = ["Färsk Fisk", "Skaldjur", "Varmkök", "Rökta Produkter", "Såser & Röror", "Frukt & Grönt"];

function getWeekNumber(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

interface OrderLine {
  product_id: string;
  qty: string;
  order_date: string;
  delivery_date: string;
}

export default function ShopOrderTab() {
  const { toast } = useToast();
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([{ product_id: "", qty: "", order_date: new Date().toISOString().slice(0, 10), delivery_date: "" }]);

  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const { data: orders = [], isLoading } = useShopOrders(selectedStore && selectedStore !== "all" ? selectedStore : undefined);
  const createOrder = useCreateShopOrder();

  const retailStores = stores.filter(s => !s.is_wholesale);

  const addLine = () => setOrderLines([...orderLines, { product_id: "", qty: "", order_date: new Date().toISOString().slice(0, 10), delivery_date: "" }]);
  const removeLine = (i: number) => setOrderLines(orderLines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof OrderLine, value: string) => {
    const u = [...orderLines]; u[i] = { ...u[i], [field]: value }; setOrderLines(u);
  };

  const handleCreate = () => {
    if (!selectedStore) return;
    const validLines = orderLines.filter(l => l.product_id && l.qty).map(l => {
      const p = products.find(pr => pr.id === l.product_id);
      return {
        product_id: l.product_id,
        quantity_ordered: Number(l.qty),
        unit: p?.unit || "ST",
        order_date: l.order_date || undefined,
        delivery_date: l.delivery_date || undefined,
        category_section: p?.category || "",
      };
    });
    if (validLines.length === 0) return;
    createOrder.mutate({
      store_id: selectedStore,
      order_week: getWeekNumber(new Date()),
      lines: validLines,
    }, {
      onSuccess: () => {
        toast({ title: "Beställning sparad" });
        setDialogOpen(false);
        setOrderLines([{ product_id: "", qty: "", order_date: new Date().toISOString().slice(0, 10), delivery_date: "" }]);
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div>
              <CardTitle className="text-sm font-heading">Butikernas beställningar</CardTitle>
              <CardDescription className="text-xs">Veckobeställningar från butikerna — som era Excel-flikar, fast i realtid</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-8 text-xs w-44">
                  <SelectValue placeholder="Alla butiker" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Alla butiker</SelectItem>
                  {retailStores.map(s => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3 w-3" /> Ny beställning
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-48" /> : orders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">Inga beställningar ännu. Klicka "Ny beställning" för att börja.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order: any) => (
                <Card key={order.id} className="border border-border/60">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Store className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-foreground">{order.stores?.name}</span>
                        <Badge variant="outline" className="text-[10px]">v.{displayOrderWeek(order)}</Badge>
                        <Badge variant="outline" className={`text-[10px] ${order.status === "Ny" ? "bg-primary/10 text-primary" : "bg-success/10 text-success"}`}>{order.status}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{new Date(order.created_at).toLocaleDateString("sv-SE")}</span>
                    </div>
                    {order.shop_order_lines && order.shop_order_lines.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border/50">
                              <th className="pb-1 text-left text-muted-foreground font-medium">Produkt</th>
                              <th className="pb-1 text-right text-muted-foreground font-medium">Beställt</th>
                              <th className="pb-1 text-right text-muted-foreground font-medium">Levererat</th>
                              <th className="pb-1 text-left text-muted-foreground font-medium">Enhet</th>
                              <th className="pb-1 text-left text-muted-foreground font-medium">Beställt datum</th>
                              <th className="pb-1 text-left text-muted-foreground font-medium">Levereras</th>
                              <th className="pb-1 text-left text-muted-foreground font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {CATEGORIES.map(cat => {
                              const catLines = order.shop_order_lines.filter((l: any) => l.category_section === cat || l.products?.category === cat);
                              if (catLines.length === 0) return null;
                              return (
                                <> 
                                  <tr key={cat}><td colSpan={7} className="pt-2 pb-1 text-[10px] font-bold text-muted-foreground">▸ {cat}</td></tr>
                                  {catLines.map((line: any) => (
                                    <tr key={line.id} className="border-b border-border/30 last:border-0">
                                      <td className="py-1 text-foreground">{line.products?.name}</td>
                                      <td className="py-1 text-right font-medium text-foreground">{Number(line.quantity_ordered)}</td>
                                      <td className="py-1 text-right text-muted-foreground">{Number(line.quantity_delivered || 0)}</td>
                                      <td className="py-1 text-muted-foreground">{line.unit || line.products?.unit}</td>
                                      <td className="py-1 text-muted-foreground">{line.order_date || "–"}</td>
                                      <td className="py-1 text-muted-foreground">{line.delivery_date || "–"}</td>
                                      <td className="py-1">
                                        {line.status ? (
                                          <Badge variant="outline" className="text-[10px]">{line.status}</Badge>
                                        ) : <span className="text-muted-foreground">–</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New order dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Ny veckobeställning</DialogTitle>
            <DialogDescription className="text-xs">Välj butik och lägg till produktrader — precis som i Excel-fliken.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Butik *</Label>
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj butik" /></SelectTrigger>
                <SelectContent>{retailStores.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Separator />
            <p className="text-xs font-medium text-foreground">Produktrader</p>
            {orderLines.map((line, i) => {
              const prod = products.find(p => p.id === line.product_id);
              return (
                <div key={i} className="p-3 rounded-md border border-border bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-muted-foreground">Rad {i + 1}{prod ? ` · ${prod.category}` : ""}</span>
                    {orderLines.length > 1 && <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeLine(i)}><X className="h-3 w-3" /></Button>}
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-4 space-y-1">
                      <Label className="text-[10px]">Produkt *</Label>
                      <Select value={line.product_id} onValueChange={v => updateLine(i, "product_id", v)}>
                        <SelectTrigger className="h-7 text-[11px]"><SelectValue placeholder="Välj" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => {
                            const catProds = products.filter(p => p.category === cat);
                            if (catProds.length === 0) return null;
                            return (
                              <div key={cat}>
                                <div className="px-2 py-1 text-[10px] font-bold text-muted-foreground">▸ {cat}</div>
                                {catProds.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.unit})</SelectItem>)}
                              </div>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px]">Antal *</Label>
                      <Input value={line.qty} onChange={e => updateLine(i, "qty", e.target.value)} type="number" className="h-7 text-[11px]" />
                    </div>
                    <div className="col-span-1 flex items-end">
                      <span className="text-[10px] text-muted-foreground pb-1.5">{prod?.unit || "–"}</span>
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px]">Beställt datum</Label>
                      <Input type="date" value={line.order_date} onChange={e => updateLine(i, "order_date", e.target.value)} className="h-7 text-[11px]" />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px]">Levereras datum</Label>
                      <Input type="date" value={line.delivery_date} onChange={e => updateLine(i, "delivery_date", e.target.value)} className="h-7 text-[11px]" />
                    </div>
                  </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full text-xs h-7 gap-1" onClick={addLine}>
              <Plus className="h-3 w-3" /> Lägg till rad
            </Button>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleCreate} disabled={!selectedStore || orderLines.every(l => !l.product_id || !l.qty) || createOrder.isPending}>
              {createOrder.isPending ? "Sparar..." : "Skicka beställning"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
