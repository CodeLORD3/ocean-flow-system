import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { markOrderLinesPackad, revertOrderLinesIfStockGone } from "@/lib/orderStatusSync";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Warehouse, Search, Plus, Package, AlertTriangle, MapPin,
  Edit, ArrowRightLeft, ScanLine, Camera, ClipboardList, X, CheckCircle2,
  ChevronDown, ChevronRight, Trash2, Scissors, Move, RefreshCw,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { useSite } from "@/contexts/SiteContext";
import BarcodeScanner from "@/components/barcode/BarcodeScanner";

const zoneIcon: Record<string, string> = {
  Kyl: "❄️", Frys: "🧊", Torrt: "📦", Produktion: "🏭",
};
const zoneColor: Record<string, string> = {
  Kyl: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  Frys: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  Torrt: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Produktion: "bg-purple-500/10 text-purple-600 border-purple-500/20",
};

type InventoryLine = {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  cost_price: number;
  quantity: string;
};

const fmt = (v: number) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(v);

export default function Inventory() {
  const { toast } = useToast();
  const { activeStoreId, activeStoreName, site } = useSite();
  const [search, setSearch] = useState("");
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());

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

  // Lagerrapport state
  const [invLines, setInvLines] = useState<InventoryLine[]>([]);
  const [invProductSearch, setInvProductSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [invSaving, setInvSaving] = useState(false);
  const [invLocation, setInvLocation] = useState("");

  // Stock action state (purchasing portal)
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<string>>>(new Map()); // locationId -> Set of stock item ids
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [transformDialogOpen, setTransformDialogOpen] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [deleteReason, setDeleteReason] = useState("");
  const [splitQty, setSplitQty] = useState("");
  const [splitTargetLocation, setSplitTargetLocation] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  // Transform state
  const [transformTargetProduct, setTransformTargetProduct] = useState("");
  const [transformNewWeight, setTransformNewWeight] = useState("");
  const [transformProductSearch, setTransformProductSearch] = useState("");

  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const queryClient = useQueryClient();
  const storeFilter = activeStoreId || "all";
  const { data: locations = [], isLoading: loadingLoc } = useStorageLocations(storeFilter !== "all" ? storeFilter : undefined);
  const { data: allStock = [], isLoading: loadingStock } = useAllStockByLocation();
  const createLocation = useCreateStorageLocation();
  const upsertStock = useUpsertStockLocation();

  const getSelectedForLocation = (locId: string) => selectedItems.get(locId) || new Set<string>();
  const toggleItemSelection = (locId: string, itemId: string) => {
    setSelectedItems(prev => {
      const next = new Map(prev);
      const set = new Set(next.get(locId) || []);
      if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
      if (set.size === 0) next.delete(locId); else next.set(locId, set);
      return next;
    });
  };
  const clearSelection = (locId: string) => {
    setSelectedItems(prev => { const next = new Map(prev); next.delete(locId); return next; });
  };

  const getSelectedStockItems = (locId: string) => {
    const ids = getSelectedForLocation(locId);
    return allStock.filter((s: any) => ids.has(s.id));
  };

  const invalidateStock = () => {
    queryClient.invalidateQueries({ queryKey: ["product_stock_locations"] });
    queryClient.invalidateQueries({ queryKey: ["all_stock_locations"] });
  };

  const handleMove = async (targetLocationId: string) => {
    setActionLoading(true);
    try {
      const items = getSelectedStockItems(activeLocationId);
      for (const item of items) {
        // Check if product already exists at target
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id, quantity, unit_cost")
          .eq("product_id", item.product_id)
          .eq("location_id", targetLocationId)
          .maybeSingle();

        const itemCost = Number(item.unit_cost) || 0;
        if (existing) {
          const oldTotal = Number(existing.quantity) * (Number(existing.unit_cost) || 0);
          const newTotal = Number(item.quantity) * itemCost;
          const combinedQty = Number(existing.quantity) + Number(item.quantity);
          const avgCost = combinedQty > 0 ? (oldTotal + newTotal) / combinedQty : 0;
          await supabase.from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations")
            .insert({ product_id: item.product_id, location_id: targetLocationId, quantity: Number(item.quantity), unit_cost: itemCost });
        }
        // Remove from source
        await supabase.from("product_stock_locations").delete().eq("id", item.id);
      }

      // Auto-update order statuses to "Packad" if moving to a Pre-location
      const movedProductIds = items.map((i: any) => i.product_id);
      await markOrderLinesPackad(movedProductIds, targetLocationId);
      // Reverse sync: revert order lines if stock no longer supports their status
      await revertOrderLinesIfStockGone();

      clearSelection(activeLocationId);
      invalidateStock();
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast({ title: "Flyttat", description: `${items.length} produkt(er) flyttade` });
      setMoveDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const handleDelete = async () => {
    if (!deleteReason.trim()) return;
    setActionLoading(true);
    try {
      const items = getSelectedStockItems(activeLocationId);
      for (const item of items) {
        await supabase.from("deleted_stock_log").insert({
          product_id: item.product_id,
          location_id: item.location_id,
          quantity: Number(item.quantity),
          reason: deleteReason.trim(),
        });
        await supabase.from("product_stock_locations").delete().eq("id", item.id);
      }
      clearSelection(activeLocationId);
      invalidateStock();
      toast({ title: "Raderat", description: `${items.length} produkt(er) raderade` });
      setDeleteDialogOpen(false);
      setDeleteReason("");
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const handleSplit = async () => {
    if (!splitQty || !splitTargetLocation) return;
    setActionLoading(true);
    try {
      const items = getSelectedStockItems(activeLocationId);
      // Split only works on first selected item
      const item = items[0];
      const splitAmount = Number(splitQty);
      const remaining = Number(item.quantity) - splitAmount;
      if (splitAmount <= 0 || splitAmount >= Number(item.quantity)) {
        toast({ title: "Ogiltigt antal", description: "Ange ett antal mindre än nuvarande.", variant: "destructive" });
        setActionLoading(false);
        return;
      }
      // Update source quantity
      await supabase.from("product_stock_locations")
        .update({ quantity: remaining, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      const itemCost = Number(item.unit_cost) || 0;
      // If splitting to the SAME location, always create a new row
      if (splitTargetLocation === activeLocationId) {
        await supabase.from("product_stock_locations")
          .insert({ product_id: item.product_id, location_id: splitTargetLocation, quantity: splitAmount, unit_cost: itemCost });
      } else {
        // Add/merge to target, preserving unit_cost
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id, quantity, unit_cost")
          .eq("product_id", item.product_id)
          .eq("location_id", splitTargetLocation)
          .maybeSingle();
        if (existing) {
          const oldTotal = Number(existing.quantity) * (Number(existing.unit_cost) || 0);
          const combinedQty = Number(existing.quantity) + splitAmount;
          const avgCost = combinedQty > 0 ? (oldTotal + splitAmount * itemCost) / combinedQty : 0;
          await supabase.from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations")
            .insert({ product_id: item.product_id, location_id: splitTargetLocation, quantity: splitAmount, unit_cost: itemCost });
        }
      }
      clearSelection(activeLocationId);
      invalidateStock();
      toast({ title: "Splittat", description: `${splitAmount} ${item.products?.unit || "kg"} flyttades` });
      setSplitDialogOpen(false);
      setSplitQty("");
      setSplitTargetLocation("");
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  const handleTransform = async () => {
    if (!transformTargetProduct || !transformNewWeight) return;
    setActionLoading(true);
    try {
      const items = getSelectedStockItems(activeLocationId);
      const item = items[0];
      const newWeight = Number(transformNewWeight);
      const oldWeight = Number(item.quantity);
      if (newWeight <= 0 || newWeight >= oldWeight) {
        toast({ title: "Ogiltig vikt", description: "Ny vikt måste vara mindre än nuvarande.", variant: "destructive" });
        setActionLoading(false);
        return;
      }
      const weightLoss = oldWeight - newWeight;
      const itemCost = Number(item.unit_cost) || 0;
      // Cost per kg stays the same for original, but total cost transfers to new product
      const totalCostTransfer = oldWeight * itemCost; // total value of original
      const newUnitCost = newWeight > 0 ? totalCostTransfer / newWeight : 0; // cost concentrates into less weight

      // Remove the original stock row
      await supabase.from("product_stock_locations").delete().eq("id", item.id);

      // Insert transformed product at the same location
      await supabase.from("product_stock_locations").insert({
        product_id: transformTargetProduct,
        location_id: item.location_id,
        quantity: newWeight,
        unit_cost: newUnitCost,
      });

      // Log the weight loss
      await supabase.from("deleted_stock_log").insert({
        product_id: item.product_id,
        location_id: item.location_id,
        quantity: weightLoss,
        reason: `Omvandling: ${item.products?.name} → ${products.find(p => p.id === transformTargetProduct)?.name || "okänd"} (svinn ${weightLoss.toFixed(2)} ${item.products?.unit || "kg"})`,
      });

      clearSelection(activeLocationId);
      invalidateStock();
      toast({ title: "Omvandlad", description: `${item.products?.name} → ${products.find(p => p.id === transformTargetProduct)?.name}, ${newWeight} ${item.products?.unit || "kg"} (svinn: ${weightLoss.toFixed(2)})` });
      setTransformDialogOpen(false);
      setTransformTargetProduct("");
      setTransformNewWeight("");
      setTransformProductSearch("");
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  // Compute aggregated stock: "Total Butik" should include stock from all other locations in the same store
  const storeStock = useMemo(() => {
    let filtered = allStock;
    if (activeStoreId) {
      filtered = allStock.filter((s: any) => s.storage_locations?.store_id === activeStoreId);
    }

    // Aggregate: combine quantities across all locations per product, 
    // and also keep individual location entries for the detail view
    // For KPIs we use aggregated (unique product) totals
    if (search) {
      filtered = filtered.filter((s: any) =>
        s.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.products?.sku?.toLowerCase().includes(search.toLowerCase())
      );
    }
    return filtered;
  }, [allStock, activeStoreId, search]);

  // Aggregated stock per product (summing across all locations in the store) for KPIs
  const aggregatedStock = useMemo(() => {
    const map = new Map<string, { quantity: number; cost_price: number; min_stock: number; product: any }>();
    storeStock.forEach((s: any) => {
      const pid = s.product_id;
      const existing = map.get(pid);
      if (existing) {
        existing.quantity += Number(s.quantity) || 0;
        existing.min_stock += Number(s.min_stock) || 0;
      } else {
        map.set(pid, {
          quantity: Number(s.quantity) || 0,
          cost_price: Number(s.products?.cost_price) || 0,
          min_stock: Number(s.min_stock) || 0,
          product: s.products,
        });
      }
    });
    return map;
  }, [storeStock]);

  // Group stock by category
  const stockByCategory = useMemo(() => {
    const groups: Record<string, any[]> = {};
    storeStock.forEach((s: any) => {
      const cat = s.products?.category || "Övrigt";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "sv"));
  }, [storeStock]);

  // KPIs (aggregated per product to avoid double-counting across locations)
  const totalProducts = aggregatedStock.size;
  const totalQty = Array.from(aggregatedStock.values()).reduce((s, i) => s + i.quantity, 0);
  const totalValue = storeStock.reduce((s: number, i: any) => s + Number(i.quantity) * (Number(i.unit_cost) || Number(i.products?.cost_price) || 0), 0);
  const lowStockItems = Array.from(aggregatedStock.values()).filter(i => i.min_stock > 0 && i.quantity < i.min_stock).length;

  const toggleCategory = (cat: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  const toggleLocation = (locId: string) => {
    setExpandedLocations(prev => {
      const next = new Set(prev);
      if (next.has(locId)) next.delete(locId); else next.add(locId);
      return next;
    });
  };

  const isLocationPortal = site === "purchasing" || site === "production";

  const expandAll = () => {
    if (isLocationPortal) {
      setExpandedLocations(new Set(portalLocations.map((l: any) => l.id)));
    } else {
      setExpandedCategories(new Set(stockByCategory.map(([cat]) => cat)));
    }
  };

  const collapseAll = () => {
    if (isLocationPortal) {
      setExpandedLocations(new Set());
    } else {
      setExpandedCategories(new Set());
    }
  };

  

  // Filter locations by zone for purchasing/production portals
  const portalLocations = useMemo(() => {
    if (site === "purchasing") {
      return locations.filter((loc: any) => loc.zone === "Inköp" || loc.name === "Grossist Flytande");
    }
    if (site === "production") {
      return locations.filter((loc: any) => loc.zone === "Produktion" || loc.name === "Grossist Flytande");
    }
    return locations;
  }, [locations, site]);

  // Stock grouped by location for purchasing/production portal
  const stockByLocation = useMemo(() => {
    return portalLocations.map((loc: any) => {
      let items = allStock.filter((s: any) => s.location_id === loc.id);
      if (search) {
        items = items.filter((s: any) =>
          s.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.products?.sku?.toLowerCase().includes(search.toLowerCase())
        );
      }
      const totalQty = items.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
      const totalValue = items.reduce((sum: number, s: any) => sum + Number(s.quantity) * (Number(s.unit_cost) || Number(s.products?.cost_price) || 0), 0);
      return { ...loc, items, totalQty, totalValue };
    });
  }, [portalLocations, allStock, search]);

  // --- Location dialog ---
  const handleCreateLocation = () => {
    if (!locName || !locStore) return;
    createLocation.mutate({ name: locName, store_id: locStore, zone: locZone || undefined, description: locDesc || undefined }, {
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
    upsertStock.mutate({ product_id: stockProduct, location_id: stockLocation, quantity: Number(stockQty), min_stock: stockMin ? Number(stockMin) : 0 }, {
      onSuccess: () => {
        toast({ title: "Lagersaldo uppdaterat" });
        setStockDialogOpen(false);
        setStockProduct(""); setStockLocation(""); setStockQty(""); setStockMin("");
      },
      onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
    });
  };

  // --- Lagerrapport logic ---
  const addProductToReport = (product: any) => {
    if (invLines.find(l => l.product_id === product.id)) {
      toast({ title: "Redan tillagd", description: product.name }); return;
    }
    setInvLines(prev => [...prev, {
      product_id: product.id, product_name: product.name,
      sku: product.sku, unit: product.unit, category: product.category,
      cost_price: Number(product.cost_price) || 0, quantity: "",
    }]);
    setInvProductSearch("");
  };

  const handleScan = (code: string) => {
    const product = products.find((p: any) => (p as any).barcode === code);
    if (product) {
      addProductToReport(product);
      toast({ title: "Produkt skannad", description: product.name });
    } else {
      toast({ title: "Okänd streckkod", description: `Kod: ${code}`, variant: "destructive" });
    }
    setShowScanner(false);
  };

  const updateInvLine = (idx: number, qty: string) => {
    setInvLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  const removeInvLine = (idx: number) => {
    setInvLines(prev => prev.filter((_, i) => i !== idx));
  };

  const reportTotalValue = invLines.reduce((sum, l) => {
    const qty = Number(l.quantity) || 0;
    return sum + qty * l.cost_price;
  }, 0);

  const saveReport = async () => {
    if (!invLocation || invLines.length === 0) return;
    const validLines = invLines.filter(l => l.quantity !== "" && !isNaN(Number(l.quantity)));
    if (validLines.length === 0) { toast({ title: "Ange antal för minst en produkt", variant: "destructive" }); return; }
    setInvSaving(true);
    try {
      for (const line of validLines) {
        await upsertStock.mutateAsync({
          product_id: line.product_id,
          location_id: invLocation,
          quantity: Number(line.quantity),
        });
      }

      // Save inventory report history
      const loc = locations.find(l => l.id === invLocation);
      const totalValue = validLines.reduce((sum, l) => sum + Number(l.quantity) * l.cost_price, 0);
      const { data: report } = await supabase
        .from("inventory_reports")
        .insert({
          store_id: activeStoreId!,
          location_id: invLocation,
          location_name: loc?.name || "Okänd",
          total_value: Math.round(totalValue),
          line_count: validLines.length,
        })
        .select()
        .single();

      if (report) {
        const reportLines = validLines.map(l => ({
          report_id: report.id,
          product_id: l.product_id,
          product_name: l.product_name,
          sku: l.sku,
          unit: l.unit,
          category: l.category,
          quantity: Number(l.quantity),
          cost_price: l.cost_price,
          line_value: Number(l.quantity) * l.cost_price,
        }));
        await supabase.from("inventory_report_lines").insert(reportLines);
      }

      toast({ title: "Lagerrapport sparad", description: `${validLines.length} produkter uppdaterade · Lagervärde: ${fmt(reportTotalValue)}` });
      setInvLines([]);
      setReportDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setInvSaving(false);
  };

  const filteredProductsForAdd = products.filter(p =>
    invProductSearch &&
    (p.name.toLowerCase().includes(invProductSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(invProductSearch.toLowerCase())) &&
    !invLines.find(l => l.product_id === p.id)
  ).slice(0, 8);

  // Group report lines by category for display
  const reportLinesByCategory = useMemo(() => {
    const groups: Record<string, InventoryLine[]> = {};
    invLines.forEach((l, idx) => {
      const cat = l.category || "Övrigt";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ ...l, quantity: l.quantity });
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "sv"));
  }, [invLines]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">
            Lager {activeStoreName ? `— ${activeStoreName}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">Lageröversikt och lagerrapporter</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setReportDialogOpen(true)}>
            <ClipboardList className="h-3 w-3" /> Skapa lagerrapport
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Produkter i lager</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalProducts}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Total kvantitet</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalQty.toLocaleString("sv-SE")}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Lagervärde (SEK)</p>
          <p className="text-xl font-heading font-bold text-foreground">{fmt(totalValue)}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /> Lågt lager</p>
          <p className="text-xl font-heading font-bold text-destructive">{lowStockItems}</p>
        </CardContent></Card>
      </div>

      {isLocationPortal ? (
        /* ── INKÖP/PRODUKTION PORTAL: Location accordion ── */
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Lager per destination</CardTitle>
                <CardDescription className="text-xs">{stockByLocation.length} lagerställen</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={expandAll}>Visa alla</Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={collapseAll}>Dölj alla</Button>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Sök produkt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLoc || loadingStock ? <Skeleton className="h-48" /> : stockByLocation.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Inga lagerställen</p>
              </div>
            ) : (
              <div className="space-y-1">
                {stockByLocation.map((loc: any) => {
                  const isExpanded = expandedLocations.has(loc.id);
                  return (
                     <div key={loc.id} className="border border-border/50 rounded-md overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors">
                        <button
                          className="flex items-center gap-2 flex-1 text-left"
                          onClick={() => toggleLocation(loc.id)}
                        >
                          {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-medium text-foreground">{loc.name}</span>
                          <Badge variant="secondary" className="text-[10px] h-5">{loc.items.length} produkter</Badge>
                        </button>
                        <div className="flex items-center gap-2">
                          {getSelectedForLocation(loc.id).size > 0 && (
                            <div className="flex items-center gap-1 mr-2">
                              <Badge variant="outline" className="text-[10px] h-5">{getSelectedForLocation(loc.id).size} valda</Badge>
                              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => { setActiveLocationId(loc.id); setMoveDialogOpen(true); }}>
                                <Move className="h-3 w-3" /> Flytta
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setActiveLocationId(loc.id); setDeleteDialogOpen(true); }}>
                                <Trash2 className="h-3 w-3" /> Radera
                              </Button>
                              {getSelectedForLocation(loc.id).size === 1 && (
                                <>
                                  <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1" onClick={() => { setActiveLocationId(loc.id); setSplitDialogOpen(true); }}>
                                    <Scissors className="h-3 w-3" /> Splitta
                                  </Button>
                                  {site === "production" && (
                                    <Button variant="outline" size="sm" className="h-6 px-2 text-[10px] gap-1 text-purple-600 border-purple-300 hover:bg-purple-50" onClick={() => { setActiveLocationId(loc.id); setTransformDialogOpen(true); }}>
                                      <RefreshCw className="h-3 w-3" /> Omvandla
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground">{loc.totalQty.toLocaleString("sv-SE")} kg</span>
                          <span className="text-xs font-medium text-foreground">{fmt(loc.totalValue)}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="border-t border-border/50">
                          {loc.items.length === 0 ? (
                            <div className="px-3 py-4 text-center text-xs text-muted-foreground">Tomt lager</div>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-muted/20">
                                  <th className="px-3 py-1.5 w-8"></th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
                                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Kategori</th>
                                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Antal</th>
                                  <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Värde</th>
                                </tr>
                              </thead>
                              <tbody>
                                {loc.items.map((s: any) => {
                                  const value = Number(s.quantity) * (Number(s.unit_cost) || Number(s.products?.cost_price) || 0);
                                  const isChecked = getSelectedForLocation(loc.id).has(s.id);
                                  return (
                                    <tr key={s.id} className={`border-b border-border/30 last:border-0 hover:bg-muted/20 ${isChecked ? "bg-primary/5" : ""}`}>
                                      <td className="px-3 py-2 text-center">
                                        <Checkbox checked={isChecked} onCheckedChange={() => toggleItemSelection(loc.id, s.id)} />
                                      </td>
                                      <td className="px-3 py-2 font-medium text-foreground">{s.products?.name}</td>
                                      <td className="px-3 py-2 font-mono text-muted-foreground text-[10px]">{s.products?.sku}</td>
                                      <td className="px-3 py-2 text-muted-foreground">{s.products?.category}</td>
                                      <td className="px-3 py-2 text-right font-medium text-foreground">
                                        {Number(s.quantity).toLocaleString("sv-SE")} {s.products?.unit}
                                      </td>
                                      <td className="px-3 py-2 text-right text-muted-foreground">{fmt(value)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* ── DEFAULT: Tabs layout for other portals ── */
        <Tabs defaultValue="overview" className="space-y-3">
          <TabsList className="h-8">
            <TabsTrigger value="overview" className="text-xs h-7">📦 Lageröversikt</TabsTrigger>
            <TabsTrigger value="locations" className="text-xs h-7">📍 Lagerställen</TabsTrigger>
          </TabsList>

          {/* Overview Tab - Stock by Category */}
          <TabsContent value="overview">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-heading">Lagersaldo per kategori</CardTitle>
                    <CardDescription className="text-xs">
                      {activeStoreName || "Alla butiker"} · {stockByCategory.length} kategorier
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={expandAll}>Visa alla</Button>
                    <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={collapseAll}>Dölj alla</Button>
                    <div className="relative w-48">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input placeholder="Sök produkt..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingStock ? <Skeleton className="h-48" /> : stockByCategory.length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">Inga lagersaldon registrerade</p>
                    <p className="text-xs text-muted-foreground mb-4">Skapa en lagerrapport för att registrera lagersaldo.</p>
                    <Button size="sm" onClick={() => setReportDialogOpen(true)} className="gap-1.5">
                      <ClipboardList className="h-3 w-3" /> Skapa lagerrapport
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {stockByCategory.map(([category, items]) => {
                      const isExpanded = expandedCategories.has(category);
                      const catQty = items.reduce((s: number, i: any) => s + Number(i.quantity), 0);
                      const catValue = items.reduce((s: number, i: any) => s + Number(i.quantity) * (Number(i.products?.cost_price) || 0), 0);
                      const catLowStock = items.filter((i: any) => Number(i.min_stock) > 0 && Number(i.quantity) < Number(i.min_stock)).length;

                      return (
                        <div key={category} className="border border-border/50 rounded-md overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
                            onClick={() => toggleCategory(category)}
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <span className="text-sm font-medium text-foreground">{category}</span>
                              <Badge variant="secondary" className="text-[10px] h-5">{items.length} produkter</Badge>
                              {catLowStock > 0 && (
                                <Badge variant="outline" className="text-[10px] h-5 bg-destructive/10 text-destructive border-destructive/20">
                                  <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> {catLowStock}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{catQty.toLocaleString("sv-SE")} kg</span>
                              <span className="font-medium text-foreground">{fmt(catValue)}</span>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-border/50">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/20">
                                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Produkt</th>
                                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
                                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Plats</th>
                                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Antal</th>
                                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Värde</th>
                                    <th className="px-3 py-1.5 text-right font-medium text-muted-foreground">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((s: any) => {
                                    const isLow = Number(s.min_stock) > 0 && Number(s.quantity) < Number(s.min_stock);
                                    const value = Number(s.quantity) * (Number(s.products?.cost_price) || 0);
                                    return (
                                      <tr key={s.id} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                                        <td className="px-3 py-2 font-medium text-foreground">{s.products?.name}</td>
                                        <td className="px-3 py-2 font-mono text-muted-foreground text-[10px]">{s.products?.sku}</td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                          {zoneIcon[s.storage_locations?.zone] || "📍"} {s.storage_locations?.name}
                                        </td>
                                        <td className="px-3 py-2 text-right font-medium text-foreground">
                                          {Number(s.quantity).toLocaleString("sv-SE")} {s.products?.unit}
                                        </td>
                                        <td className="px-3 py-2 text-right text-muted-foreground">{fmt(value)}</td>
                                        <td className="px-3 py-2 text-right">
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Locations Tab */}
          <TabsContent value="locations">
            <div className="flex justify-end gap-2 mb-3">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => setStockDialogOpen(true)}>
                <ArrowRightLeft className="h-3 w-3" /> Uppdatera saldo
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setLocationDialogOpen(true)}>
                <Plus className="h-3 w-3" /> Nytt lagerställe
              </Button>
            </div>
            {loadingLoc ? <Skeleton className="h-48" /> : locations.length === 0 ? (
              <Card className="shadow-card"><CardContent className="p-8 text-center">
                <p className="text-xs text-muted-foreground">Inga lagerställen ännu. Klicka "Nytt lagerställe" för att börja.</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {locations.map((loc: any) => {
                  const locStock = allStock.filter((s: any) => s.location_id === loc.id);
                  const totalQtyLoc = locStock.reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
                  const productCount = locStock.length;
                  const lowStockCount = locStock.filter((s: any) => Number(s.min_stock) > 0 && Number(s.quantity) < Number(s.min_stock)).length;
                  return (
                    <Card key={loc.id} className="shadow-card">
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
                            <p className="text-lg font-bold text-foreground">{productCount}</p>
                            <p className="text-[9px] text-muted-foreground">Produkter</p>
                          </div>
                          <div>
                            <p className="text-lg font-bold text-foreground">{totalQtyLoc.toLocaleString("sv-SE")}</p>
                            <p className="text-[9px] text-muted-foreground">Kvantitet</p>
                          </div>
                          <div>
                            <p className={`text-lg font-bold ${lowStockCount > 0 ? "text-destructive" : "text-success"}`}>{lowStockCount}</p>
                            <p className="text-[9px] text-muted-foreground">Varningar</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Lagerrapport Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Skapa lagerrapport
            </DialogTitle>
            <DialogDescription className="text-xs">
              Välj lagerställe, lägg till produkter och ange aktuellt antal. Enheten (kg/st) styrs av produktens inställning.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Location picker + scanner */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs font-medium">Lagerställe *</Label>
                <Select value={invLocation} onValueChange={setInvLocation}>
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
              <div className="flex items-end gap-2">
                <Button
                  variant="outline" size="sm" className="gap-1.5 text-xs h-8"
                  onClick={() => setShowScanner(!showScanner)}
                  disabled={!invLocation}
                >
                  <Camera className="h-3 w-3" /> {showScanner ? "Stäng skanner" : "Scanna"}
                </Button>
              </div>
            </div>

            {showScanner && invLocation && (
              <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />
            )}

            {/* Product search */}
            {invLocation && (
              <div className="relative">
                <Label className="text-xs font-medium mb-1.5 block">Lägg till produkt</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt (namn eller SKU)..."
                    value={invProductSearch}
                    onChange={e => setInvProductSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {filteredProductsForAdd.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredProductsForAdd.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between"
                        onClick={() => addProductToReport(p)}
                      >
                        <div>
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-muted-foreground ml-2 text-[10px]">{p.category}</span>
                        </div>
                        <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Lines grouped by category */}
            {invLines.length > 0 && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {invLines.length} produkt{invLines.length > 1 ? "er" : ""} tillagda
                  </span>
                  <span className="text-xs font-semibold text-foreground">
                    Lagervärde: {fmt(reportTotalValue)}
                  </span>
                </div>

                {reportLinesByCategory.map(([category, catLines]) => (
                  <div key={category}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {catLines.map((line) => {
                            const globalIdx = invLines.findIndex(l => l.product_id === line.product_id);
                            return (
                              <tr key={line.product_id} className="border-b border-border/30">
                                <td className="py-1.5 font-medium text-foreground">{line.product_name}</td>
                                <td className="py-1.5 font-mono text-muted-foreground text-[10px] w-20">{line.sku}</td>
                                <td className="py-1.5 text-muted-foreground w-12 text-center">
                                  <Badge variant="secondary" className="text-[10px]">{line.unit}</Badge>
                                </td>
                                <td className="py-1.5 text-right w-28">
                                  <Input
                                    type="number"
                                    step={line.unit.toLowerCase() === "kg" ? "0.1" : "1"}
                                    value={line.quantity}
                                    onChange={e => updateInvLine(globalIdx, e.target.value)}
                                    className="h-7 text-xs w-24 ml-auto text-right"
                                    placeholder={`0 ${line.unit}`}
                                  />
                                </td>
                                <td className="py-1.5 w-8">
                                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeInvLine(globalIdx)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end pt-2">
                  <Button size="sm" className="gap-1.5" onClick={saveReport} disabled={invSaving || !invLocation}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {invSaving ? "Sparar..." : "Spara lagerrapport"}
                  </Button>
                </div>
              </div>
            )}

            {!invLocation && (
              <p className="text-xs text-muted-foreground py-6 text-center">
                👆 Välj ett lagerställe ovan för att börja
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* ── FLYTTA dialog ── */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Flytta produkter</DialogTitle>
            <DialogDescription className="text-xs">
              Välj destination för {getSelectedForLocation(activeLocationId).size} valda produkt(er).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {locations
              .filter((l: any) => l.id !== activeLocationId)
              .filter((l: any) => {
                // Portal-based filtering: only show locations relevant to current portal
                const name = (l.name || "").toLowerCase();
                const isGrossistFlytande = name.includes("grossist flytande");
                if (site === "purchasing") {
                  // Inköp portal: Grossist Flytande + Pre-* Inköp locations
                  return isGrossistFlytande || name.includes("inköp");
                }
                if (site === "production") {
                  // Produktion portal: Grossist Flytande + Pre-* Produktion locations
                  return isGrossistFlytande || name.includes("produktion");
                }
                return true; // wholesale sees all
              })
              .map((loc: any) => (
              <button
                key={loc.id}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-border/50 hover:bg-muted/40 transition-colors text-left"
                onClick={() => handleMove(loc.id)}
                disabled={actionLoading}
              >
                <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground">{loc.name}</span>
                {loc.zone && <Badge variant="secondary" className="text-[10px] h-5">{loc.zone}</Badge>}
              </button>
            ))}
          </div>
          {actionLoading && <p className="text-xs text-muted-foreground text-center">Flyttar...</p>}
        </DialogContent>
      </Dialog>

      {/* ── RADERA dialog ── */}
      <Dialog open={deleteDialogOpen} onOpenChange={(o) => { setDeleteDialogOpen(o); if (!o) setDeleteReason(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Radera produkter</DialogTitle>
            <DialogDescription className="text-xs">
              {getSelectedForLocation(activeLocationId).size} produkt(er) kommer tas bort från lagret. Ange en anledning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Anledning *</Label>
              <Textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                placeholder="T.ex. Utgånget, skadat, felrapporterat..."
                className="text-xs min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!deleteReason.trim() || actionLoading}>
              {actionLoading ? "Raderar..." : "Bekräfta radering"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SPLITTA dialog ── */}
      <Dialog open={splitDialogOpen} onOpenChange={(o) => { setSplitDialogOpen(o); if (!o) { setSplitQty(""); setSplitTargetLocation(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Splitta produkt</DialogTitle>
            <DialogDescription className="text-xs">
              Dela upp kvantiteten till ett annat lagerställe.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const items = getSelectedStockItems(activeLocationId);
            const item = items[0];
            if (!item) return null;
            return (
              <div className="space-y-3">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-xs font-medium text-foreground">{item.products?.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Nuvarande: {Number(item.quantity).toLocaleString("sv-SE")} {item.products?.unit || "kg"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Antal att splitta *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={splitQty}
                    onChange={e => setSplitQty(e.target.value)}
                    placeholder={`Max ${Number(item.quantity) - 0.1}`}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Destination *</Label>
                   <div className="space-y-1 max-h-40 overflow-y-auto">
                    {portalLocations.map((loc: any) => (
                      <button
                        key={loc.id}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border transition-colors text-left text-xs ${splitTargetLocation === loc.id ? "border-primary bg-primary/10" : "border-border/50 hover:bg-muted/40"}`}
                        onClick={() => setSplitTargetLocation(loc.id)}
                      >
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium text-foreground">{loc.name}</span>
                        {loc.id === activeLocationId && <Badge variant="secondary" className="text-[9px] ml-auto">Samma plats (ny rad)</Badge>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSplitDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleSplit} disabled={!splitQty || !splitTargetLocation || actionLoading}>
              {actionLoading ? "Splittar..." : "Bekräfta split"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── OMVANDLA dialog (production only) ── */}
      <Dialog open={transformDialogOpen} onOpenChange={(o) => { setTransformDialogOpen(o); if (!o) { setTransformTargetProduct(""); setTransformNewWeight(""); setTransformProductSearch(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Omvandla produkt</DialogTitle>
            <DialogDescription className="text-xs">
              Ändra en råvara till en beredd produkt. Viktskillnaden tas bort från lagret som svinn.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const items = getSelectedStockItems(activeLocationId);
            const item = items[0];
            if (!item) return null;
            const filteredTransformProducts = products.filter(p =>
              p.id !== item.product_id &&
              transformProductSearch &&
              (p.name.toLowerCase().includes(transformProductSearch.toLowerCase()) ||
               p.sku.toLowerCase().includes(transformProductSearch.toLowerCase()))
            ).slice(0, 8);
            const selectedProduct = products.find(p => p.id === transformTargetProduct);
            return (
              <div className="space-y-3">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-xs font-medium text-foreground">{item.products?.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Nuvarande: {Number(item.quantity).toLocaleString("sv-SE")} {item.products?.unit || "kg"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Omvandla till produkt *</Label>
                  {selectedProduct ? (
                    <div className="flex items-center gap-2 p-2 rounded-md border border-primary/30 bg-primary/5">
                      <span className="text-xs font-medium text-foreground flex-1">{selectedProduct.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{selectedProduct.sku}</Badge>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { setTransformTargetProduct(""); setTransformProductSearch(""); }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={transformProductSearch}
                        onChange={e => setTransformProductSearch(e.target.value)}
                        placeholder="Sök produkt (t.ex. Bergtungafilé)..."
                        className="h-8 text-xs"
                      />
                      {filteredTransformProducts.length > 0 && (
                        <div className="border border-border/50 rounded-md max-h-32 overflow-y-auto">
                          {filteredTransformProducts.map(p => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-1.5 hover:bg-muted/40 text-xs flex items-center justify-between"
                              onClick={() => { setTransformTargetProduct(p.id); setTransformProductSearch(""); }}
                            >
                              <span className="font-medium text-foreground">{p.name}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">{p.sku}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ny vikt efter omvandling ({item.products?.unit || "kg"}) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={transformNewWeight}
                    onChange={e => setTransformNewWeight(e.target.value)}
                    placeholder={`Mindre än ${Number(item.quantity)}`}
                    className="h-8 text-xs"
                  />
                  {transformNewWeight && Number(transformNewWeight) > 0 && Number(transformNewWeight) < Number(item.quantity) && (
                    <p className="text-[10px] text-muted-foreground">
                      Svinn: {(Number(item.quantity) - Number(transformNewWeight)).toFixed(2)} {item.products?.unit || "kg"} 
                      ({((1 - Number(transformNewWeight) / Number(item.quantity)) * 100).toFixed(1)}%)
                    </p>
                  )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTransformDialogOpen(false)}>Avbryt</Button>
            <Button size="sm" onClick={handleTransform} disabled={!transformTargetProduct || !transformNewWeight || actionLoading}>
              {actionLoading ? "Omvandlar..." : "Bekräfta omvandling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
