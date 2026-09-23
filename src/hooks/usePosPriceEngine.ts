import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type PosVatRate = {
  id: string;
  country_code: string;
  rate: number;
  category: string;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
};

export type PosPriceList = {
  id: string;
  name: string;
  country_code: string;
  currency_code: string;
  is_active: boolean;
};

export type PosPriceListItem = {
  price_list_id: string;
  product_id: string;
  price_inc_vat: number;
  vat_category: string;
  valid_from: string;
  products: { name: string; unit: string | null; sku: string | null } | null;
};

export type PosOverride = {
  id: string;
  store_id: string;
  product_id: string;
  price_inc_vat: number;
  valid_from: string;
  valid_to: string;
  reason: string;
  lot_number: string | null;
  percent_off: number | null;
  products: { name: string; unit: string | null } | null;
  stores: { name: string } | null;
};

export type PosMarkdownRule = {
  id: string;
  country_code: string;
  category_id: string | null;
  percent_off: number;
  trigger_type: "last_day" | "hours_to_expiry";
  hours_before: number | null;
  active: boolean;
};

export type EffectivePrice = {
  price_inc_vat: number | null;
  vat_rate: number | null;
  price_source: "store_override" | "list" | "none";
  source_id: string | null;
};

/** Gällande momssatser per land och kategori. */
export function usePosVatRates() {
  return useQuery({
    queryKey: ["pos_vat_rates"],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_vat_rates")
        .select("*")
        .order("country_code")
        .order("category")
        .order("valid_from");
      if (error) throw error;
      return (data ?? []) as PosVatRate[];
    },
  });
}

/** Centrala prislistor. */
export function usePosPriceLists() {
  return useQuery({
    queryKey: ["pos_price_lists"],
    queryFn: async () => {
      const { data, error } = await db.from("pos_price_lists").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as PosPriceList[];
    },
  });
}

/** Senast publicerade priser i en lista, en rad per vara. */
export function usePosPriceListItems(priceListId?: string, search = "") {
  return useQuery({
    queryKey: ["pos_price_list_items", priceListId, search],
    enabled: !!priceListId,
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_price_list_items")
        .select("price_list_id, product_id, price_inc_vat, vat_category, valid_from, products(name, unit, sku)")
        .eq("price_list_id", priceListId)
        .order("valid_from", { ascending: false })
        .limit(4000);
      if (error) throw error;
      const rows = (data ?? []) as PosPriceListItem[];
      const latest = new Map<string, PosPriceListItem>();
      for (const r of rows) if (!latest.has(r.product_id)) latest.set(r.product_id, r);
      const q = search.trim().toLowerCase();
      return Array.from(latest.values())
        .filter((r) => !q || (r.products?.name ?? "").toLowerCase().includes(q))
        .sort((a, b) => (a.products?.name ?? "").localeCompare(b.products?.name ?? "", "sv"));
    },
  });
}

/** Butiksöverrides som gäller nu eller framåt. */
export function usePosOverrides() {
  return useQuery({
    queryKey: ["pos_overrides"],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_store_price_overrides")
        .select("*, products(name, unit), stores(name)")
        .gte("valid_to", new Date(Date.now() - 86400000).toISOString())
        .order("valid_from", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as PosOverride[];
    },
  });
}

/** Nedsättningsregler nära bäst före. */
export function usePosMarkdownRules() {
  return useQuery({
    queryKey: ["pos_markdown_rules"],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_markdown_rules")
        .select("*")
        .order("country_code")
        .order("percent_off");
      if (error) throw error;
      return (data ?? []) as PosMarkdownRule[];
    },
  });
}

/** Priskoll: effektivt pris, momssats och källa. */
export function useEffectivePrice(storeId?: string, productId?: string) {
  return useQuery({
    queryKey: ["pos_effective_price", storeId, productId],
    enabled: !!storeId && !!productId,
    queryFn: async () => {
      const { data, error } = await db.rpc("pos_effective_price", {
        p_store_id: storeId,
        p_product_id: productId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as EffectivePrice | null;
    },
  });
}

export function usePublishPrices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      priceListId: string;
      items: { product_id: string; price_inc_vat: number; vat_category?: string }[];
      staffId?: string | null;
    }) => {
      const { data, error } = await db.rpc("pos_publish_prices", {
        p_price_list_id: v.priceListId,
        p_items: v.items,
        p_staff: v.staffId ?? null,
      });
      if (error) throw error;
      return data as { items: number; registers: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_price_list_items"] });
      qc.invalidateQueries({ queryKey: ["pos_journal"] });
      qc.invalidateQueries({ queryKey: ["pos_effective_price"] });
    },
  });
}

export function useCreateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      storeId: string;
      productId: string;
      price: number;
      reason: string;
      validTo: string;
      staffId?: string | null;
    }) => {
      const { data, error } = await db.rpc("pos_create_override", {
        p_store_id: v.storeId,
        p_product_id: v.productId,
        p_price: v.price,
        p_reason: v.reason,
        p_valid_to: v.validTo,
        p_staff: v.staffId ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_overrides"] });
      qc.invalidateQueries({ queryKey: ["pos_journal"] });
      qc.invalidateQueries({ queryKey: ["pos_effective_price"] });
    },
  });
}

export function useEndOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { overrideId: string; staffId?: string | null }) => {
      const { error } = await db.rpc("pos_end_override", {
        p_override_id: v.overrideId,
        p_staff: v.staffId ?? null,
      });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_overrides"] });
      qc.invalidateQueries({ queryKey: ["pos_journal"] });
      qc.invalidateQueries({ queryKey: ["pos_effective_price"] });
    },
  });
}

export function useSetMarkdownRuleActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { ruleId: string; active: boolean }) => {
      const { error } = await db.rpc("pos_set_markdown_rule_active", {
        p_rule_id: v.ruleId,
        p_active: v.active,
      });
      if (error) throw error;
      return v.active;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pos_markdown_rules"] }),
  });
}

export function useApplyMarkdowns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await db.rpc("pos_apply_markdowns");
      if (error) throw error;
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_overrides"] });
      qc.invalidateQueries({ queryKey: ["pos_journal"] });
    },
  });
}
