import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CleaningSignature {
  id: string;
  store_id: string;
  dag: string;
  staff_name: string;
  signed_by_user: string;
  signed_at: string;
}

/** Gällande städsignatur för en butik och dag (ångrade räknas inte). */
export function useStoreCleaning(storeId?: string | null, dag?: string) {
  return useQuery({
    queryKey: ["store-cleaning", storeId, dag],
    enabled: !!storeId && !!dag,
    queryFn: async (): Promise<CleaningSignature | null> => {
      const { data, error } = await (supabase as any)
        .from("store_cleaning_signatures")
        .select("id, store_id, dag, staff_name, signed_by_user, signed_at")
        .eq("store_id", storeId)
        .eq("dag", dag)
        .is("undone_at", null)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/** Dagens gällande signaturer för alla butiker (admins startsida). */
export function useCleaningToday(dag: string) {
  return useQuery({
    queryKey: ["store-cleaning-all", dag],
    refetchInterval: 120_000,
    queryFn: async (): Promise<Record<string, CleaningSignature>> => {
      const { data, error } = await (supabase as any)
        .from("store_cleaning_signatures")
        .select("id, store_id, dag, staff_name, signed_by_user, signed_at")
        .eq("dag", dag)
        .is("undone_at", null);
      if (error) throw error;
      const map: Record<string, CleaningSignature> = {};
      (data ?? []).forEach((r: CleaningSignature) => (map[r.store_id] = r));
      return map;
    },
  });
}

export function useCleaningActions() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["store-cleaning"] });
    qc.invalidateQueries({ queryKey: ["store-cleaning-all"] });
  };
  const sign = useMutation({
    mutationFn: async (storeId: string) => {
      const { error } = await (supabase as any).rpc("sign_store_cleaning", { _store_id: storeId });
      if (error) throw error;
    },
    onSettled: done,
  });
  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("undo_store_cleaning", { _id: id });
      if (error) throw error;
    },
    onSettled: done,
  });
  return { sign, undo };
}

export function klockslag(ts: string) {
  return new Date(ts).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
}
