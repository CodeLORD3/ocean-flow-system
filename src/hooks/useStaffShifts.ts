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

/** Den inloggade personens (eller angiven persons) öppna stämpling. */
export function useMyOpenShift(staffId?: string | null) {
  return useQuery({
    queryKey: ["staff-shift-open-one", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .eq("staff_id", staffId!)
        .is("clocked_out_at", null)
        .order("clocked_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StaffShift | null;
    },
    refetchInterval: 60_000,
  });
}

/** Senaste stämplingarna för en person. */
export function useShiftHistory(staffId?: string | null, limit = 20) {
  return useQuery({
    queryKey: ["staff-shift-history", staffId, limit],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .eq("staff_id", staffId!)
        .order("clocked_in_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as StaffShift[];
    },
  });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-shifts-open"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-open-one"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-history"] });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-shifts-open"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-open-one"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-history"] });
    },
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

/** Alla stämplingar (öppna och stängda) för en butik ett givet datum. */
export function useShiftsForDate(storeId?: string | null, date?: string) {
  return useQuery({
    queryKey: ["staff-shifts-date", storeId ?? "all", date],
    enabled: !!date,
    queryFn: async () => {
      const from = `${date}T00:00:00`;
      const to = `${date}T23:59:59`;
      let q = supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .gte("clocked_in_at", from)
        .lte("clocked_in_at", to)
        .order("clocked_in_at", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as StaffShift[];
    },
    refetchInterval: 60_000,
  });
}

/** HH:MM från en ISO-tidsstämpel (lokal tid). */
export function shiftTimeValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
