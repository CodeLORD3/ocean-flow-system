import { useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { markOrderLinesPackad, revertOrderLinesIfStockGone } from "@/lib/orderStatusSync";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Warehouse,
  Search,
  Plus,
  Package,
  AlertTriangle,
  MapPin,
  Truck,
  Edit,
  ArrowRightLeft,
  ScanLine,
  Camera,
  ClipboardList,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Scissors,
  Move,
  RefreshCw,
  Clock,
  Calendar,
  Thermometer,
  AlertCircle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { format, differenceInDays, parseISO } from "date-fns";
import { sv } from "date-fns/locale";

/** Convert a stock item's quantity to kg, using weight_per_piece for ST products */
function qtyToKg(quantity: number, product: any): number {
  if (!product) return quantity;
  const unit = (product.unit || "kg").toLowerCase();
  if (unit === "st" && Number(product.weight_per_piece) > 0) {
    return quantity * Number(product.weight_per_piece);
  }
  return quantity;
}

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

// ── Freshness helper ─────────────────────────────────────────────────────────
type FreshnessInfo = {
  label: string;
  badgeClass: string;
  rowClass: string;
  daysLeft: number;
  isExpired: boolean;
  isCritical: boolean;
};

function getFreshnessInfo(expiryDate?: string | null): FreshnessInfo | null {
  if (!expiryDate) return null;
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)
    return {
      label: `Utgången (${Math.abs(days)}d)`,
      badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
      rowClass: "bg-destructive/5",
      daysLeft: days,
      isExpired: true,
      isCritical: true,
    };
  if (days <= 2)
    return {
      label: `${days}d kvar`,
      badgeClass: "bg-destructive/10 text-destructive border-destructive/30",
      rowClass: "bg-destructive/5",
      daysLeft: days,
      isExpired: false,
      isCritical: true,
    };
  if (days <= 5)
    return {
      label: `${days}d kvar`,
      badgeClass: "bg-amber-500/10 text-amber-700 border-amber-500/30",
      rowClass: "bg-amber-500/5",
      daysLeft: days,
      isExpired: false,
      isCritical: false,
    };
  return {
    label: `${days}d kvar`,
    badgeClass: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
    rowClass: "",
    daysLeft: days,
    isExpired: false,
    isCritical: false,
  };
}

// ── FIFO warning: returns true if any OTHER batch for same product is older ──
function hasFifoIssue(item: any, allItems: any[]): boolean {
  if (!item.arrival_date) return false;
  return allItems.some(
    (other) =>
      other.product_id === item.product_id &&
      other.id !== item.id &&
      other.arrival_date &&
      parseISO(other.arrival_date) < parseISO(item.arrival_date),
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type InventoryLine = {
  product_id: string;
  product_name: string;
  sku: string;
  unit: string;
  category: string;
  cost_price: number;
  quantity: string;
  expiry_date?: string;
  arrival_date?: string;
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // Stock action state
  const [selectedItems, setSelectedItems] = useState<Map<string, Set<string>>>(new Map());
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [transformDialogOpen, setTransformDialogOpen] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [deleteReason, setDeleteReason] = useState("");
  const [splitQty, setSplitQty] = useState("");
  const [splitTargetLocation, setSplitTargetLocation] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [transformTargetProduct, setTransformTargetProduct] = useState("");
  const [transformNewWeight, setTransformNewWeight] = useState("");
  const [transformProductSearch, setTransformProductSearch] = useState("");

  // Expiry alerts panel
  const [showExpiryAlerts, setShowExpiryAlerts] = useState(false);

  const { data: stores = [] } = useStores();
  const { data: products = [] } = useProducts();
  const queryClient = useQueryClient();
  const storeFilter = activeStoreId || "all";
  const isGrossist = site === "wholesale" || site === "production";
  const { data: locations = [], isLoading: loadingLoc } = useStorageLocations(
    isGrossist ? undefined : storeFilter !== "all" ? storeFilter : undefined,
  );
  const { data: allStock = [], isLoading: loadingStock } = useAllStockByLocation();
  const createLocation = useCreateStorageLocation();
  const upsertStock = useUpsertStockLocation();

  const getSelectedForLocation = (locId: string) => selectedItems.get(locId) || new Set<string>();
  const toggleItemSelection = (locId: string, itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(locId) || []);
      if (set.has(itemId)) set.delete(itemId);
      else set.add(itemId);
      if (set.size === 0) next.delete(locId);
      else next.set(locId, set);
      return next;
    });
  };
  const clearSelection = (locId: string) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      next.delete(locId);
      return next;
    });
  };
  const getSelectedStockItems = (locId: string) => {
    const ids = getSelectedForLocation(locId);
    return allStock.filter((s: any) => ids.has(s.id));
  };
  const invalidateStock = () => {
    queryClient.invalidateQueries({ queryKey: ["product_stock_locations"] });
    queryClient.invalidateQueries({ queryKey: ["all_stock_locations"] });
  };

  // ── Expiry KPIs ─────────────────────────────────────────────────────────
  const expiryAlerts = useMemo(() => {
    return allStock
      .filter((s: any) => s.expiry_date)
      .map((s: any) => ({
        ...s,
        freshness: getFreshnessInfo(s.expiry_date),
      }))
      .filter((s: any) => s.freshness && s.freshness.daysLeft <= 5)
      .sort((a: any, b: any) => a.freshness.daysLeft - b.freshness.daysLeft);
  }, [allStock]);

  // ── Move / Delete / Split / Transform (unchanged logic) ──────────────────
  const handleMove = async (targetLocationId: string) => {
    setActionLoading(true);
    try {
      const items = getSelectedStockItems(activeLocationId);
      for (const item of items) {
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
          await supabase
            .from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations").insert({
            product_id: item.product_id,
            location_id: targetLocationId,
            quantity: Number(item.quantity),
            unit_cost: itemCost,
            expiry_date: item.expiry_date || null,
            arrival_date: item.arrival_date || null,
          });
        }
        await supabase.from("product_stock_locations").delete().eq("id", item.id);
      }
      await revertOrderLinesIfStockGone();
      const movedProductIds = items.map((i: any) => i.product_id);
      await markOrderLinesPackad(movedProductIds, targetLocationId);
      clearSelection(activeLocationId);
      invalidateStock();
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast({ title: "Flyttat", description: `${items.length} produkt(er) flyttade` });
      await logActivity({
        action_type: "update",
        description: `Lager flyttat: ${items.length} produkt(er)`,
        entity_type: "stock_transfer",
        details: { count: items.length, target_location: targetLocationId },
      });
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
      await revertOrderLinesIfStockGone();
      clearSelection(activeLocationId);
      invalidateStock();
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast({ title: "Raderat", description: `${items.length} produkt(er) raderade` });
      await logActivity({
        action_type: "delete",
        description: `Lager raderat: ${items.length} produkt(er) — ${deleteReason.trim()}`,
        entity_type: "stock_delete",
        details: { count: items.length, reason: deleteReason.trim() },
      });
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
      const item = items[0];
      const splitAmount = Number(splitQty);
      const remaining = Number(item.quantity) - splitAmount;
      if (splitAmount <= 0 || splitAmount >= Number(item.quantity)) {
        toast({ title: "Ogiltigt antal", variant: "destructive" });
        setActionLoading(false);
        return;
      }
      await supabase
        .from("product_stock_locations")
        .update({ quantity: remaining, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      const itemCost = Number(item.unit_cost) || 0;
      if (splitTargetLocation === activeLocationId) {
        await supabase.from("product_stock_locations").insert({
          product_id: item.product_id,
          location_id: splitTargetLocation,
          quantity: splitAmount,
          unit_cost: itemCost,
          expiry_date: item.expiry_date || null,
          arrival_date: item.arrival_date || null,
        });
      } else {
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id, quantity, unit_cost")
          .eq("product_id", item.product_id)
          .eq("location_id", splitTargetLocation)
          .maybeSingle();
        if (existing) {
          const combinedQty = Number(existing.quantity) + splitAmount;
          const avgCost =
            combinedQty > 0
              ? (Number(existing.quantity) * (Number(existing.unit_cost) || 0) + splitAmount * itemCost) / combinedQty
              : 0;
          await supabase
            .from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations").insert({
            product_id: item.product_id,
            location_id: splitTargetLocation,
            quantity: splitAmount,
            unit_cost: itemCost,
            expiry_date: item.expiry_date || null,
            arrival_date: item.arrival_date || null,
          });
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
        toast({ title: "Ogiltig vikt", variant: "destructive" });
        setActionLoading(false);
        return;
      }
      const weightLoss = oldWeight - newWeight;
      const itemCost = Number(item.unit_cost) || 0;
      const totalCostTransfer = oldWeight * itemCost;
      const newUnitCost = newWeight > 0 ? totalCostTransfer / newWeight : 0;
      await supabase.from("product_stock_locations").delete().eq("id", item.id);
      await supabase.from("product_stock_locations").insert({
        product_id: transformTargetProduct,
        location_id: item.location_id,
        quantity: newWeight,
        unit_cost: newUnitCost,
        arrival_date: new Date().toISOString().slice(0, 10),
      });
      await supabase.from("deleted_stock_log").insert({
        product_id: item.product_id,
        location_id: item.location_id,
        quantity: weightLoss,
        reason: `Omvandling: ${item.products?.name} → ${products.find((p) => p.id === transformTargetProduct)?.name || "okänd"} (svinn ${weightLoss.toFixed(2)} ${item.products?.unit || "kg"})`,
      });
      clearSelection(activeLocationId);
      invalidateStock();
      toast({
        title: "Omvandlad",
        description: `${item.products?.name} → ${products.find((p) => p.id === transformTargetProduct)?.name}, ${newWeight} ${item.products?.unit || "kg"} (svinn: ${weightLoss.toFixed(2)})`,
      });
      setTransformDialogOpen(false);
      setTransformTargetProduct("");
      setTransformNewWeight("");
      setTransformProductSearch("");
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setActionLoading(false);
  };

  // ── Stock aggregations ───────────────────────────────────────────────────
  const storeStock = useMemo(() => {
    let filtered = allStock;
    if (activeStoreId) {
      filtered = allStock.filter((s: any) => s.storage_locations?.store_id === activeStoreId);
    }
    if (search) {
      filtered = filtered.filter(
        (s: any) =>
          s.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
          s.products?.sku?.toLowerCase().includes(search.toLowerCase()),
      );
    }
    return filtered;
  }, [allStock, activeStoreId, search]);

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

  const portalLocations = useMemo(() => {
    const isPre = (loc: any) => (loc.name || "").toLowerCase().startsWith("pre-");
    const isShared = (loc: any) => loc.name === "Grossist Flytande" || loc.name === "Transportlager";
    if (site === "production") {
      return locations.filter((loc: any) => loc.zone === "Produktion" || isPre(loc) || isShared(loc));
    }
    if (site === "wholesale") {
      return locations.filter(
        (loc: any) => loc.zone === "Inköp" || isPre(loc) || isShared(loc) || loc.name?.startsWith("Raw"),
      );
    }
    return locations;
  }, [locations, site]);

  const stockByLocation = useMemo(() => {
    return portalLocations.map((loc: any) => {
      let items = allStock.filter((s: any) => s.location_id === loc.id);
      if (search) {
        items = items.filter(
          (s: any) =>
            s.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
            s.products?.sku?.toLowerCase().includes(search.toLowerCase()),
        );
      }
      const totalQty = items.reduce((sum: number, s: any) => sum + qtyToKg(Number(s.quantity), s.products), 0);
      const isRawLager = (loc.name || "").toLowerCase().startsWith("raw-");
      const totalValue = items.reduce((sum: number, s: any) => {
        const qty = Number(s.quantity);
        if (isRawLager) return sum + qty * (Number(s.products?.wholesale_price) || 0);
        return sum + qty * (Number(s.unit_cost) || Number(s.products?.cost_price) || 0);
      }, 0);
      // Count expiry warnings per location
      const expiryWarnings = items.filter((s: any) => {
        if (!s.expiry_date) return false;
        const f = getFreshnessInfo(s.expiry_date);
        return f && f.daysLeft <= 5;
      }).length;
      return { ...loc, items, totalQty, totalValue, expiryWarnings };
    });
  }, [portalLocations, allStock, search]);

  const groupedByStore = useMemo(() => {
    if (site !== "production" && site !== "wholesale") return [];
    const generalNames = ["Grossist Flytande", "Transportlager"];
    const storeGroups = new Map<
      string,
      { storeName: string; locations: typeof stockByLocation; totalQty: number; totalValue: number }
    >();
    const generalLocations: typeof stockByLocation = [];
    stockByLocation.forEach((loc: any) => {
      if (generalNames.includes(loc.name)) {
        generalLocations.push(loc);
        return;
      }
      const storeName = loc.stores?.name || stores.find((s: any) => s.id === loc.store_id)?.name || "Produktion";
      if (!storeGroups.has(storeName))
        storeGroups.set(storeName, { storeName, locations: [], totalQty: 0, totalValue: 0 });
      const group = storeGroups.get(storeName)!;
      group.locations.push(loc);
      group.totalQty += loc.totalQty;
      group.totalValue += loc.totalValue;
    });
    const result: {
      type: "store" | "general";
      storeName: string;
      locations: typeof stockByLocation;
      totalQty: number;
      totalValue: number;
    }[] = [];
    generalLocations.forEach((loc) =>
      result.push({
        type: "general",
        storeName: loc.name,
        locations: [loc],
        totalQty: loc.totalQty,
        totalValue: loc.totalValue,
      }),
    );
    Array.from(storeGroups.entries())
      .sort(([a], [b]) => a.localeCompare(b, "sv"))
      .forEach(([, group]) => result.push({ type: "store", ...group }));
    return result;
  }, [stockByLocation, stores, site]);

  const totalProducts = aggregatedStock.size;
  const totalQty = Array.from(aggregatedStock.values()).reduce((s, i) => s + qtyToKg(i.quantity, i.product), 0);
  const totalValue = storeStock.reduce(
    (s: number, i: any) => s + Number(i.quantity) * (Number(i.unit_cost) || Number(i.products?.cost_price) || 0),
    0,
  );
  const lowStockItems = Array.from(aggregatedStock.values()).filter(
    (i) => i.min_stock > 0 && i.quantity < i.min_stock,
  ).length;
  const expiredCount = allStock.filter((s: any) => {
    if (!s.expiry_date) return false;
    const f = getFreshnessInfo(s.expiry_date);
    return f && f.isExpired;
  }).length;

  const toggleCategory = (cat: string) =>
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  const toggleLocation = (locId: string) =>
    setExpandedLocations((prev) => {
      const next = new Set(prev);
      next.has(locId) ? next.delete(locId) : next.add(locId);
      return next;
    });
  const toggleGroup = (name: string) =>
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const expandAll = () => {
    setExpandedLocations(new Set(portalLocations.map((l: any) => l.id)));
    setExpandedGroups(new Set(groupedByStore.map((g) => g.storeName)));
  };
  const collapseAll = () => {
    setExpandedLocations(new Set());
    setExpandedCategories(new Set());
    setExpandedGroups(new Set());
  };

  // ── Location + stock dialogs ─────────────────────────────────────────────
  const handleCreateLocation = () => {
    if (!locName || !locStore) return;
    createLocation.mutate(
      { name: locName, store_id: locStore, zone: locZone || undefined, description: locDesc || undefined },
      {
        onSuccess: () => {
          toast({ title: "Lagerställe skapat", description: locName });
          setLocationDialogOpen(false);
          setLocName("");
          setLocStore("");
          setLocZone("Kyl");
          setLocDesc("");
        },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  const handleUpsertStock = () => {
    if (!stockProduct || !stockLocation || !stockQty) return;
    upsertStock.mutate(
      {
        product_id: stockProduct,
        location_id: stockLocation,
        quantity: Number(stockQty),
        min_stock: stockMin ? Number(stockMin) : 0,
      },
      {
        onSuccess: () => {
          toast({ title: "Lagersaldo uppdaterat" });
          setStockDialogOpen(false);
          setStockProduct("");
          setStockLocation("");
          setStockQty("");
          setStockMin("");
        },
        onError: (err) => toast({ title: "Fel", description: err.message, variant: "destructive" }),
      },
    );
  };

  // ── Lagerrapport ─────────────────────────────────────────────────────────
  const addProductToReport = (product: any) => {
    if (invLines.find((l) => l.product_id === product.id)) {
      toast({ title: "Redan tillagd", description: product.name });
      return;
    }
    setInvLines((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku,
        unit: product.unit,
        category: product.category,
        cost_price: Number(product.cost_price) || 0,
        quantity: "",
        expiry_date: "",
        arrival_date: new Date().toISOString().slice(0, 10),
      },
    ]);
    setInvProductSearch("");
  };

  const handleScan = (code: string) => {
    const product = products.find((p: any) => (p as any).barcode === code);
    if (product) {
      addProductToReport(product);
      toast({ title: "Produkt skannad", description: product.name });
    } else toast({ title: "Okänd streckkod", description: `Kod: ${code}`, variant: "destructive" });
    setShowScanner(false);
  };

  const updateInvLine = (idx: number, field: keyof InventoryLine, value: string) => {
    setInvLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeInvLine = (idx: number) => setInvLines((prev) => prev.filter((_, i) => i !== idx));

  const reportTotalValue = invLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * l.cost_price, 0);

  const saveReport = async () => {
    if (!invLocation || invLines.length === 0) return;
    const validLines = invLines.filter((l) => l.quantity !== "" && !isNaN(Number(l.quantity)));
    if (validLines.length === 0) {
      toast({ title: "Ange antal för minst en produkt", variant: "destructive" });
      return;
    }
    setInvSaving(true);
    try {
      for (const line of validLines) {
        // Insert stock with expiry + arrival date
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id")
          .eq("product_id", line.product_id)
          .eq("location_id", invLocation)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("product_stock_locations")
            .update({
              quantity: Number(line.quantity),
              expiry_date: line.expiry_date || null,
              arrival_date: line.arrival_date || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations").insert({
            product_id: line.product_id,
            location_id: invLocation,
            quantity: Number(line.quantity),
            expiry_date: line.expiry_date || null,
            arrival_date: line.arrival_date || null,
          });
        }
      }

      const loc = locations.find((l) => l.id === invLocation);
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
        const reportLines = validLines.map((l) => ({
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

      toast({
        title: "Lagerrapport sparad",
        description: `${validLines.length} produkter uppdaterade · Lagervärde: ${fmt(reportTotalValue)}`,
      });
      setInvLines([]);
      setReportDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
    setInvSaving(false);
  };

  const filteredProductsForAdd = products
    .filter(
      (p) =>
        invProductSearch &&
        (p.name.toLowerCase().includes(invProductSearch.toLowerCase()) ||
          p.sku.toLowerCase().includes(invProductSearch.toLowerCase())) &&
        !invLines.find((l) => l.product_id === p.id),
    )
    .slice(0, 8);

  const reportLinesByCategory = useMemo(() => {
    const groups: Record<string, InventoryLine[]> = {};
    invLines.forEach((l) => {
      const cat = l.category || "Övrigt";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(l);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "sv"));
  }, [invLines]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const renderSelectionActions = (locId: string) => (
    <div className="flex items-center gap-1 mr-2">
      <Badge variant="outline" className="text-[10px] h-5">
        {getSelectedForLocation(locId).size} valda
      </Badge>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[10px] gap-1"
        onClick={() => {
          setActiveLocationId(locId);
          setMoveDialogOpen(true);
        }}
      >
        <Move className="h-3 w-3" /> Flytta
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-6 px-2 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
        onClick={() => {
          setActiveLocationId(locId);
          setDeleteDialogOpen(true);
        }}
      >
        <Trash2 className="h-3 w-3" /> Radera
      </Button>
      {getSelectedForLocation(locId).size === 1 && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1"
            onClick={() => {
              setActiveLocationId(locId);
              setSplitDialogOpen(true);
            }}
          >
            <Scissors className="h-3 w-3" /> Splitta
          </Button>
          {(site === "production" || site === "wholesale") && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={() => {
                setActiveLocationId(locId);
                setTransformDialogOpen(true);
              }}
            >
              <RefreshCw className="h-3 w-3" /> Omvandla
            </Button>
          )}
        </>
      )}
    </div>
  );

  // ── Main location table — now with expiry date + FIFO ───────────────────
  const renderLocationTable = (loc: any) => (
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
              <th className="px-3 py-1.5 text-center font-medium text-muted-foreground">Ankomst</th>
              <th className="px-3 py-1.5 text-center font-medium text-muted-foreground">Bäst före</th>
              <th className="px-3 py-1.5 text-center font-medium text-muted-foreground">Färskhet</th>
            </tr>
          </thead>
          <tbody>
            {loc.items.map((s: any) => {
              const isRawLager = (loc.name || "").toLowerCase().startsWith("raw-");
              const unitPrice = isRawLager
                ? Number(s.products?.wholesale_price) || 0
                : Number(s.unit_cost) || Number(s.products?.cost_price) || 0;
              const value = Number(s.quantity) * unitPrice;
              const isChecked = getSelectedForLocation(loc.id).has(s.id);
              const freshness = getFreshnessInfo(s.expiry_date);
              const fifoIssue = hasFifoIssue(s, loc.items);

              return (
                <tr
                  key={s.id}
                  className={`border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors ${isChecked ? "bg-primary/5" : freshness?.rowClass || ""}`}
                >
                  <td className="px-3 py-2 text-center">
                    <Checkbox checked={isChecked} onCheckedChange={() => toggleItemSelection(loc.id, s.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    <div className="flex items-center gap-1.5">
                      {s.products?.name}
                      {fifoIssue && (
                        <span title="FIFO-varning: äldre batch finns på annat lagerställe">
                          <AlertCircle className="h-3 w-3 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground text-[10px]">{s.products?.sku}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.products?.category}</td>
                  <td className="px-3 py-2 text-right font-medium text-foreground">
                    {Number(s.quantity).toLocaleString("sv-SE")} {s.products?.unit}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(value)}</td>
                  <td className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                    {s.arrival_date ? format(parseISO(s.arrival_date), "d MMM", { locale: sv }) : "–"}
                  </td>
                  <td className="px-3 py-2 text-center text-[10px] text-muted-foreground">
                    {s.expiry_date ? format(parseISO(s.expiry_date), "d MMM", { locale: sv }) : "–"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {freshness ? (
                      <Badge variant="outline" className={`text-[10px] ${freshness.badgeClass}`}>
                        {freshness.isExpired ? (
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        ) : (
                          <Clock className="h-2.5 w-2.5 mr-0.5" />
                        )}
                        {freshness.label}
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">–</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
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
          {expiryAlerts.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8 border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
              onClick={() => setShowExpiryAlerts(true)}
            >
              <AlertTriangle className="h-3 w-3" />
              {expiryAlerts.length} utgångsvarning{expiryAlerts.length > 1 ? "ar" : ""}
            </Button>
          )}
          <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setReportDialogOpen(true)}>
            <ClipboardList className="h-3 w-3" /> Skapa lagerrapport
          </Button>
        </div>
      </div>

      {/* KPIs — now with expiry count */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Produkter i lager</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalProducts}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Total kvantitet</p>
            <p className="text-xl font-heading font-bold text-foreground">{totalQty.toLocaleString("sv-SE")}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Lagervärde (SEK)</p>
            <p className="text-xl font-heading font-bold text-foreground">{fmt(totalValue)}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" /> Lågt lager
            </p>
            <p className="text-xl font-heading font-bold text-destructive">{lowStockItems}</p>
          </CardContent>
        </Card>
        <Card className={`shadow-card ${expiredCount > 0 ? "border-destructive/30 bg-destructive/5" : ""}`}>
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 text-destructive" /> Utgångna/kritiska
            </p>
            <p
              className={`text-xl font-heading font-bold ${expiredCount > 0 ? "text-destructive" : "text-foreground"}`}
            >
              {expiredCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Rest of location rendering — kept same structure as original, 
          but using updated renderLocationTable which now includes expiry columns.
          The groupedByStore and stockByLocation views below use renderLocationTable. */}
      {site === "production" || site === "wholesale" ? (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Lager per destination</CardTitle>
                <CardDescription className="text-xs">{stockByLocation.length} lagerställen</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={expandAll}>
                  Visa alla
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={collapseAll}>
                  Dölj alla
                </Button>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLoc || loadingStock ? (
              <Skeleton className="h-48" />
            ) : groupedByStore.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Inga lagerställen</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groupedByStore.map((group) => {
                  const isGroupExpanded = expandedGroups.has(group.storeName);
                  const isGeneral = group.type === "general";
                  const singleLoc = group.locations[0];
                  if (isGeneral) {
                    const isExpanded = expandedLocations.has(singleLoc.id);
                    return (
                      <div key={singleLoc.id} className="border border-border/50 rounded-md overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5 hover:bg-muted/30 transition-colors">
                          <button
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => toggleLocation(singleLoc.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            <Warehouse className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-sm font-medium text-foreground">{singleLoc.name}</span>
                            <Badge variant="secondary" className="text-[10px] h-5">
                              {singleLoc.items.length} produkter
                            </Badge>
                            {singleLoc.expiryWarnings > 0 && (
                              <Badge
                                variant="outline"
                                className="text-[10px] h-5 border-amber-500/30 text-amber-700 bg-amber-500/10"
                              >
                                <Clock className="h-2.5 w-2.5 mr-0.5" />
                                {singleLoc.expiryWarnings} varning{singleLoc.expiryWarnings > 1 ? "ar" : ""}
                              </Badge>
                            )}
                          </button>
                          <div className="flex items-center gap-2">
                            {getSelectedForLocation(singleLoc.id).size > 0 && renderSelectionActions(singleLoc.id)}
                            <span className="text-xs text-muted-foreground">
                              {singleLoc.totalQty.toLocaleString("sv-SE")} kg
                            </span>
                            <span className="text-xs font-medium text-foreground">{fmt(singleLoc.totalValue)}</span>
                          </div>
                        </div>
                        {isExpanded && renderLocationTable(singleLoc)}
                      </div>
                    );
                  }
                  return (
                    <div key={group.storeName} className="border border-border rounded-md overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-3 py-3 hover:bg-muted/30 transition-colors text-left bg-muted/10"
                        onClick={() => toggleGroup(group.storeName)}
                      >
                        <div className="flex items-center gap-2">
                          {isGroupExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <MapPin className="h-4 w-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">{group.storeName}</span>
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {group.locations.length} lager
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{group.totalQty.toLocaleString("sv-SE")} kg</span>
                          <span className="font-medium text-foreground">{fmt(group.totalValue)}</span>
                        </div>
                      </button>
                      {isGroupExpanded && (
                        <div className="border-t border-border/50">
                          {group.locations.map((loc: any) => {
                            const isExpanded = expandedLocations.has(loc.id);
                            return (
                              <div key={loc.id} className="border-b border-border/30 last:border-0">
                                <div className="flex items-center justify-between px-4 py-2 hover:bg-muted/20 transition-colors">
                                  <button
                                    className="flex items-center gap-2 flex-1 text-left"
                                    onClick={() => toggleLocation(loc.id)}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    )}
                                    <span className="text-xs font-medium text-foreground">{loc.name}</span>
                                    <Badge variant="secondary" className="text-[10px] h-4">
                                      {loc.items.length} produkter
                                    </Badge>
                                    {loc.expiryWarnings > 0 && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] h-4 border-amber-500/30 text-amber-700 bg-amber-500/10"
                                      >
                                        <Clock className="h-2.5 w-2.5 mr-0.5" />
                                        {loc.expiryWarnings}
                                      </Badge>
                                    )}
                                  </button>
                                  <div className="flex items-center gap-2">
                                    {getSelectedForLocation(loc.id).size > 0 && renderSelectionActions(loc.id)}
                                    <span className="text-[10px] text-muted-foreground">
                                      {loc.totalQty.toLocaleString("sv-SE")} kg
                                    </span>
                                    <span className="text-[10px] font-medium text-foreground">
                                      {fmt(loc.totalValue)}
                                    </span>
                                  </div>
                                </div>
                                {isExpanded && renderLocationTable(loc)}
                              </div>
                            );
                          })}
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
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Lager per plats</CardTitle>
                <CardDescription className="text-xs">
                  {activeStoreName || "Alla butiker"} · {stockByLocation.length} lagerställen
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={expandAll}>
                  Visa alla
                </Button>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2" onClick={collapseAll}>
                  Dölj alla
                </Button>
                <div className="relative w-48">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loadingLoc || loadingStock ? (
              <Skeleton className="h-48" />
            ) : stockByLocation.length === 0 ? (
              <div className="text-center py-12">
                <Warehouse className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground mb-1">Inga lagersaldon registrerade</p>
                <Button size="sm" onClick={() => setReportDialogOpen(true)} className="gap-1.5">
                  <ClipboardList className="h-3 w-3" /> Skapa lagerrapport
                </Button>
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
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <MapPin className="h-3.5 w-3.5 text-primary" />
                          <span className="text-sm font-medium text-foreground">{loc.name}</span>
                          {loc.zone && (
                            <Badge variant="outline" className={`text-[10px] h-5 ${zoneColor[loc.zone] || ""}`}>
                              {zoneIcon[loc.zone] || "📍"} {loc.zone}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-[10px] h-5">
                            {loc.items.length} produkter
                          </Badge>
                          {loc.expiryWarnings > 0 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 border-amber-500/30 text-amber-700 bg-amber-500/10"
                            >
                              <Clock className="h-2.5 w-2.5 mr-0.5" />
                              {loc.expiryWarnings} varning{loc.expiryWarnings > 1 ? "ar" : ""}
                            </Badge>
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          {getSelectedForLocation(loc.id).size > 0 && renderSelectionActions(loc.id)}
                          <span className="text-xs text-muted-foreground">
                            {loc.totalQty.toLocaleString("sv-SE")} kg
                          </span>
                          <span className="text-xs font-medium text-foreground">{fmt(loc.totalValue)}</span>
                        </div>
                      </div>
                      {isExpanded && renderLocationTable(loc)}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Expiry Alerts Dialog ───────────────────────────────────────────── */}
      <Dialog open={showExpiryAlerts} onOpenChange={setShowExpiryAlerts}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" /> Utgångsvarningar
            </DialogTitle>
            <DialogDescription className="text-xs">
              Produkter som går ut inom 5 dagar eller redan har passerat bäst-före-datum.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {expiryAlerts.map((s: any) => (
              <div
                key={s.id}
                className={`flex items-center justify-between p-2.5 rounded-md border ${s.freshness.badgeClass}`}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{s.products?.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {s.storage_locations?.name} · {Number(s.quantity).toLocaleString("sv-SE")} {s.products?.unit}
                  </p>
                </div>
                <Badge variant="outline" className={`text-[10px] shrink-0 ${s.freshness.badgeClass}`}>
                  {s.freshness.label}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Lagerrapport Dialog — now with expiry + arrival date ──────────── */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" /> Skapa lagerrapport
            </DialogTitle>
            <DialogDescription className="text-xs">
              Välj lagerställe, lägg till produkter och ange aktuellt antal, ankomstdatum och bäst-före-datum.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs font-medium">Lagerställe *</Label>
                <Select value={invLocation} onValueChange={setInvLocation}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj lagerställe" />
                  </SelectTrigger>
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
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => setShowScanner(!showScanner)}
                  disabled={!invLocation}
                >
                  <Camera className="h-3 w-3" /> {showScanner ? "Stäng skanner" : "Scanna"}
                </Button>
              </div>
            </div>

            {showScanner && invLocation && <BarcodeScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

            {invLocation && (
              <div className="relative">
                <Label className="text-xs font-medium mb-1.5 block">Lägg till produkt</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Sök produkt (namn eller SKU)..."
                    value={invProductSearch}
                    onChange={(e) => setInvProductSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                {filteredProductsForAdd.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredProductsForAdd.map((p) => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between"
                        onClick={() => addProductToReport(p)}
                      >
                        <div>
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-muted-foreground ml-2 text-[10px]">{p.category}</span>
                        </div>
                        <span className="text-muted-foreground font-mono text-[10px]">
                          {p.sku} · {p.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {invLines.length > 0 && (
              <div className="space-y-3">
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {invLines.length} produkt{invLines.length > 1 ? "er" : ""} tillagda
                  </span>
                  <span className="text-xs font-semibold text-foreground">Lagervärde: {fmt(reportTotalValue)}</span>
                </div>

                {reportLinesByCategory.map(([category, catLines]) => (
                  <div key={category}>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      {category}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border/30">
                            <th className="py-1 text-left font-medium text-muted-foreground text-[10px]">Produkt</th>
                            <th className="py-1 text-center font-medium text-muted-foreground text-[10px] w-16">
                              Enhet
                            </th>
                            <th className="py-1 text-right font-medium text-muted-foreground text-[10px] w-28">
                              Antal *
                            </th>
                            <th className="py-1 text-center font-medium text-muted-foreground text-[10px] w-36">
                              Ankomst
                            </th>
                            <th className="py-1 text-center font-medium text-muted-foreground text-[10px] w-36">
                              Bäst före
                            </th>
                            <th className="py-1 w-8"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {catLines.map((line) => {
                            const globalIdx = invLines.findIndex((l) => l.product_id === line.product_id);
                            return (
                              <tr key={line.product_id} className="border-b border-border/20">
                                <td className="py-1.5 font-medium text-foreground">{line.product_name}</td>
                                <td className="py-1.5 text-center">
                                  <Badge variant="secondary" className="text-[10px]">
                                    {line.unit}
                                  </Badge>
                                </td>
                                <td className="py-1.5 text-right">
                                  <Input
                                    type="number"
                                    step={line.unit.toLowerCase() === "kg" ? "0.1" : "1"}
                                    value={line.quantity}
                                    onChange={(e) => updateInvLine(globalIdx, "quantity", e.target.value)}
                                    className="h-7 text-xs w-24 ml-auto text-right"
                                    placeholder={`0 ${line.unit}`}
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <Input
                                    type="date"
                                    value={line.arrival_date || ""}
                                    onChange={(e) => updateInvLine(globalIdx, "arrival_date", e.target.value)}
                                    className="h-7 text-[10px] w-full"
                                  />
                                </td>
                                <td className="py-1.5 px-1">
                                  <Input
                                    type="date"
                                    value={line.expiry_date || ""}
                                    onChange={(e) => updateInvLine(globalIdx, "expiry_date", e.target.value)}
                                    className="h-7 text-[10px] w-full"
                                  />
                                </td>
                                <td className="py-1.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-destructive"
                                    onClick={() => removeInvLine(globalIdx)}
                                  >
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
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Namn *</Label>
              <Input value={locName} onChange={(e) => setLocName(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Lager/Butik *</Label>
                <Select value={locStore} onValueChange={setLocStore}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Välj" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s) => (
                      <SelectItem key={s.id} value={s.id} className="text-xs">
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Zon</Label>
                <Select value={locZone} onValueChange={setLocZone}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kyl" className="text-xs">
                      ❄️ Kyl
                    </SelectItem>
                    <SelectItem value="Frys" className="text-xs">
                      🧊 Frys
                    </SelectItem>
                    <SelectItem value="Torrt" className="text-xs">
                      📦 Torrt
                    </SelectItem>
                    <SelectItem value="Produktion" className="text-xs">
                      🏭 Produktion
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Beskrivning</Label>
              <Input value={locDesc} onChange={(e) => setLocDesc(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              onClick={handleCreateLocation}
              disabled={!locName || !locStore || createLocation.isPending}
            >
              {createLocation.isPending ? "Sparar..." : "Skapa lagerställe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move dialog */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Flytta produkter</DialogTitle>
            <DialogDescription className="text-xs">
              {getSelectedForLocation(activeLocationId).size} valda produkt(er)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {locations
              .filter((l: any) => l.id !== activeLocationId)
              .map((loc: any) => (
                <button
                  key={loc.id}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-border/50 hover:bg-muted/40 transition-colors text-left"
                  onClick={() => handleMove(loc.id)}
                  disabled={actionLoading}
                >
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground">{loc.name}</span>
                  {loc.zone && (
                    <Badge variant="secondary" className="text-[10px] h-5">
                      {loc.zone}
                    </Badge>
                  )}
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(o) => {
          setDeleteDialogOpen(o);
          if (!o) setDeleteReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading text-destructive">Radera produkter</DialogTitle>
            <DialogDescription className="text-xs">
              {getSelectedForLocation(activeLocationId).size} produkt(er) tas bort. Ange anledning.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Anledning *</Label>
            <Textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="T.ex. Utgånget, skadat..."
              className="text-xs min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={!deleteReason.trim() || actionLoading}
            >
              {actionLoading ? "Raderar..." : "Bekräfta radering"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split dialog */}
      <Dialog
        open={splitDialogOpen}
        onOpenChange={(o) => {
          setSplitDialogOpen(o);
          if (!o) {
            setSplitQty("");
            setSplitTargetLocation("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Splitta produkt</DialogTitle>
          </DialogHeader>
          {(() => {
            const item = getSelectedStockItems(activeLocationId)[0];
            if (!item) return null;
            return (
              <div className="space-y-3">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-xs font-medium">{item.products?.name}</p>
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
                    onChange={(e) => setSplitQty(e.target.value)}
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
                        <span className="font-medium">{loc.name}</span>
                        {loc.id === activeLocationId && (
                          <Badge variant="secondary" className="text-[9px] ml-auto">
                            Samma plats
                          </Badge>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSplitDialogOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" onClick={handleSplit} disabled={!splitQty || !splitTargetLocation || actionLoading}>
              {actionLoading ? "Splittar..." : "Bekräfta split"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transform dialog */}
      <Dialog
        open={transformDialogOpen}
        onOpenChange={(o) => {
          setTransformDialogOpen(o);
          if (!o) {
            setTransformTargetProduct("");
            setTransformNewWeight("");
            setTransformProductSearch("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">Omvandla produkt</DialogTitle>
            <DialogDescription className="text-xs">Viktskillnaden loggas som svinn.</DialogDescription>
          </DialogHeader>
          {(() => {
            const item = getSelectedStockItems(activeLocationId)[0];
            if (!item) return null;
            const filteredTP = products
              .filter(
                (p) =>
                  p.id !== item.product_id &&
                  transformProductSearch &&
                  (p.name.toLowerCase().includes(transformProductSearch.toLowerCase()) ||
                    p.sku.toLowerCase().includes(transformProductSearch.toLowerCase())),
              )
              .slice(0, 8);
            const selectedProduct = products.find((p) => p.id === transformTargetProduct);
            return (
              <div className="space-y-3">
                <div className="p-2.5 rounded-md bg-muted/30 border border-border/50">
                  <p className="text-xs font-medium">{item.products?.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Nuvarande: {Number(item.quantity).toLocaleString("sv-SE")} {item.products?.unit || "kg"}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Omvandla till produkt *</Label>
                  {selectedProduct ? (
                    <div className="flex items-center gap-2 p-2 rounded-md border border-primary/30 bg-primary/5">
                      <span className="text-xs font-medium flex-1">{selectedProduct.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => {
                          setTransformTargetProduct("");
                          setTransformProductSearch("");
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={transformProductSearch}
                        onChange={(e) => setTransformProductSearch(e.target.value)}
                        placeholder="Sök produkt..."
                        className="h-8 text-xs"
                      />
                      {filteredTP.length > 0 && (
                        <div className="border border-border/50 rounded-md max-h-32 overflow-y-auto">
                          {filteredTP.map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-left px-3 py-1.5 hover:bg-muted/40 text-xs flex items-center justify-between"
                              onClick={() => {
                                setTransformTargetProduct(p.id);
                                setTransformProductSearch("");
                              }}
                            >
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">{p.sku}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Ny vikt ({item.products?.unit || "kg"}) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={transformNewWeight}
                    onChange={(e) => setTransformNewWeight(e.target.value)}
                    className="h-8 text-xs"
                  />
                  {transformNewWeight &&
                    Number(transformNewWeight) > 0 &&
                    Number(transformNewWeight) < Number(item.quantity) && (
                      <p className="text-[10px] text-muted-foreground">
                        Svinn: {(Number(item.quantity) - Number(transformNewWeight)).toFixed(2)}{" "}
                        {item.products?.unit || "kg"} (
                        {((1 - Number(transformNewWeight) / Number(item.quantity)) * 100).toFixed(1)}%)
                      </p>
                    )}
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTransformDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              size="sm"
              onClick={handleTransform}
              disabled={!transformTargetProduct || !transformNewWeight || actionLoading}
            >
              {actionLoading ? "Omvandlar..." : "Bekräfta omvandling"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
