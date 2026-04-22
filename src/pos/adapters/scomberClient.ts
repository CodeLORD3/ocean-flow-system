// Typed client for the Scomber Commerce API (edge functions).
// POS, B2B, and Morning-rutin all go through this — no direct table writes.

import { supabase } from "@/integrations/supabase/client";

export interface ScomberLine {
  article_id: string;
  pos_product_id?: string;
  product_name: string;
  sku?: string;
  quantity: number;
  unit: "piece" | "kg" | "custom";
  unit_price_ore: number;
  line_total_ore: number;
  vat_rate: number;
  discount_ore?: number;
}

export interface ScomberCheckoutPayload {
  cashier_id: string;
  shift_id?: string | null;
  payment_method: "kort" | "kontant" | "swish";
  payment_details?: unknown;
  total_ore: number;
  vat_breakdown: Record<string, unknown>;
  control_code?: string;
  lines: ScomberLine[];
}

export interface ScomberCheckoutResult {
  ok: true;
  transaction: { id: string; receipt_no: number; occurred_at: string };
  allocations: number;
}

export interface ScomberPriceQuery {
  article_id: string;
  store_id?: string | null;
  channel?: "pos" | "b2b" | "morning" | "any";
  customer_tier_id?: string | null;
  effective_date?: string;
}

export interface ScomberResolvedPrice {
  article_id: string;
  name: string;
  unit: string;
  vat_rate: number;
  price_ore: number;
  source: "override" | "default";
  override_id?: string;
}

async function invoke<T>(
  fn:
    | "scomber-price-resolve"
    | "scomber-pos-checkout"
    | "scomber-b2b-order"
    | "scomber-batch-allocate"
    | "scomber-makrilltrade-sync"
    | "scomber-traceability"
    | "scomber-morning-suggest"
    | "scomber-set-override",
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  if (!data?.ok) throw new Error(`${fn} returned error: ${JSON.stringify(data)}`);
  return data as T;
}

export interface TraceabilityBatch {
  batch_id: string;
  article_id: string;
  supplier_name: string | null;
  caught_at: string | null;
  best_before: string | null;
  quantity_remaining: number;
  unit: string;
  raw: Record<string, unknown> | null;
}

export interface TraceabilityResponse {
  ok: true;
  product: { id: string; sku: string; name: string; erp_id: string | null } | null;
  article: { article_id: string; name: string; sku: string | null; unit: string; vat_rate: number; category: string | null } | null;
  batches: TraceabilityBatch[];
  store_id: string | null;
}

export interface MorningSuggestion {
  article_id: string;
  sku: string | null;
  name: string;
  unit: string;
  vat_rate: number;
  store_id: string;
  store_name: string;
  current_price_ore: number;
  current_source: "override" | "default";
  suggested_price_ore: number;
  change_ore: number;
  margin_percent: number | null;
  rationale: string;
  oldest_batch_id: string | null;
  cost_ore: number | null;
  strategy: string;
}

export const scomberClient = {
  resolvePrices(items: ScomberPriceQuery[]) {
    return invoke<{ ok: true; results: ScomberResolvedPrice[] }>(
      "scomber-price-resolve",
      { items },
    );
  },

  checkoutPos(payload: ScomberCheckoutPayload) {
    return invoke<ScomberCheckoutResult>("scomber-pos-checkout", {
      ...payload,
    } as Record<string, unknown>);
  },

  createB2bOrder(payload: {
    customer_name: string;
    customer_org_no?: string;
    customer_email?: string;
    customer_tier_id?: string;
    delivery_date?: string;
    store_id?: string;
    status?: "draft" | "confirmed";
    total_ore: number;
    vat_breakdown: Record<string, unknown>;
    notes?: string;
    created_by?: string;
    allocate?: boolean;
    lines: Array<{
      article_id: string;
      product_name: string;
      quantity: number;
      unit: string;
      unit_price_ore: number;
      line_total_ore: number;
      vat_rate: number;
    }>;
  }) {
    return invoke<{
      ok: true;
      order: { id: string; order_no: number };
      allocations: number;
    }>("scomber-b2b-order", payload as Record<string, unknown>);
  },

  allocateBatch(payload: {
    batch_id: string;
    article_id: string;
    source_type: "pos_transaction_item" | "b2b_order_line";
    source_id: string;
    quantity: number;
    unit: string;
  }) {
    return invoke<{ ok: true; allocation: { id: string; allocated_at: string } }>(
      "scomber-batch-allocate",
      payload as Record<string, unknown>,
    );
  },

  syncMakrilltrade(payload: {
    articles?: Array<Record<string, unknown>>;
    batches?: Array<Record<string, unknown>>;
  }) {
    return invoke<{ ok: true; mode: string; articles: number; batches: number }>(
      "scomber-makrilltrade-sync",
      payload as Record<string, unknown>,
    );
  },

  traceability(payload: { sku?: string; article_sku?: string | null; store_id?: string | null }) {
    return invoke<TraceabilityResponse>("scomber-traceability", payload as Record<string, unknown>);
  },

  morningSuggest(payload: { store_ids: string[] }) {
    return invoke<{ ok: true; generated_at: string; suggestions: MorningSuggestion[] }>(
      "scomber-morning-suggest",
      payload as Record<string, unknown>,
    );
  },

  setOverrides(payload: {
    overrides: Array<{
      article_id: string;
      store_id?: string | null;
      price_ore: number;
      channel?: string;
      effective_date?: string;
    }>;
    set_by?: string;
  }) {
    return invoke<{ ok: true; inserted: number }>(
      "scomber-set-override",
      payload as Record<string, unknown>,
    );
  },
};
