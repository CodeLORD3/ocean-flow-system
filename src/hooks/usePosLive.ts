import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Kassadata (egen POS + externa Nimpos-kassor).
 *
 * Alla aggregat räknas i databasen (pos_day_summary / pos_live_summary) så både
 * livevyn och stängningsrapporten alltid visar exakt samma siffror.
 */

export type PosPayment = { method: string; amount: number };
export type PosVatRow = { rate: number; vat: number; net: number };
export type PosTopProduct = { name: string; qty: number; amount: number };

export type PosDaySummary = {
  store_id: string;
  date: string;
  gross_sales: number;
  vat_total: number;
  net_sales: number;
  receipt_count: number;
  return_count: number;
  largest_sale: number;
  avg_receipt: number;
  last_receipt_at: string | null;
  payments: PosPayment[];
  vat_breakdown: PosVatRow[];
  top_products: PosTopProduct[];
  sources: string[];
};

export type PosLiveSummary = {
  date: string;
  stores: { store_id: string; name: string; currency?: string; summary: PosDaySummary }[];
  hours: { hour: number; amount: number; receipts: number }[];
  ops: { failed: number; unmapped: number; pending: number; unmatched_products: number };
};

export function posDateIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const PAYMENT_LABEL: Record<string, string> = {
  kort: "Kort",
  kontant: "Kontant",
  swish: "Swish",
  twint: "TWINT",
  faktura: "Faktura",
  ovrigt: "Övrigt",
  delad: "Delad",
  card: "Kort",
  cash: "Kontant",
  invoice: "Faktura",
  other: "Övrigt",
};

/** Dagsaggregat för en butik — används av både livevyn och dagsrapporten. */
export function usePosDaySummary(storeId?: string | null, date = posDateIso()) {
  return useQuery({
    queryKey: ["pos-day-summary", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pos_day_summary", {
        _store_id: storeId,
        _date: date,
      });
      if (error) throw error;
      return data as PosDaySummary;
    },
  });
}

/** Alla butiker för en dag + timgraf + driftstatus. */
export function usePosLiveSummary(date = posDateIso()) {
  return useQuery({
    queryKey: ["pos-live-summary", date],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("pos_live_summary", { _date: date });
      if (error) throw error;
      return data as PosLiveSummary;
    },
  });
}

export type PosTransaction = {
  id: string;
  source: string;
  external_receipt_no: string | null;
  receipt_no: number;
  store_id: string | null;
  occurred_at: string;
  status: string;
  total_ore: number;
  payment_method: string;
  payment_details: any;
  external_cashier: string | null;
  external_register: string | null;
  vat_breakdown: any;
  test_mode?: boolean;
  type?: string | null;
};

/** Senaste kvitton (live-lista). */
export function usePosRecentTransactions(date = posDateIso(), storeId?: string | null, limit = 50) {
  return useQuery({
    queryKey: ["pos-recent", date, storeId, limit],
    queryFn: async () => {
      let q = (supabase as any)
        .from("pos_transactions")
        .select(
          "id, source, receipt_no, external_receipt_no, store_id, occurred_at, status, total_ore, payment_method, payment_details, external_cashier, external_register, vat_breakdown, test_mode, type",
        )
        .gte("occurred_at", `${date}T00:00:00`)
        .lte("occurred_at", `${date}T23:59:59.999`)
        .eq("parked", false)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PosTransaction[];
    },
  });
}

export type PosTxItem = {
  id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unit: string;
  unit_price_ore: number;
  line_total_ore: number;
  vat_rate: number;
  product_id: string | null;
};

export function usePosTransactionItems(transactionId?: string | null) {
  return useQuery({
    queryKey: ["pos-tx-items", transactionId],
    enabled: !!transactionId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pos_transaction_items")
        .select(
          "id, product_name, sku, barcode, quantity, unit, unit_price_ore, line_total_ore, vat_rate, product_id",
        )
        .eq("transaction_id", transactionId)
        .order("external_line_no", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PosTxItem[];
    },
  });
}

/** Realtime: nya kvitton uppdaterar aggregat och listor direkt. */
export function usePosRealtime(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel("pos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_transactions" }, () => {
        qc.invalidateQueries({ queryKey: ["pos-live-summary"] });
        qc.invalidateQueries({ queryKey: ["pos-day-summary"] });
        qc.invalidateQueries({ queryKey: ["pos-recent"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, qc]);
}

/* ------------------------------------------------------------- mappningar */

export type NimposStoreMap = {
  id: string;
  store_code: string;
  register_id: string | null;
  store_id: string;
  active: boolean;
};

export function useNimposStoreMap() {
  return useQuery({
    queryKey: ["nimpos-store-map"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("nimpos_store_map")
        .select("id, store_code, register_id, store_id, active")
        .order("store_code");
      if (error) throw error;
      return (data ?? []) as NimposStoreMap[];
    },
  });
}

export function useSaveNimposStoreMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<NimposStoreMap> & { store_code: string; store_id: string }) => {
      const { error } = await (supabase as any)
        .from("nimpos_store_map")
        .upsert(row, { onConflict: "store_code" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nimpos-store-map"] });
      qc.invalidateQueries({ queryKey: ["nimpos-events"] });
    },
  });
}

export function useDeleteNimposStoreMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("nimpos_store_map").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nimpos-store-map"] }),
  });
}

export type NimposProductMap = {
  id: string;
  external_sku: string | null;
  barcode: string | null;
  external_name: string | null;
  product_id: string | null;
  unmatched_count: number;
  last_seen_at: string | null;
};

export function useNimposProductMap(onlyUnmatched = false) {
  return useQuery({
    queryKey: ["nimpos-product-map", onlyUnmatched],
    queryFn: async () => {
      let q = (supabase as any)
        .from("nimpos_product_map")
        .select("id, external_sku, barcode, external_name, product_id, unmatched_count, last_seen_at")
        .order("unmatched_count", { ascending: false })
        .limit(200);
      if (onlyUnmatched) q = q.is("product_id", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NimposProductMap[];
    },
  });
}

export function useLinkNimposProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string | null }) => {
      const { error } = await (supabase as any)
        .from("nimpos_product_map")
        .update({ product_id: productId })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nimpos-product-map"] });
      qc.invalidateQueries({ queryKey: ["pos-live-summary"] });
    },
  });
}

export type NimposEvent = {
  id: string;
  event_id: string;
  event_type: string;
  status: string;
  store_code: string | null;
  last_error: string | null;
  received_at: string;
  processed_at: string | null;
  payload: any;
};

/** Driftpanel: händelser som inte gick igenom. */
export function useNimposEvents(status: "problem" | "all" = "problem") {
  return useQuery({
    queryKey: ["nimpos-events", status],
    queryFn: async () => {
      let q = (supabase as any)
        .from("nimpos_webhook_events")
        .select("id, event_id, event_type, status, store_code, last_error, received_at, processed_at, payload")
        .order("received_at", { ascending: false })
        .limit(100);
      if (status === "problem") q = q.in("status", ["failed", "unmapped_store", "pending"]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NimposEvent[];
    },
  });
}
