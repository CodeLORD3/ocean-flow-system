import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlannedShiftRow } from "@/lib/liveStaff";

const SELECT = "id, staff_id, store_id, shift_date, start_time, end_time, note";

/** Planerade pass för ett datum — alla butiker eller en enskild. */
export function usePlannedShifts(day: string, storeId?: string | null) {
  return useQuery({
    queryKey: ["planned-shifts", day, storeId ?? "all"],
    enabled: !!day,
    queryFn: async () => {
      let q = supabase.from("staff_planned_shifts").select(SELECT).eq("shift_date", day);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlannedShiftRow[];
    },
  });
}

export interface PlannedShiftInput {
  id?: string;
  staff_id: string;
  store_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  note?: string | null;
}

export function useSavePlannedShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PlannedShiftInput) => {
      if (input.id) {
        const { error } = await supabase
          .from("staff_planned_shifts")
          .update({
            store_id: input.store_id,
            shift_date: input.shift_date,
            start_time: input.start_time,
            end_time: input.end_time,
            note: input.note ?? null,
          })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("staff_planned_shifts").insert({
        staff_id: input.staff_id,
        store_id: input.store_id,
        shift_date: input.shift_date,
        start_time: input.start_time,
        end_time: input.end_time,
        note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-shifts"] }),
  });
}

export function useDeletePlannedShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_planned_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["planned-shifts"] }),
  });
}

/** Planerade pass i ett datumintervall (t.ex. en vecka). */
export function usePlannedShiftsRange(from: string, to: string, storeId?: string | null) {
  return useQuery({
    queryKey: ["planned-shifts-range", from, to, storeId ?? "all"],
    enabled: !!from && !!to,
    queryFn: async () => {
      let q = supabase
        .from("staff_planned_shifts")
        .select(SELECT)
        .gte("shift_date", from)
        .lte("shift_date", to)
        .order("start_time", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PlannedShiftRow[];
    },
  });
}
