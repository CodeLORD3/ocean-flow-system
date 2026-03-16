import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { logActivity } from "@/hooks/useActivityLog";

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
      return data as (Product & { suppliers: { name: string } | null; parent_product_id: string | null })[];
    },
  });
}

/** Returns only top-level (parent) products, with their subproducts attached */
export function useProductsWithChildren() {
  const { data: allProducts = [], ...rest } = useProducts();

  const parentProducts = allProducts.filter(p => !p.parent_product_id);
  const childMap = new Map<string, typeof allProducts>();
  
  for (const p of allProducts) {
    if (p.parent_product_id) {
      const existing = childMap.get(p.parent_product_id) || [];
      existing.push(p);
      childMap.set(p.parent_product_id, existing);
    }
  }

  const productsWithChildren = parentProducts.map(p => ({
    ...p,
    subproducts: childMap.get(p.id) || [],
  }));

  return { data: productsWithChildren, allProducts, ...rest };
}

export function useAddSubproduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { parent_id: string; name: string; sku: string; category: string; unit: string; cost_price: number; wholesale_price: number; retail_suggested: number; weight_per_piece?: number }) => {
      const { parent_id, ...rest } = params;
      const { data, error } = await supabase.from("products").insert({
        ...rest,
        parent_product_id: parent_id,
      } as any).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Subprodukt skapad: ${rest.name}`,
        entity_type: "product",
        entity_id: data?.id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; cost_price: number; wholesale_price: number; retail_suggested: number; reason?: string }) => {
      const { id, reason, ...prices } = params;
      const { error } = await supabase.from("products").update({ ...prices, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await supabase.from("price_history").insert({
        product_id: id,
        cost_price: prices.cost_price,
        wholesale_price: prices.wholesale_price,
        retail_suggested: prices.retail_suggested,
        reason: reason || "Manuell ändring",
        changed_by: "Admin",
      });
      await logActivity({
        action_type: "update",
        description: `Pris uppdaterat: ${reason || "Manuell ändring"}`,
        entity_type: "product",
        entity_id: id,
        details: prices,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; delta: number }) => {
      const { data: product } = await supabase.from("products").select("stock").eq("id", params.id).single();
      if (!product) throw new Error("Product not found");
      const newStock = Number(product.stock) + params.delta;
      const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", params.id);
      if (error) throw error;
      await logActivity({
        action_type: "update",
        description: `Lagersaldo ändrat: ${params.delta > 0 ? "+" : ""}${params.delta}`,
        entity_type: "product",
        entity_id: params.id,
        details: { delta: params.delta, new_stock: newStock },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}
