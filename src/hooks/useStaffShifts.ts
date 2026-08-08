import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface StaffShift {
  id: string;
  staff_id: string;
  store_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

/** Början av dagens dygn (lokal tid) som ISO-sträng. */
function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Öppna (aktiva) stämplingar — hela systemet eller en butik. Endast dagens. */
export function useOpenShifts(storeId?: string | null) {
  return useQuery({
    queryKey: ["staff-shifts-open", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .is("clocked_out_at", null)
        .gte("clocked_in_at", startOfTodayIso())
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
        .gte("clocked_in_at", startOfTodayIso())
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

export type ClockInOutcome = "created" | "moved" | "already";

export interface ClockInResult {
  shiftId: string;
  outcome: ClockInOutcome;
  /** Butiken personen var instämplad i innan, när outcome = "moved". */
  previousStoreId?: string | null;
}

/**
 * Stämplar in.
 *
 * Gamla öppna stämplingar från tidigare dagar stängs automatiskt (vid slutet av
 * sitt eget dygn) så att en missad nattstängning inte kan låsa någon. Är personen
 * redan instämplad idag i en annan butik flyttas stämplingen dit; i samma butik
 * returneras "already" så gränssnittet kan säga det i stället för att stå tyst.
 */
export function useClockIn() {
  const qc = useQueryClient();
  return useMutation<ClockInResult, Error, { staffId: string; storeId?: string | null }>({
    mutationFn: async ({ staffId, storeId }) => {
      const { data: openRows, error: openErr } = await supabase
        .from("staff_shifts")
        .select("id, store_id, clocked_in_at")
        .eq("staff_id", staffId)
        .is("clocked_out_at", null)
        .order("clocked_in_at", { ascending: false });
      if (openErr) throw openErr;

      const todayStart = startOfTodayIso();
      const stale = (openRows ?? []).filter((r) => r.clocked_in_at < todayStart);
      const todays = (openRows ?? []).filter((r) => r.clocked_in_at >= todayStart);

      // Stäng gamla pass vid slutet av sitt eget dygn.
      for (const row of stale) {
        const end = new Date(row.clocked_in_at);
        end.setHours(23, 59, 59, 0);
        const { error } = await supabase
          .from("staff_shifts")
          .update({ clocked_out_at: end.toISOString() })
          .eq("id", row.id);
        if (error) throw error;
      }

      const sameStore = todays.find((r) => (r.store_id ?? null) === (storeId ?? null));
      if (sameStore) return { shiftId: sameStore.id, outcome: "already" };

      const otherStore = todays[0] ?? null;
      if (otherStore) {
        const { error } = await supabase
          .from("staff_shifts")
          .update({ clocked_out_at: new Date().toISOString() })
          .eq("id", otherStore.id);
        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("staff_shifts")
        .insert({ staff_id: staffId, store_id: storeId ?? null })
        .select("id")
        .single();
      if (error) throw error;

      return {
        shiftId: data.id as string,
        outcome: otherStore ? "moved" : "created",
        previousStoreId: otherStore?.store_id ?? null,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-shifts-open"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-open-one"] });
      qc.invalidateQueries({ queryKey: ["staff-shift-history"] });
      qc.invalidateQueries({ queryKey: ["staff-shifts-date"] });
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
