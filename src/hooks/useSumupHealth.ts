import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * SumUp-kassan (Zollikon), etapp 1: körningsstatus, larm, kö och
 * namnmappning. Inga lagerrörelser finns ännu — det kommer i etapp 2.
 */

export type SumupMerchant = {
  merchant_code: string;
  store_id: string;
  legal_entity_id: string;
  currency: string;
  test_mode: boolean;
  active: boolean;
  label: string | null;
  last_polled_at: string | null;
  last_success_at: string | null;
  last_transaction_at: string | null;
  fail_streak: number;
  last_error: string | null;
};

export type SumupRun = {
  id: string;
  merchant_code: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  fetched_count: number;
  queued_count: number;
  duplicate_count: number;
  http_status: number | null;
  error_code: string | null;
  message: string | null;
};

export type SumupOpeningHour = {
  store_id: string;
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
};

/** Tyst kassa-larm gäller bara inom butikens öppettid (Zürich-tid). */
export function isOpenNow(hours: SumupOpeningHour[], now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const name = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().replace(".", "");
  const map: Record<string, number> = { sön: 0, mån: 1, tis: 2, ons: 3, tors: 4, fre: 5, lör: 6 };
  const weekday = map[name] ?? now.getDay();
  const row = hours.find((h) => h.weekday === weekday);
  if (!row || row.closed || !row.open_time || !row.close_time) return false;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const minutes = hh * 60 + mm;
  return minutes >= toMin(row.open_time) && minutes <= toMin(row.close_time);
}

export function useSumupHealth() {
  return useQuery({
    queryKey: ["sumup-health"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [merchants, runs, queue, unmatched] = await Promise.all([
        supabase.from("sumup_merchants").select("*").order("merchant_code"),
        supabase
          .from("sumup_poll_runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(25),
        supabase.from("sumup_events").select("status, test_mode"),
        supabase
          .from("sumup_product_map")
          .select("id, external_name, merchant_code, unmatched_count, last_seen_at, product_id")
          .is("product_id", null)
          .order("unmatched_count", { ascending: false })
          .limit(50),
      ]);

      const storeIds = (merchants.data ?? []).map((m: any) => m.store_id);
      let hours: SumupOpeningHour[] = [];
      if (storeIds.length) {
        const { data } = await supabase
          .from("store_opening_hours")
          .select("store_id, weekday, open_time, close_time, closed")
          .in("store_id", storeIds);
        hours = (data ?? []) as SumupOpeningHour[];
      }

      const events = queue.data ?? [];
      return {
        merchants: (merchants.data ?? []) as SumupMerchant[],
        runs: (runs.data ?? []) as SumupRun[],
        hours,
        queue: {
          koad: events.filter((e: any) => e.status === "koad").length,
          bearbetad: events.filter((e: any) => e.status === "bearbetad").length,
          fel: events.filter((e: any) => e.status === "fel").length,
          total: events.length,
        },
        unmatched: (unmatched.data ?? []) as {
          id: string;
          external_name: string;
          merchant_code: string | null;
          unmatched_count: number;
          last_seen_at: string;
        }[],
      };
    },
  });
}

/** Manuell hämtning (samma funktion som schemaläggaren kör). */
export function useSumupPoll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (merchantCode?: string) => {
      const { data, error } = await supabase.functions.invoke("sumup-poll", {
        body: merchantCode ? { merchant_code: merchantCode } : {},
      });
      if (error) throw error;
      return data as { ok: boolean; results: SumupRun[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sumup-health"] }),
  });
}

/** Viktvarutestet: hämtar rå JSON för en transaktion utan att bokföra något. */
export function useSumupProbe() {
  return useMutation({
    mutationFn: async (input: { merchantCode: string; transactionId: string }) => {
      const { data, error } = await supabase.functions.invoke("sumup-poll", {
        body: {
          action: "probe",
          merchant_code: input.merchantCode,
          transaction_id: input.transactionId,
        },
      });
      if (error) throw error;
      return data as Record<string, unknown>;
    },
  });
}

/** Bekräftar namnmappning SumUp-artikel → produkt. */
export function useSumupMapProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; productId: string; unit: string | null }) => {
      const { error } = await supabase
        .from("sumup_product_map")
        .update({ product_id: input.productId, unit: input.unit, unmatched_count: 0 })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sumup-health"] });
      qc.invalidateQueries({ queryKey: ["sumup-review-lines"] });
    },
  });
}

/**
 * Skapar produkten i Makrilltrade och kopplar SumUp-namnet direkt.
 * SKU sätts från kategorins prefix så registret behåller sin numrering.
 */
export function useSumupCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      unit: string;
      categoryId: string;
      categoryName: string;
      skuPrefix: string;
    }) => {
      const prefix = (input.skuPrefix || "SV").toUpperCase();
      const { data: last } = await supabase
        .from("products")
        .select("sku")
        .like("sku", `${prefix}-%`)
        .order("sku", { ascending: false })
        .limit(1);
      const lastNo = Number(String(last?.[0]?.sku ?? "").split("-")[1] ?? 0);
      const sku = `${prefix}-${String((Number.isFinite(lastNo) ? lastNo : 0) + 1).padStart(3, "0")}`;

      const { data: product, error } = await supabase
        .from("products")
        .insert({
          name: input.name,
          sku,
          unit: input.unit,
          category: input.categoryName,
          category_id: input.categoryId,
          active: true,
        } as any)
        .select("id, unit, sku")
        .single();
      if (error) throw error;

      const { error: mapErr } = await supabase
        .from("sumup_product_map")
        .update({ product_id: product.id, unit: product.unit, unmatched_count: 0 })
        .eq("id", input.id);
      if (mapErr) throw mapErr;
      return product;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sumup-health"] });
      qc.invalidateQueries({ queryKey: ["sumup-review-lines"] });
    },
  });
}

/** Bearbetar kön till transaktioner och lagerrörelser (etapp 2). */
export function useSumupProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (merchantCode?: string) => {
      const { data, error } = await supabase.functions.invoke("sumup-process", {
        body: merchantCode ? { merchant_code: merchantCode } : {},
      });
      if (error) throw error;
      return data as {
        ok: boolean;
        bearbetade: number;
        duplikat: number;
        fel: number;
        rorelser: number;
        omatchade: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sumup-health"] });
      qc.invalidateQueries({ queryKey: ["sumup-review-lines"] });
      qc.invalidateQueries({ queryKey: ["pos-live-summary"] });
      qc.invalidateQueries({ queryKey: ["pos-recent"] });
    },
  });
}

/** Kör nattavstämningen manuellt för ett datum. */
export function useSumupReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { date?: string; merchantCode?: string } = {}) => {
      const { data, error } = await supabase.functions.invoke("sumup-reconcile", {
        body: {
          ...(input.date ? { date: input.date } : {}),
          ...(input.merchantCode ? { merchant_code: input.merchantCode } : {}),
        },
      });
      if (error) throw error;
      return data as { ok: boolean; date: string; results: SumupReconciliation[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sumup-health"] });
      qc.invalidateQueries({ queryKey: ["sumup-reconciliations"] });
    },
  });
}

export type SumupReconciliation = {
  id: string;
  merchant_code: string;
  recon_date: string;
  currency: string;
  sumup_count: number;
  sumup_total_minor: number;
  local_count: number;
  local_total_minor: number;
  diff_minor: number;
  missing_external_ids: string[];
  refetched_count: number;
  receipt_filled_count: number;
  status: string;
  message: string | null;
};

export function useSumupReconciliations(limit = 7) {
  return useQuery({
    queryKey: ["sumup-reconciliations", limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sumup_reconciliations")
        .select("*")
        .order("recon_date", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SumupReconciliation[];
    },
  });
}

/** Rader som bokförts men behöver granskas (omatchade eller okänd kvantitet). */
export function useSumupReviewLines(limit = 50) {
  return useQuery({
    queryKey: ["sumup-review-lines", limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pos_transaction_items")
        .select(
          "id, product_name, quantity, unit, quantity_source, review_status, line_total_ore, transaction_id, pos_transactions!inner(source, occurred_at, currency, external_receipt_no)",
        )
        .in("review_status", ["unmatched", "unknown_quantity"])
        .eq("pos_transactions.source", "sumup")
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}
