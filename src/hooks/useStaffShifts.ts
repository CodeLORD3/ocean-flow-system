import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffShift {
  id: string;
  staff_id: string;
  store_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

/** Öppna (aktiva) stämplingar — hela systemet eller en butik. */
export function useOpenShifts(storeId?: string | null) {
  return useQuery({
    queryKey: ["staff-shifts-open", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .is("clocked_out_at", null)
        .order("clocked_in_at", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffShift[];
    },
    refetchInterval: 60_000,
  });
}

/** Map staff_id -> öppen stämpling, för snabb uppslagning. */
export function useOpenShiftMap(storeId?: string | null) {
  const query = useOpenShifts(storeId);
  const map = new Map<string, StaffShift>();
  (query.data ?? []).forEach((s) => {
    if (!map.has(s.staff_id)) map.set(s.staff_id, s);
  });
  return { ...query, map };
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, storeId }: { staffId: string; storeId?: string | null }) => {
      // Säkerställ att ingen dubbelstämpling sker
      const { data: open } = await supabase
        .from("staff_shifts")
        .select("id")
        .eq("staff_id", staffId)
        .is("clocked_out_at", null)
        .limit(1);
      if (open && open.length > 0) return open[0].id;

      const { data, error } = await supabase
        .from("staff_shifts")
        .insert({ staff_id: staffId, store_id: storeId ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-shifts-open"] }),
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId }: { staffId: string }) => {
      const { error } = await supabase
        .from("staff_shifts")
        .update({ clocked_out_at: new Date().toISOString() })
        .eq("staff_id", staffId)
        .is("clocked_out_at", null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-shifts-open"] }),
  });
}

export function shiftDuration(from: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(from).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function shiftClock(from: string): string {
  return new Date(from).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
