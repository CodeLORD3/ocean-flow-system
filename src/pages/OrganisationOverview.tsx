import { motion } from "framer-motion";
import { displayOrderWeek } from "@/lib/orderWeek";
import {
  TrendingUp,
  Package,
  ShoppingCart,
  Truck,
  Store,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  MessageSquare,
  Lightbulb,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProducts } from "@/hooks/useProducts";
import { useStores } from "@/hooks/useStores";
import { useStoreCoverImages } from "@/hooks/useStoreCoverImages";
import { focalStyle } from "@/lib/imageFocal";
import storeHero from "@/assets/store-hero.jpg";
import { useCustomers } from "@/hooks/useCustomers";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { EntityImageGallery } from "@/components/images/EntityImageGallery";
import { PORTAL_IMAGE_ENTITY_TYPE, portalImageEntityId } from "@/lib/portalImages";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { ActivityIcon } from "@/components/dashboard/ActivityIcon";
import { useStoreActivity } from "@/hooks/useStoreActivity";
import { useState } from "react";
import { ChecklistCard } from "@/components/checklist/ChecklistCard";
import { DailyReportCard } from "@/components/dashboard/DailyReportCard";
import { PurchaseWeekCard } from "@/components/dashboard/PurchaseWeekCard";
import { OnDutyStaff } from "@/components/staff/OnDutyStaff";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--secondary))",
  "hsl(210, 60%, 55%)",
  "hsl(340, 60%, 55%)",
  "hsl(160, 50%, 45%)",
];

function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: any;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wide text-muted-foreground font-medium leading-tight">{title}</p>
          <div className="h-7 w-7 sm:h-9 sm:w-9 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
          </div>
        </div>
        <p className="mt-1 text-lg sm:text-2xl font-heading font-bold text-foreground tabular-nums">{value}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {subtitle && <p className="text-[9px] sm:text-[10px] text-muted-foreground">{subtitle}</p>}
          {trend && (
            <span className={`flex items-center gap-0.5 text-[9px] sm:text-[10px] font-medium ${trend.positive ? "text-emerald-600" : "text-red-500"}`}>
              {trend.positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {trend.value}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}



export default function OrganisationOverview() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const isShop = site === "shop" && !!activeStoreId;
  const { switchTab } = useTabs();

  const { data: products = [] } = useProducts();
  const { data: stores = [] } = useStores(true);
  const { data: allCustomers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();
  const covers = useStoreCoverImages();
  const activity = useStoreActivity();
  const [chatFocus, setChatFocus] = useState<{ key: string; nonce: number } | null>(null);

  // Storage locations for the active store (shop scope)
  const { data: shopLocations = [] } = useQuery({
    queryKey: ["overview-shop-locations", activeStoreId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id")
        .eq("store_id", activeStoreId!);
      if (error) throw error;
      return data;
    },
    enabled: isShop,
  });
  const shopLocationIds = shopLocations.map((l: any) => l.id);

  // Shop orders with lines for sales calculation
  const { data: shopOrders = [] } = useQuery({
    queryKey: ["shop-orders-overview", isShop ? activeStoreId : "all"],
    queryFn: async () => {
      let q = supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(quantity_ordered, quantity_delivered, unit, product_id, products(name, wholesale_price, cost_price, category))")
        .order("created_at", { ascending: false });
      if (isShop) q = q.eq("store_id", activeStoreId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Delivery notes (outgoing to shops / incoming for a shop)
  const { data: deliveryNotes = [] } = useQuery({
    queryKey: ["delivery-notes-overview", isShop ? activeStoreId : "all"],
    queryFn: async () => {
      let q = supabase
        .from("delivery_notes")
        .select("*, stores(name), delivery_note_lines(quantity, wholesale_price, total)")
        .order("delivery_date", { ascending: false });
      if (isShop) q = q.eq("store_id", activeStoreId!);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  // Incoming deliveries (purchases from suppliers)
  const { data: incomingDeliveries = [] } = useQuery({
    queryKey: ["incoming-deliveries-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_deliveries")
        .select("*, suppliers(name), incoming_delivery_lines(quantity, unit_cost, total_cost)")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !isShop,
  });

  // Fetch real stock from product_stock_locations
  const { data: stockLocations = [] } = useQuery({
    queryKey: ["stock-locations-overview", isShop ? shopLocationIds : "all"],
    queryFn: async () => {
      let q = supabase
        .from("product_stock_locations")
        .select("product_id, quantity, unit_cost, location_id, storage_locations(name, zone)");
      if (isShop) q = q.in("location_id", shopLocationIds);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !isShop || shopLocationIds.length > 0,
  });


  // --- Computed KPIs ---
  const totalInventoryValue = stockLocations.reduce((sum, sl: any) => {
    const product = products.find(p => p.id === sl.product_id);
    const unitCost = sl.unit_cost ?? product?.cost_price ?? 0;
    return sum + (sl.quantity * unitCost);
  }, 0);
  const totalInventoryWholesale = stockLocations.reduce((sum, sl: any) => {
    const product = products.find(p => p.id === sl.product_id);
    return sum + (sl.quantity * (product?.wholesale_price ?? 0));
  }, 0);
  const totalStock = stockLocations.reduce((sum, sl: any) => sum + sl.quantity, 0);
  const activeProducts = products.filter(p => p.active).length;

  // Sales = sum of delivered value from shop orders (primary source of truth)
  const totalDeliveredSales = shopOrders.reduce((sum, o: any) => {
    const lines = o.shop_order_lines || [];
    return sum + lines.reduce((ls: number, l: any) => {
      return ls + (l.quantity_delivered || 0) * (l.products?.wholesale_price || 0);
    }, 0);
  }, 0);

  const totalOrderedValue = shopOrders.reduce((sum, o: any) => {
    const lines = o.shop_order_lines || [];
    return sum + lines.reduce((ls: number, l: any) => {
      return ls + (l.quantity_ordered || 0) * (l.products?.wholesale_price || 0);
    }, 0);
  }, 0);

  // Also include delivery_notes if available
  const totalDnSales = deliveryNotes.reduce((sum, dn) => sum + (dn.total_amount || 0), 0);
  const totalSales = Math.max(totalDeliveredSales, totalDnSales);

  const totalPurchases = incomingDeliveries.reduce((sum, d) => sum + (d.total_cost || 0), 0);

  // Cost of delivered goods
  const totalDeliveredCost = shopOrders.reduce((sum, o: any) => {
    const lines = o.shop_order_lines || [];
    return sum + lines.reduce((ls: number, l: any) => {
      return ls + (l.quantity_delivered || 0) * (l.products?.cost_price || 0);
    }, 0);
  }, 0);
  const grossMargin = totalSales > 0 ? ((totalSales - totalDeliveredCost) / totalSales * 100).toFixed(1) : "0";

  // --- Sales by store chart (from shop orders) ---
  const salesByStore: Record<string, number> = {};
  shopOrders.forEach((o: any) => {
    const storeName = o.stores?.name || "Okänd";
    const orderSales = (o.shop_order_lines || []).reduce((ls: number, l: any) => {
      return ls + (l.quantity_delivered || 0) * (l.products?.wholesale_price || 0);
    }, 0);
    if (orderSales > 0) {
      salesByStore[storeName] = (salesByStore[storeName] || 0) + orderSales;
    }
  });
  const salesByStoreData = Object.entries(salesByStore)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // --- Inventory by category chart ---
  const invByCategory: Record<string, number> = {};
  products.forEach(p => {
    if (p.stock > 0) {
      invByCategory[p.category] = (invByCategory[p.category] || 0) + p.stock;
    }
  });
  const inventoryByCategoryData = Object.entries(invByCategory)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);

  // --- Orders by status ---
  const ordersByStatus: Record<string, number> = {};
  shopOrders.forEach((o: any) => {
    ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;
  });
  const orderStatusData = Object.entries(ordersByStatus).map(([name, value]) => ({ name, value }));

  // --- Recent deliveries from shop orders (most recent delivered) ---
  const recentDeliveredOrders = shopOrders
    .filter((o: any) => (o.shop_order_lines || []).some((l: any) => (l.quantity_delivered || 0) > 0))
    .slice(0, 5);
  const recentPurchases = incomingDeliveries.slice(0, 5);

  const openOrders = shopOrders.filter((o: any) => o.status !== "Levererad").length;
  const openDeliveryNotes = deliveryNotes.filter((dn: any) => dn.status !== "Levererad").length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 sm:space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <span className="truncate">{isShop ? `${activeStoreName} — Översikt` : "Organisationsöversikt"}</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            {isShop
              ? "Butikens lager, ordrar, bilder och chatt med övriga portaler."
              : "Samlad vy över alla butiker — försäljning, lager, inköp och beställningar."}
          </p>
        </div>
        <div className="sm:shrink-0">
          <OnDutyStaff storeId={isShop ? activeStoreId : null} />
        </div>

      </div>

      {/* KPI Row */}


      {/* Shop: photos + chat */}
      {isShop && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4">
          <EntityImageGallery
            entityType="store"
            entityId={activeStoreId!}
            title="Bilder från butiken"
            description="Ladda upp foton från butiken — dra och släpp eller klicka för att ladda upp"
            columnsClassName="grid-cols-1 min-[380px]:grid-cols-2"
            previewCount={4}
            catalog
          />


          <ChatPanel compact onOpenFull={() => switchTab("/chat")} />
        </div>
      )}

      {/* Grossist/Admin: chatt och butiker sida vid sida */}
      {!isShop && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 items-start">
          <EntityImageGallery
            entityType={PORTAL_IMAGE_ENTITY_TYPE}
            entityId={portalImageEntityId(site)}
            title={site === "production" ? "Bilder från grossisten" : "Bilder från admin"}
            description={site === "production"
              ? "Ladda upp foton från grossistverksamheten — dra och släpp eller klicka för att ladda upp"
              : "Ladda upp foton för adminportalen — dra och släpp eller klicka för att ladda upp"}
            columnsClassName="grid-cols-1 min-[380px]:grid-cols-2"
            previewCount={4}
            catalog
          />

          <ChatPanel
            compact
            onOpenFull={() => switchTab("/chat")}
            focusPortalKey={chatFocus?.key ?? null}
            focusNonce={chatFocus?.nonce}
          />


          {stores.length > 0 && (
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-heading flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-primary" /> Butiker
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-1">
                  {stores.map((store) => {
                    const act = activity.get(store.id);
                    return (
                      <div key={store.id} className="flex items-center gap-2 sm:gap-3 py-1.5 border-b border-border/30 last:border-0">
                        <div className="h-9 w-12 sm:h-11 sm:w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                          <img
                            src={covers[store.id]?.url || store.logo_url || storeHero}
                            alt={`Butiksbild för ${store.name}`}
                            loading="lazy"
                            width={320}
                            height={220}
                            className="h-full w-full object-cover"
                            style={focalStyle(covers[store.id]?.focal_point)}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground truncate">{store.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{store.city}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 sm:gap-0.5 pr-0.5">
                          <ActivityIcon
                            icon={MessageSquare}
                            count={act.messages}
                            label={`Nya meddelanden från ${store.name}`}
                            onClick={() =>
                              setChatFocus({ key: `store:${store.id}`, nonce: Date.now() })
                            }
                          />
                          <ActivityIcon
                            icon={ShoppingCart}
                            count={act.orders}
                            label={`Nya ordrar från ${store.name}`}
                            onClick={() => switchTab("/orders")}
                          />
                          <ActivityIcon
                            icon={Lightbulb}
                            count={act.wishes}
                            label={`Öppna önskemål från ${store.name}`}
                            onClick={() => switchTab("/wishes")}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}


        </div>
      )}

      {/* Grossist/Admin: veckoschema för inköp */}
      {!isShop && <PurchaseWeekCard />}


      {/* Shop: daily checklist */}
      {isShop && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ChecklistCard storeId={activeStoreId!} onOpenFull={() => switchTab("/checklist")} />
          <DailyReportCard storeId={activeStoreId!} onOpenFull={() => switchTab("/dagsrapport")} />
        </div>
      )}





    </motion.div>
  );
}
