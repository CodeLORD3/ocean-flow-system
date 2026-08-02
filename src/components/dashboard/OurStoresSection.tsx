import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Package, ShoppingCart, Ruler } from "lucide-react";
import storeHero from "@/assets/store-hero.jpg";
import type { Store } from "@/hooks/useStores";

const fadeUp = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

/** Presentational open/closed derivation: Mon–Sat 10–18 for active stores. */
function isOpenNow(store: Store) {
  if (store.active === false) return false;
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  if (day === 0) return false;
  const h = now.getHours();
  return h >= 10 && h < 18;
}

export function OurStoresSection({ storeFilterId }: { storeFilterId?: string | null }) {
  const navigate = useNavigate();

  const { data: stores = [] } = useQuery({
    queryKey: ["our-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("is_wholesale", false)
        .order("name");
      if (error) throw error;
      return data as Store[];
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["our-stores-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storage_locations").select("id, store_id");
      if (error) throw error;
      return data;
    },
  });

  const locationIds = locations.map((l) => l.id);
  const { data: stock = [] } = useQuery({
    queryKey: ["our-stores-stock", locationIds.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("location_id, quantity");
      if (error) throw error;
      return data;
    },
    enabled: locationIds.length > 0,
  });

  const { data: openOrders = [] } = useQuery({
    queryKey: ["our-stores-open-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_orders")
        .select("id, store_id, status")
        .neq("status", "Levererad");
      if (error) throw error;
      return data;
    },
  });
  const { data: storePhotos = [] } = useQuery({
    queryKey: ["our-stores-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("entity_id, url, sort_order")
        .eq("entity_type", "store")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const photoByStore: Record<string, string> = {};
  storePhotos.forEach((p: any) => {
    if (!photoByStore[p.entity_id]) photoByStore[p.entity_id] = p.url;
  });


  const storeByLocation = new Map(locations.map((l) => [l.id, l.store_id]));
  const kgByStore: Record<string, number> = {};
  stock.forEach((s: any) => {
    const sid = storeByLocation.get(s.location_id);
    if (!sid) return;
    kgByStore[sid] = (kgByStore[sid] || 0) + Number(s.quantity || 0);
  });
  const ordersByStore: Record<string, number> = {};
  openOrders.forEach((o: any) => {
    if (!o.store_id) return;
    ordersByStore[o.store_id] = (ordersByStore[o.store_id] || 0) + 1;
  });

  const visible = storeFilterId ? stores.filter((s) => s.id === storeFilterId) : stores;
  if (visible.length === 0) return null;

  return (
    <motion.section variants={fadeUp} aria-labelledby="our-stores-heading" className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 id="our-stores-heading" className="text-sm font-heading font-bold text-foreground">
            Våra butiker
          </h2>
          <p className="text-xs text-muted-foreground">Klicka på en butik för att öppna butiksvyn</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{visible.length} butiker</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {visible.map((store) => {
          const open = isOpenNow(store);
          const kg = kgByStore[store.id] || 0;
          const orders = ordersByStore[store.id] || 0;
          return (
            <Card
              key={store.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate("/stores")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("/stores");
                }
              }}
              className="group overflow-hidden shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="relative aspect-video overflow-hidden bg-muted">
                <img
                  src={photoByStore[store.id] || store.logo_url || storeHero}

                  alt={`Butiksfasad för ${store.name}`}
                  loading="lazy"
                  width={1280}
                  height={720}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent" />
                <Badge
                  variant="outline"
                  className={`absolute top-2 right-2 text-[10px] backdrop-blur-sm ${
                    open
                      ? "bg-success/20 text-success border-success/30"
                      : "bg-muted/60 text-muted-foreground border-border"
                  }`}
                >
                  <span
                    className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${open ? "bg-success" : "bg-muted-foreground"}`}
                  />
                  {open ? "Öppet" : "Stängt"}
                </Badge>
              </div>

              <div className="p-4 space-y-2.5">
                <div>
                  <h3 className="text-sm font-heading font-bold text-foreground leading-tight">{store.name}</h3>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3 w-3 shrink-0" />
                    {store.address || store.city || "Adress saknas"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="text-[10px] font-mono tabular-nums gap-1">
                    <Package className="h-3 w-3" />
                    {kg.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kg
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] font-mono tabular-nums gap-1">
                    <ShoppingCart className="h-3 w-3" />
                    {orders} order
                  </Badge>
                  {store.sqm ? (
                    <Badge variant="secondary" className="text-[10px] font-mono tabular-nums gap-1">
                      <Ruler className="h-3 w-3" />
                      {store.sqm} m²
                    </Badge>
                  ) : null}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </motion.section>
  );
}
