import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export type PosRegisterRow = {
  id: string;
  store_id: string;
  legal_entity_id: string;
  register_number: string;
  name: string | null;
  software_version: string;
  journal_writer: string;
  journal_seq: number;
  journal_last_hash: string | null;
  is_active: boolean;
  stores: { name: string; city: string | null; region_country: string | null; currency: string | null } | null;
  legal_entities: { legal_name: string | null; country: string | null } | null;
  pos_grand_totals: { gt_sales: number; gt_returns: number; gt_net: number; receipt_count: number; training_count: number } | null;
};

export type PosJournalRow = {
  register_id: string;
  sequence_no: number;
  event_time: string;
  event_type: string;
  hash: string;
  prev_hash: string;
  payload: Record<string, any>;
  store_id: string;
};

/** Regioner: land, valuta, tidszon och kontantavrundning. */
export function usePosRegions() {
  return useQuery({
    queryKey: ["pos_regions"],
    queryFn: async () => {
      const { data, error } = await db.from("pos_regions").select("*").order("country_code");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

/** Alla kassaregister med butik, bolag och ackumulerade summor. */
export function usePosRegisters() {
  return useQuery({
    queryKey: ["pos_registers"],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_registers")
        .select(
          "*, stores(name, city, region_country, currency), legal_entities(legal_name, country), pos_grand_totals(gt_sales, gt_returns, gt_net, receipt_count, training_count)",
        )
        .order("register_number");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        ...r,
        pos_grand_totals: Array.isArray(r.pos_grand_totals) ? r.pos_grand_totals[0] ?? null : r.pos_grand_totals,
      })) as PosRegisterRow[];
    },
  });
}

/** Senaste journalposterna över alla register. */
export function usePosJournal(limit = 50) {
  return useQuery({
    queryKey: ["pos_journal", limit],
    queryFn: async () => {
      const { data, error } = await db
        .from("pos_journal")
        .select("register_id, sequence_no, event_time, event_type, hash, prev_hash, payload, store_id")
        .order("event_time", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PosJournalRow[];
    },
  });
}

/** Verifierar hashkedjan för ett register. */
export function useVerifyJournal() {
  return useMutation({
    mutationFn: async (registerId: string) => {
      const { data, error } = await db.rpc("pos_journal_verify", { p_register_id: registerId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { ok: !!row?.ok, firstBadSeq: row?.first_bad_seq ?? null } as {
        ok: boolean;
        firstBadSeq: number | null;
      };
    },
  });
}

/** Demosekvens i övningsläge. Rör aldrig försäljningssummorna. */
export function useDemoSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (registerId: string) => {
      const { data, error } = await db.rpc("pos_demo_training_sequence", { p_register_id: registerId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { events: number; journal_seq: number; session_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pos_journal"] });
      qc.invalidateQueries({ queryKey: ["pos_registers"] });
    },
  });
}
