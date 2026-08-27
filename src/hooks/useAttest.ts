import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Attest, avvikelser och periodlåsning (etapp 3 D).
 *
 * Beräkningen görs av edge function attest-compute som matchar time_entries mot
 * publicerade shifts. Klienten fattar bara beslut — varje beslut loggas med
 * beslutsfattare och tidpunkt.
 */

export interface Attestation {
  id: string;
  store_id: string;
  legal_entity_id: string | null;
  date: string;
  employee_id: string;
  shift_id: string | null;
  computed: {
    scheduled_minutes?: number;
    clocked_minutes?: number;
    diff_minutes?: number;
    late_in_minutes?: number;
    early_out_minutes?: number;
    break_minutes?: number;
    scheduled_break_minutes?: number;
    tolerance_minutes?: number;
    first_in?: string | null;
    last_out?: string | null;
  };
  deviation_type: "none" | "sen_in" | "tidig_ut" | "missad_rast" | "oplanerad_tid" | "missat_pass";
  status: "auto_approved" | "flagged" | "approved" | "rejected";
  basis: "schema" | "stamplad" | "justerad" | null;
  approved_minutes: number | null;
  decided_by: string | null;
  decided_at: string | null;
}

export interface PeriodLock {
  id: string;
  store_id: string;
  legal_entity_id: string | null;
  period: string;
  locked_at: string;
  locked_by: string | null;
  unlocked_at: string | null;
  unlocked_by: string | null;
  unlock_reason: string | null;
}

export const DEVIATION_LABEL: Record<Attestation["deviation_type"], string> = {
  none: "Inom tolerans",
  sen_in: "Sen instämpling",
  tidig_ut: "Tidig utstämpling",
  missad_rast: "Rast saknas",
  oplanerad_tid: "Oplanerad tid",
  missat_pass: "Missat pass",
};

export function useAttestations(storeId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ["attestations", storeId, from, to],
    queryFn: async () => {
      let q = supabase.from("attestations").select("*").gte("date", from).lte("date", to);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q.order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Attestation[];
    },
  });
}

export function useComputeAttest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, from, to }: { storeId: string | null; from: string; to: string }) => {
      const { data, error } = await supabase.functions.invoke("attest-compute", {
        body: { store_id: storeId, from, to },
      });
      if (error) throw error;
      return data as { created: number; updated: number; flagged: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attestations"] }),
  });
}

export function useDecideAttestations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      ids,
      approve,
      basis,
      minutes,
    }: {
      ids: string[];
      approve: boolean;
      basis: Attestation["basis"];
      minutes?: number | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("attestations")
        .update({
          status: approve ? "approved" : "rejected",
          basis,
          approved_minutes: minutes ?? null,
          decided_by: auth.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .in("id", ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attestations"] }),
  });
}

export function usePeriodLocks(storeId: string | null) {
  return useQuery({
    queryKey: ["period_locks", storeId],
    queryFn: async () => {
      let q = supabase.from("period_locks").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q.order("period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PeriodLock[];
    },
  });
}

export function useLockPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      legalEntityId,
      period,
    }: {
      storeId: string;
      legalEntityId: string | null;
      period: string;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("period_locks").upsert(
        {
          store_id: storeId,
          legal_entity_id: legalEntityId,
          period,
          locked_at: new Date().toISOString(),
          locked_by: auth.user?.id ?? null,
          unlocked_at: null,
          unlocked_by: null,
          unlock_reason: null,
        },
        { onConflict: "store_id,period" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period_locks"] }),
  });
}

/** Upplåsning är en loggad admin-åtgärd. */
export function useUnlockPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("period_locks")
        .update({
          unlocked_at: new Date().toISOString(),
          unlocked_by: auth.user?.id ?? null,
          unlock_reason: reason,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["period_locks"] }),
  });
}

export interface ScheduleImport {
  id: string;
  filename: string;
  source: "template" | "ai_fallback";
  status: "parsing" | "review" | "imported" | "undone";
  store_id: string | null;
  legal_entity_id: string | null;
  row_results: unknown;
  created_at: string;
}

export function useScheduleImports(storeId: string | null) {
  return useQuery({
    queryKey: ["schedule_imports", storeId],
    queryFn: async () => {
      let q = supabase.from("schedule_imports").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as ScheduleImport[];
    },
  });
}

/** Ångra import: tar bort importens utkast, publicerade pass rörs aldrig. */
export function useUndoImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importId: string) => {
      const { data, error } = await supabase
        .from("shifts")
        .delete()
        .eq("import_id", importId)
        .eq("status", "draft")
        .select("id");
      if (error) throw error;
      const { error: upErr } = await supabase
        .from("schedule_imports")
        .update({ status: "undone" })
        .eq("id", importId);
      if (upErr) throw upErr;
      return data?.length ?? 0;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["schedule_imports"] });
    },
  });
}
