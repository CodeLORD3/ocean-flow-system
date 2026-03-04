import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Product = Tables<"products">;

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, suppliers(name)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data as (Product & { suppliers: { name: string } | null })[];
    },
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; cost_price: number; wholesale_price: number; retail_suggested: number; reason?: string }) => {
      const { id, reason, ...prices } = params;
      // Update product
      const { error } = await supabase.from("products").update({ ...prices, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      // Log price history
      await supabase.from("price_history").insert({
        product_id: id,
        cost_price: prices.cost_price,
        wholesale_price: prices.wholesale_price,
        retail_suggested: prices.retail_suggested,
        reason: reason || "Manuell ändring",
        changed_by: "Admin",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; delta: number }) => {
      // Get current stock first
      const { data: product } = await supabase.from("products").select("stock").eq("id", params.id).single();
      if (!product) throw new Error("Product not found");
      const newStock = Number(product.stock) + params.delta;
      const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
