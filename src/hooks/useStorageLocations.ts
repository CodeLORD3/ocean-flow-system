import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { setBalance, setMinStock } from "@/lib/stockLedger";


export function useStorageLocations(storeId?: string) {
  return useQuery({
    queryKey: ["storage_locations", storeId],
    queryFn: async () => {
      let q = supabase
        .from("storage_locations")
        .select("*, stores!storage_locations_store_id_fkey(name)")
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
        .select("*, products(name, sku, category, unit, cost_price, wholesale_price, weight_per_piece), storage_locations(name, zone, store_id, stores!storage_locations_store_id_fkey(name))")
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
        .select("*, products(name, sku, category, unit, cost_price, wholesale_price, weight_per_piece), storage_locations(name, zone, store_id, stores!storage_locations_store_id_fkey(name)), shop_orders(order_week, store_id, stores(name))")
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
    mutationFn: async (params: { name: string; store_id: string; zone?: string; description?: string; parent_location_id?: string | null; category?: string | null }) => {
      const { data, error } = await supabase.from("storage_locations").insert(params as any).select().single();

      if (error) throw error;

      // Vid uppsättning: ett nytt Försäljningslager blir butikens inventeringsplats
      // om ingen är utpekad ännu. Förval, inte namnmatchning vid körning —
      // valet ligger kvar i stores.inventory_location_id och kan ändras i butiksformuläret.
      const isSalesStock = /^f(ö|o)rs(ä|a)ljningslager$/i.test((params.name || "").trim());
      if (isSalesStock && !params.parent_location_id) {
        const { data: store } = await supabase
          .from("stores")
          .select("inventory_location_id")
          .eq("id", params.store_id)
          .maybeSingle();
        if (store && !(store as any).inventory_location_id) {
          await supabase
            .from("stores")
            .update({ inventory_location_id: data.id } as any)
            .eq("id", params.store_id);
        }
      }

      await logActivity({
        action_type: "create",
        description: `Lagerplats skapad: ${params.name}`,
        entity_type: "storage_location",
        entity_id: data.id,
        store_id: params.store_id,
      });
      return data;

    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["storage_locations"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
    },

  });
}

export function useUpsertStockLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { product_id: string; location_id: string; quantity: number; min_stock?: number }) => {
      // Miniminivån är en inställning; saldot sätts via rörelseloggen.
      if (params.min_stock !== undefined) {
        await setMinStock({
          productId: params.product_id,
          locationId: params.location_id,
          minStock: params.min_stock || 0,
        });
      }
      await setBalance({
        productId: params.product_id,
        locationId: params.location_id,
        targetQuantityKg: Number(params.quantity),
        movementType: "justering",
        note: "Saldo satt manuellt",
      });

      
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
