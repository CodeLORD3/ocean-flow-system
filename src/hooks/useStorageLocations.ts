import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export function useStorageLocations(storeId?: string) {
  return useQuery({
    queryKey: ["storage_locations", storeId],
    queryFn: async () => {
      let q = supabase
        .from("storage_locations")
        .select("*, stores(name)")
        .order("name");
      if (storeId && storeId !== "all") q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useProductStockLocations(locationId?: string) {
  return useQuery({
    queryKey: ["product_stock_locations", locationId],
    queryFn: async () => {
      let q = supabase
        .from("product_stock_locations")
        .select("*, products(name, sku, category, unit, cost_price, wholesale_price, weight_per_piece), storage_locations(name, zone, store_id, stores(name))")
        .order("quantity", { ascending: false });
      if (locationId && locationId !== "all") q = q.eq("location_id", locationId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAllStockByLocation() {
  return useQuery({
    queryKey: ["all_stock_locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("*, products(name, sku, category, unit, cost_price, wholesale_price, weight_per_piece), storage_locations(name, zone, store_id, stores(name)), shop_orders(order_week, store_id, stores(name))")
        .gt("quantity", 0)
        .order("quantity", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateStorageLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; store_id: string; zone?: string; description?: string }) => {
      const { data, error } = await supabase.from("storage_locations").insert(params).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Lagerplats skapad: ${params.name}`,
        entity_type: "storage_location",
        entity_id: data.id,
        store_id: params.store_id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["storage_locations"] }),
  });
}

export function useUpsertStockLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { product_id: string; location_id: string; quantity: number; min_stock?: number }) => {
      const { error } = await supabase
        .from("product_stock_locations")
        .upsert({
          product_id: params.product_id,
          location_id: params.location_id,
          quantity: params.quantity,
          min_stock: params.min_stock || 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: "product_id,location_id" });
      if (error) throw error;
      
      const { markOrderLinesPackad, revertOrderLinesIfStockGone } = await import("@/lib/orderStatusSync");
      await revertOrderLinesIfStockGone();
      await markOrderLinesPackad([params.product_id], params.location_id);

      await logActivity({
        action_type: "update",
        description: `Lagersaldo uppdaterat: ${params.quantity} st`,
        entity_type: "stock_location",
        details: { product_id: params.product_id, location_id: params.location_id, quantity: params.quantity },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
    },
  });
}
