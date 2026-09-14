import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export interface ProductFamily {
  id: string;
  name: string;
  base_unit: string;
  notes: string | null;
}

/** Alla produktfamiljer, sorterade på namn. */
export function useProductFamilies() {
  return useQuery({
    queryKey: ["product_families"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ProductFamily[]> => {
      const { data, error } = await db
        .from("product_families")
        .select("id, name, base_unit, notes")
        .order("name");
      if (error) throw error;
      return (data || []) as ProductFamily[];
    },
  });
}

/** Skapar en ny produktfamilj och returnerar den. */
export function useCreateProductFamily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<ProductFamily> => {
      const { data, error } = await db
        .from("product_families")
        .insert({ name: name.trim(), base_unit: "kg" })
        .select("id, name, base_unit, notes")
        .single();
      if (error) throw error;
      return data as ProductFamily;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product_families"] }),
  });
}

/**
 * Kvar att packa på kundbeställningar per produkt, för en butik.
 * Endast läsning — används för att flagga när lagret inte räcker.
 */
export function useOrderedByProduct(storeId?: string | null) {
  return useQuery({
    queryKey: ["family_ordered_by_product", storeId ?? "all"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, number>> => {
      let q = db
        .from("customer_order_lines")
        .select(
          "product_id, quantity_ordered, quantity_packed, customer_orders!inner(store_id, status)",
        )
        .in("customer_orders.status", ["ny", "bekraftad", "packad"]);
      if (storeId) q = q.eq("customer_orders.store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data || []) as any[]) {
        if (!r.product_id) continue;
        const remaining = Number(r.quantity_ordered || 0) - Number(r.quantity_packed || 0);
        if (remaining <= 0.005) continue;
        map.set(r.product_id, (map.get(r.product_id) || 0) + remaining);
      }
      return map;
    },
  });
}
