import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a map: productId -> latest price_history row (cost_price, created_at, reason).
 * Single query, fetches up to 1000 most-recent rows then keeps only the newest per product.
 */
export function useLatestPriceChanges() {
  return useQuery({
    queryKey: ["price_history", "latest_per_product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("product_id, cost_price, wholesale_price, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, any>();
      for (const row of data || []) {
        if (!map.has(row.product_id as string)) {
          map.set(row.product_id as string, row);
        }
      }
      return map;
    },
    staleTime: 30_000,
  });
}

export function usePriceHistory(productId?: string) {
  return useQuery({
    queryKey: ["price_history", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .eq("product_id", productId!)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
}
