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
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["planned-shifts"] }), qc.invalidateQueries({ queryKey: ["planned-shifts-range"] })),
  });
}

export function useDeletePlannedShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff_planned_shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => (qc.invalidateQueries({ queryKey: ["planned-shifts"] }), qc.invalidateQueries({ queryKey: ["planned-shifts-range"] })),
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

/**
 * Publicerade pass från schemaimporten (`shifts`), omformade till samma form
 * som planerade pass. Id prefixas med "imp:" så de inte kan redigeras som planerade.
 */
export function useImportedShiftsRange(from: string, to: string, storeId?: string | null) {
  return useQuery({
    queryKey: ["imported-shifts-range", from, to, storeId ?? "all"],
    enabled: !!from && !!to,
    queryFn: async () => {
      let q = supabase
        .from("shifts")
        .select("id, store_id, date, start_time, end_time, note, employee_id, employees(staff_id)")
        .eq("status", "published")
        .not("employee_id", "is", null)
        .gte("date", from)
        .lte("date", to);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as any[])
        .filter((r) => r.employees?.staff_id)
        .map((r) => ({
          id: `imp:${r.id}`,
          staff_id: r.employees.staff_id as string,
          store_id: r.store_id,
          shift_date: r.date,
          start_time: String(r.start_time).slice(0, 5),
          end_time: String(r.end_time).slice(0, 5),
          note: r.note ?? null,
        })) as PlannedShiftRow[];
    },
  });
}
