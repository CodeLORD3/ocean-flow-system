import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adminsidan av stämpelklockan (etapp 2).
 *
 * Klockklienten går enbart via edge functions. Dessa hooks är för inloggade
 * administratörer/butikschefer och läser tabellerna under RLS.
 */

export interface ClockStationProfile {
  rounding?: { mode?: string; step?: number; direction?: string };
  break?: { mode?: string; auto_after_hours?: number; auto_minutes?: number };
  tolerance_minutes?: number;
  geofence?: boolean;
}

export interface ClockStation {
  id: string;
  name: string;
  store_id: string | null;
  legal_entity_id: string | null;
  activation_code_hint: string | null;
  code_rotated_at: string;
  status: string;
  last_seen_at: string | null;
  profile: ClockStationProfile;
  created_at: string;
}

export interface TimeEntry {
  id: string;
  employee_id: string;
  station_id: string | null;
  store_id: string | null;
  legal_entity_id: string | null;
  work_site_id: string | null;
  cost_center: string | null;
  punch_lat: number | null;
  punch_lng: number | null;
  punch_accuracy_m: number | null;
  distance_m: number | null;
  geofence_ok: boolean | null;
  offline_queued: boolean;
  synced_at: string | null;
  type: "in" | "ut" | "rast_start" | "rast_slut";
  occurred_at: string;
  registered_at: string;
  source: "clock" | "manual" | "correction" | "import";
  corrects_entry_id: string | null;
  correction_kind: string | null;
  created_by: string | null;
  note: string | null;
}

export interface PendingRegistration {
  id: string;
  pnr_masked: string | null;
  identifier_masked: string | null;
  station_id: string | null;
  store_id: string | null;
  legal_entity_id: string | null;
  stated_name: string | null;
  occurred_at: string;
  status: string;
  employee_id: string | null;
  attempts: number;
  created_at: string;
}

export function useClockStations() {
  return useQuery({
    queryKey: ["clock_stations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clock_stations")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as ClockStation[];
    },
  });
}

export function useCreateClockStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; store_id: string | null; legal_entity_id?: string | null }) => {
      const { data, error } = await supabase.rpc("clock_station_create", {
        _name: input.name,
        _store_id: input.store_id,
        _legal_entity_id: input.legal_entity_id ?? null,
      });
      if (error) throw error;
      return data as unknown as { station_id: string; activation_code: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock_stations"] }),
  });
}

export function useRotateStationCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stationId: string) => {
      const { data, error } = await supabase.rpc("clock_station_rotate_code", { _station_id: stationId });
      if (error) throw error;
      return data as unknown as { station_id: string; activation_code: string };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock_stations"] }),
  });
}

export function useRevokeStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (stationId: string) => {
      const { error } = await supabase.rpc("clock_station_revoke", { _station_id: stationId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock_stations"] }),
  });
}

export function useUpdateStationProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, profile, name }: { id: string; profile: ClockStationProfile; name?: string }) => {
      const patch: Record<string, unknown> = { profile };
      if (name) patch.name = name;
      const { error } = await supabase.from("clock_stations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clock_stations"] }),
  });
}

/** Stämplingar för en period, valfritt filtrerat på enhet. */
export function useTimeEntries(from: string, to: string, storeId?: string | null) {
  return useQuery({
    queryKey: ["time_entries", from, to, storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("time_entries")
        .select("*")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`)
        .order("occurred_at", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TimeEntry[];
    },
  });
}

/** Manuell efterregistrering och korrigering — alltid nya rader. */
export function useCreateTimeEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      store_id: string | null;
      station_id?: string | null;
      work_site_id?: string | null;
      cost_center?: string | null;
      type: TimeEntry["type"];
      occurred_at: string;
      note?: string | null;
      corrects_entry_id?: string | null;
      correction_kind?: "replace" | "void" | null;
    }) => {
      const isCorrection = Boolean(input.corrects_entry_id);
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("time_entries")
        .insert({
          employee_id: input.employee_id,
          store_id: input.store_id,
          station_id: input.station_id ?? null,
          work_site_id: input.work_site_id ?? null,
          cost_center: input.cost_center ?? null,
          type: input.type,
          occurred_at: input.occurred_at,
          source: isCorrection ? "correction" : "manual",
          corrects_entry_id: input.corrects_entry_id ?? null,
          correction_kind: isCorrection ? input.correction_kind ?? "replace" : null,
          created_by: user.user?.id ?? null,
          note: input.note ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as unknown as TimeEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["time_entries"] }),
  });
}

export function usePendingRegistrations(status = "pending") {
  return useQuery({
    queryKey: ["clock_pending_registrations", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clock_pending_registrations")
        .select("*")
        .eq("status", status)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PendingRegistration[];
    },
  });
}

export function useHandlePendingRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      employee_id,
    }: {
      id: string;
      action: "approved" | "rejected";
      employee_id?: string | null;
    }) => {
      if (action === "approved") {
        // RPC:n flyttar klockidentiteten (pnr_hash) till personen så att
        // stämpling fungerar direkt efter godkännande.
        const { error } = await supabase.rpc("clock_pending_approve", {
          _id: id,
          _employee_id: employee_id!,
        });
        if (error) throw error;
        return;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("clock_pending_registrations")
        .update({
          status: action,
          handled_by: user.user?.id ?? null,
          handled_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clock_pending_registrations"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

/** Personalkollens rapporterade tider för parallellkörningsvyn. */
export interface PkDayRow {
  employee_id: string | null;
  day: string;
  start: string | null;
  stop: string | null;
  seconds: number;
}

export function usePkLoggedTimes(from: string, to: string, storeId?: string | null) {
  return useQuery({
    queryKey: ["pk_logged_times_compare", from, to, storeId ?? "all"],
    queryFn: async () => {
      const { data: staff, error: staffErr } = await supabase
        .from("pk_staff")
        .select("url, employee_id");
      if (staffErr) throw staffErr;
      const byUrl = new Map<string, string | null>(
        (staff ?? []).map((s) => [s.url as string, (s.employee_id as string | null) ?? null]),
      );

      const { data, error } = await supabase
        .from("pk_logged_times")
        .select("staff_url, start, stop, real_start, real_stop, work_time_sec, is_canceled")
        .gte("start", `${from}T00:00:00`)
        .lte("start", `${to}T23:59:59`);
      if (error) throw error;

      const rows: PkDayRow[] = [];
      for (const r of data ?? []) {
        if (r.is_canceled) continue;
        const start = (r.real_start ?? r.start) as string | null;
        const stop = (r.real_stop ?? r.stop) as string | null;
        if (!start) continue;
        rows.push({
          employee_id: byUrl.get(r.staff_url as string) ?? null,
          day: start.slice(0, 10),
          start,
          stop,
          seconds: (r.work_time_sec as number | null) ?? 0,
        });
      }
      return rows;
    },
  });
}
