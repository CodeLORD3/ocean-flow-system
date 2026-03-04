import { useState } from "react";
import { motion } from "framer-motion";
import {
  Warehouse, Search, Plus, Package, AlertTriangle, MapPin, Thermometer,
  Edit, X, ArrowRightLeft,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import {
  useStorageLocations,
  useAllStockByLocation,
  useCreateStorageLocation,
  useUpsertStockLocation,
} from "@/hooks/useStorageLocations";

const zoneIcon: Record<string, string> = {
  Kyl: "❄️",
  Frys: "🧊",
  Torrt: "📦",
  Produktion: "🏭",
};

const zoneColor: Record<string, string> = {
  Kyl: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Frys: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  Torrt: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Produktion: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

export default function Inventory() {
  const { toast } = useToast();
  const [storeFilter, setStoreFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // Location form
  const [locName, setLocName] = useState("");
  const [locStore, setLocStore] = useState("");
  const [locZone, setLocZone] = useState("Kyl");
  const [locDesc, setLocDesc] = useState("");

  // Stock form
  const [stockProduct, setStockProduct] = useState("");
  const [stockLocation, setStockLocation] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [stockMin, setStockMin] = useState("");

  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const { data: locations = [], isLoading: loadingLoc } = useStorageLocations(storeFilter !== "all" ? storeFilter : undefined);
  const { data: allStock = [], isLoading: loadingStock } = useAllStockByLocation();
  const createLocation = useCreateStorageLocation();
  const upsertStock = useUpsertStockLocation();

  // Filter stock by search & selected location
  const filteredStock = allStock.filter(s => {
    const matchSearch = !search || 
      s.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.products?.sku?.toLowerCase().includes(search.toLowerCase()) ||
      s.storage_locations?.name?.toLowerCase().includes(search.toLowerCase());
    const matchLoc = !selectedLocationId || s.location_id === selectedLocationId;
    const matchStore = storeFilter === "all" || s.storage_locations?.store_id === storeFilter;
    return matchSearch && matchLoc && matchStore;
  });

  // Group stock by location for overview
  const locationSummary = locations.map((loc: any) => {
    const locStock = allStock.filter(s => s.location_id === loc.id);
    const totalQty = locStock.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
    const productCount = locStock.length;
    const lowStockCount = locStock.filter((s: any) => Number(s.min_stock) > 0 && Number(s.quantity) < Number(s.min_stock)).length;
    return { ...loc, totalQty, productCount, lowStockCount };
  });

  const totalProducts = allStock.length;
  const totalQty = allStock.reduce((s: number, i: any) => s + Number(i.quantity), 0);
  const lowStockItems = allStock.filter((s: any) => Number(s.min_stock) > 0 && Number(s.quantity) < Number(s.min_stock)).length;

  const handleCreateLocation = () => {
    if (!locName || !locStore) return;
    createLocation.mutate({
      name: locName,
      store_id: locStore,
      zone: locZone || undefined,
      description: locDesc || undefined,
    }, {
      onSuccess: () => {
        toast({ title: "Lagerställe skapat", description: locName });
        setLocationDialogOpen(false);
        setLocName(""); setLocStore(""); setLocZone("Kyl"); setLocDesc("");
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  const handleUpsertStock = () => {
    if (!stockProduct || !stockLocation || !stockQty) return;
    upsertStock.mutate({
      product_id: stockProduct,
      location_id: stockLocation,
      quantity: Number(stockQty),
      min_stock: stockMin ? Number(stockMin) : 0,
    }, {
      onSuccess: () => {
        toast({ title: "Lagersaldo uppdaterat" });
        setStockDialogOpen(false);
        setStockProduct(""); setStockLocation(""); setStockQty(""); setStockMin("");
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Lagerhantering</h2>
          <p className="text-xs text-muted-foreground">Lagerställen, zoner och lagersaldo per plats</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={storeFilter} onValueChange={v => { setStoreFilter(v); setSelectedLocationId(null); }}>
            <SelectTrigger className="h-8 text-xs w-44"><SelectValue placeholder="Alla lager" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla lager</SelectItem>
              {stores.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setStockDialogOpen(true)}>
            <ArrowRightLeft className="h-3 w-3" /> Uppdatera saldo
          </Button>
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setLocationDialogOpen(true)}>
            <Plus className="h-3 w-3" /> Nytt lagerställe
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Lagerställen</p>
          <p className="text-xl font-heading font-bold text-foreground">{locations.length}</p>
          <p className="text-[10px] text-muted-foreground">Över {stores.length} platser</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Produkter i lager</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalProducts}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Total kvantitet</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalQty.toLocaleString("sv-SE")}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Lågt lager</p>
          <p className="text-xl font-heading font-bold text-destructive">{lowStockItems}</p>
          <p className="text-[10px] text-muted-foreground">Under min.nivå</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="locations" className="space-y-3">
        <TabsList className="h-8">
          <TabsTrigger value="locations" className="text-xs h-7">📍 Lagerställen</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs h-7">📦 Lagersaldo per plats</TabsTrigger>
        </TabsList>

        {/* Tab 1: Location overview */}
        <TabsContent value="locations">
          {loadingLoc ? <Skeleton className="h-48" /> : locations.length === 0 ? (
            <Card className="shadow-card"><CardContent className="p-8 text-center">
              <p className="text-xs text-muted-foreground">Inga lagerställen ännu. Klicka "Nytt lagerställe" för att börja.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {locationSummary.map((loc: any) => (
                <Card
                  key={loc.id}
                  className={`shadow-card cursor-pointer transition-all hover:ring-2 hover:ring-primary/30 ${selectedLocationId === loc.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedLocationId(selectedLocationId === loc.id ? null : loc.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{zoneIcon[loc.zone] || "📍"}</span>
                        <div>
                          <p className="text-sm font-medium text-foreground">{loc.name}</p>
                          <p className="text-[10px] text-muted-foreground">{loc.stores?.name}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${zoneColor[loc.zone] || ""}`}>{loc.zone || "Övrigt"}</Badge>
                    </div>
                    {loc.description && <p className="text-[10px] text-muted-foreground mb-2">{loc.description}</p>}
                    <Separator className="my-2" />
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-foreground">{loc.productCount}</p>
                        <p className="text-[9px] text-muted-foreground">Produkter</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-foreground">{loc.totalQty.toLocaleString("sv-SE")}</p>
                        <p className="text-[9px] text-muted-foreground">Kvantitet</p>
                      </div>
                      <div>
                        <p className={`text-lg font-bold ${loc.lowStockCount > 0 ? "text-destructive" : "text-success"}`}>{loc.lowStockCount}</p>
                        <p className="text-[9px] text-muted-foreground">Varningar</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Stock per location detail */}
        <TabsContent value="stock">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-heading">Lagersaldo per plats</CardTitle>
                  <CardDescription className="text-xs">
                    {selectedLocationId
                      ? `Visar ${locations.find((l: any) => l.id === selectedLocationId)?.name || "valt ställe"}`
                      : "Alla lagerställen — klicka ett lagerställe i fliken ovan för att filtrera"}
                  </CardDescription>
                </div>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Sök produkt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingStock ? <Skeleton className="h-48" /> : filteredStock.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga lagersaldon registrerade. Använd "Uppdatera saldo" för att lägga till.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">SKU</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Lagerställe</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Plats (Butik)</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Zon</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Kvantitet</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Min</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map((s: any) => {
                        const isLow = Number(s.min_stock) > 0 && Number(s.quantity) < Number(s.min_stock);
                        return (
                          <tr key={s.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="py-2 font-medium text-foreground">{s.products?.name}</td>
                            <td className="py-2 font-mono text-muted-foreground text-[10px]">{s.products?.sku}</td>
                            <td className="py-2 text-foreground">
                              <span className="mr-1">{zoneIcon[s.storage_locations?.zone] || "📍"}</span>
                              {s.storage_locations?.name}
                            </td>
                            <td className="py-2 text-muted-foreground">{s.storage_locations?.stores?.name}</td>
                            <td className="py-2">
                              <Badge variant="outline" className={`text-[10px] ${zoneColor[s.storage_locations?.zone] || ""}`}>
                                {s.storage_locations?.zone || "–"}
                              </Badge>
                            </td>
                            <td className="py-2 text-right font-medium text-foreground">{Number(s.quantity).toLocaleString("sv-SE")} {s.products?.unit}</td>
                            <td className="py-2 text-right text-muted-foreground">{Number(s.min_stock) || "–"}</td>
                            <td className="py-2 text-right">
                              {isLow ? (
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Lågt
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">OK</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="mt-3 text-[10px] text-muted-foreground">
                Visar {filteredStock.length} rader · Senast uppdaterad: {new Date().toLocaleString("sv-SE")}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create location dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Nytt lagerställe</DialogTitle>
            <DialogDescription className="text-xs">Skapa en ny lagerplats i ett specifikt lager.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Namn *</Label>
              <Input value={locName} onChange={e => setLocName(e.target.value)} placeholder="T.ex. Kyl 3, Frys B" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Lager/Butik *</Label>
                <Select value={locStore} onValueChange={setLocStore}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Zon</Label>
                <Select value={locZone} onValueChange={setLocZone}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kyl" className="text-xs">❄️ Kyl</SelectItem>
                    <SelectItem value="Frys" className="text-xs">🧊 Frys</SelectItem>
                    <SelectItem value="Torrt" className="text-xs">📦 Torrt</SelectItem>
                    <SelectItem value="Produktion" className="text-xs">🏭 Produktion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beskrivning</Label>
              <Input value={locDesc} onChange={e => setLocDesc(e.target.value)} placeholder="Valfritt..." className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleCreateLocation} disabled={!locName || !locStore || createLocation.isPending}>
              {createLocation.isPending ? "Sparar..." : "Skapa lagerställe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update stock dialog */}
      <Dialog open={stockDialogOpen} onOpenChange={setStockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Uppdatera lagersaldo</DialogTitle>
            <DialogDescription className="text-xs">Ange kvantitet för en produkt på ett specifikt lagerställe.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Lagerställe *</Label>
              <Select value={stockLocation} onValueChange={setStockLocation}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj lagerställe" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc: any) => (
                    <SelectItem key={loc.id} value={loc.id} className="text-xs">
                      {zoneIcon[loc.zone] || "📍"} {loc.name} ({loc.stores?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produkt *</Label>
              <Select value={stockProduct} onValueChange={setStockProduct}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj produkt" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name} ({p.unit})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Kvantitet *</Label>
                <Input value={stockQty} onChange={e => setStockQty(e.target.value)} type="number" className="h-8 text-xs" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Min.nivå (varning)</Label>
                <Input value={stockMin} onChange={e => setStockMin(e.target.value)} type="number" className="h-8 text-xs" placeholder="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={handleUpsertStock} disabled={!stockProduct || !stockLocation || !stockQty || upsertStock.isPending}>
              {upsertStock.isPending ? "Sparar..." : "Uppdatera saldo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
