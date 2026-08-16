import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Kassahälsa (Nimpos) för Systemstatus och driftpanelen.
 *
 * Alla siffror räknas i databasen (nimpos_health) så larm, driftpanel och
 * dagsavslut aldrig kan visa olika sanningar.
 */

export type NimposHealthStore = {
  store_id: string;
  name: string;
  store_code: string | null;
  receipts: number;
  total_ore: number;
  last_receipt_at: string | null;
  silent_minutes: number | null;
};

export type NimposHealth = {
  date: string;
  stores: NimposHealthStore[];
  rejects: { reason: string; store_code: string | null; count: number }[];
  unmatched_lines: number;
  unit_mismatches: number;
  returns: number;
  reconciliations: {
    store_code: string | null;
    business_date: string;
    status: string;
    external_count: number | null;
    local_count: number;
    external_total_ore: number | null;
    local_total_ore: number;
    missing: number;
    message: string | null;
  }[];
  queued: number;
  parked: number;
};

export function useNimposHealth(date?: string) {
  const qc = useQueryClient();

  useEffect(() => {
    const ch = supabase
      .channel("nimpos-health")
      .on("postgres_changes", { event: "*", schema: "public", table: "pos_transactions" }, () =>
        qc.invalidateQueries({ queryKey: ["nimpos-health"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "nimpos_rejects" }, () =>
        qc.invalidateQueries({ queryKey: ["nimpos-health"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ["nimpos-health", date ?? null],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "nimpos_health",
        date ? { _date: date } : {},
      );
      if (error) throw error;
      return data as NimposHealth;
    },
  });
}

/** Spelar upp köade/parkerade kassahändelser igen (chefsbehörighet krävs). */
export function useNimposReplay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload?: { event_ids?: string[]; statuses?: string[] }) => {
      const { data, error } = await supabase.functions.invoke("nimpos-replay", {
        body: payload ?? {},
      });
      if (error) throw error;
      return data as { ok: boolean; replayed: number; results: any[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nimpos-health"] });
      qc.invalidateQueries({ queryKey: ["nimpos-events"] });
      qc.invalidateQueries({ queryKey: ["pos-live-summary"] });
      qc.invalidateQueries({ queryKey: ["pos-recent"] });
    },
  });
}

/** Kör nattavstämningen manuellt för ett datum. */
export function useNimposReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date?: string) => {
      const { data, error } = await supabase.functions.invoke("nimpos-reconcile", {
        body: date ? { date } : {},
      });
      if (error) throw error;
      return data as { ok: boolean; date: string; results: any[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nimpos-health"] }),
  });
}

export type PosReviewLine = {
  id: string;
  transaction_id: string;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  quantity: number;
  unit: string;
  pos_unit: string | null;
  unit_mismatch: boolean;
  review_status: string;
  line_total_ore: number;
  product_id: string | null;
  pos_transactions?: { occurred_at: string; store_id: string | null; external_id: string | null } | null;
};

/** Rader som behöver granskas: omatchade produkter och enhetsavvikelser. */
export function usePosReviewLines() {
  return useQuery({
    queryKey: ["pos-review-lines"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pos_transaction_items")
        .select(
          "id, transaction_id, product_name, sku, barcode, quantity, unit, pos_unit, unit_mismatch, review_status, line_total_ore, product_id, pos_transactions!inner(occurred_at, store_id, external_id, source)",
        )
        .neq("review_status", "ok")
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PosReviewLine[];
    },
  });
}

/**
 * Bekräftat val sparas som mappning på sku/streckkod, så att samma kassaartikel
 * matchas automatiskt nästa gång, och raden knyts till produkten.
 */
export function useResolvePosLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { line: PosReviewLine; productId: string }) => {
      const { line, productId } = args;
      const { error: lineErr } = await (supabase as any)
        .from("pos_transaction_items")
        .update({ product_id: productId, matched_by: "manuell", review_status: "ok" })
        .eq("id", line.id);
      if (lineErr) throw lineErr;

      if (line.sku || line.barcode) {
        const { data: existing } = await (supabase as any)
          .from("nimpos_product_map")
          .select("id")
          .or(
            [
              line.sku ? `external_sku.eq.${line.sku}` : null,
              line.barcode ? `barcode.eq.${line.barcode}` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          await (supabase as any)
            .from("nimpos_product_map")
            .update({ product_id: productId })
            .eq("id", existing.id);
        } else {
          await (supabase as any).from("nimpos_product_map").insert({
            external_sku: line.sku,
            barcode: line.barcode,
            external_name: line.product_name,
            product_id: productId,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-review-lines"] });
      qc.invalidateQueries({ queryKey: ["nimpos-product-map"] });
      qc.invalidateQueries({ queryKey: ["nimpos-health"] });
    },
  });
}

/** Kvitterar en enhetsavvikelse — kvantiteten räknas aldrig om automatiskt. */
export function useAcceptPosLineUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lineId: string) => {
      const { error } = await (supabase as any)
        .from("pos_transaction_items")
        .update({ review_status: "ok" })
        .eq("id", lineId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos-review-lines"] });
      qc.invalidateQueries({ queryKey: ["nimpos-health"] });
    },
  });
}
