import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PriceTier {
  id: string;
  name: string;
  region: string | null;
  currency: string;
  vat_rate: number;
  sort_order: number;
  active: boolean;
}

export interface WholesalePrice {
  id: string;
  product_id: string;
  price_tier_id: string;
  price: number;
  currency: string;
  lock_mode: "locked" | "estimated";
  source_lot_id: string | null;
  basis_cost: number | null;
  margin_pct: number | null;
  retail_suggested: number | null;
  valid_from: string;
  set_by: string | null;
  note: string | null;
}

export interface CostHistory {
  last_cost: number | null;
  last_cost_at: string | null;
  avg_cost_30d: number | null;
  min_cost_90d: number | null;
  max_cost_90d: number | null;
  lots_30d: number;
}

/** Grossistens tre priskategorier: Göteborg/Väst, Stockholm, Schweiz. */
export function usePriceTiers() {
  return useQuery({
    queryKey: ["price_tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_tiers")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as PriceTier[];
    },
  });
}

/** Aktuellt pris per produkt och priskategori (senaste raden vinner). */
export function useCurrentTierPrices(productIds?: string[]) {
  return useQuery({
    queryKey: ["wholesale_prices_current", productIds?.length ? [...productIds].sort() : "all"],
    queryFn: async () => {
      let q = supabase.from("wholesale_prices_current").select("*");
      if (productIds?.length) q = q.in("product_id", productIds);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, WholesalePrice>();
      for (const row of (data || []) as WholesalePrice[]) {
        map.set(`${row.product_id}:${row.price_tier_id}`, row);
      }
      return map;
    },
  });
}

/** Butikens gällande priser — nyckel är product_id. */
export function useStoreTierPrices(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_tier_prices", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data: store, error: sErr } = await supabase
        .from("stores")
        .select("id, price_tier_id, currency")
        .eq("id", storeId!)
        .maybeSingle();
      if (sErr) throw sErr;
      const tierId = (store as any)?.price_tier_id as string | null;
      if (!tierId) return new Map<string, WholesalePrice>();
      const { data, error } = await supabase
        .from("wholesale_prices_current")
        .select("*")
        .eq("price_tier_id", tierId);
      if (error) throw error;
      const map = new Map<string, WholesalePrice>();
      for (const row of (data || []) as WholesalePrice[]) map.set(row.product_id, row);
      return map;
    },
  });
}

/** Tidigare inköpspriser för en produkt. */
export function useProductCostHistory(productId?: string | null) {
  return useQuery({
    queryKey: ["product_cost_history", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_cost_history", { _product_id: productId! });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row || null) as CostHistory | null;
    },
  });
}

export function useSetTierPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      product_id: string;
      price_tier_id: string;
      price: number;
      currency: string;
      lock_mode: "locked" | "estimated";
      basis_cost?: number | null;
      margin_pct?: number | null;
      retail_suggested?: number | null;
      source_lot_id?: string | null;
      set_by?: string | null;
      note?: string | null;
    }) => {
      const { error } = await supabase.from("wholesale_prices").insert(input as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wholesale_prices_current"] });
      qc.invalidateQueries({ queryKey: ["store_tier_prices"] });
    },
  });
}

/** Prishistorik per produkt och kategori. */
export function useTierPriceHistory(productId?: string | null) {
  return useQuery({
    queryKey: ["wholesale_price_history", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wholesale_prices")
        .select("*")
        .eq("product_id", productId!)
        .order("valid_from", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data || []) as WholesalePrice[];
    },
  });
}

export const margin = (cost: number, price: number) =>
  price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0;

export const priceFromMargin = (cost: number, marginPct: number) =>
  marginPct >= 100 ? 0 : Math.round((cost / (1 - marginPct / 100)) * 100) / 100;

export const fmt = (n: number, d = 2) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/\u00a0/g, " ");
