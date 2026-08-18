import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PkConnection {
  id: string;
  label: string;
  secret_name: string;
  legal_entity_id: string | null;
  is_active: boolean;
}

export interface PkSyncState {
  connection_id: string;
  resource: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  records_upserted: number | null;
  sync_cursor: string | null;
}

export interface PkSyncLogRow {
  id: string;
  connection_id: string;
  resource: string;
  pages: number | null;
  upserts: number | null;
  status: string;
  error: string | null;
  created_at: string;
}

export interface PkCostgroup {
  id: string;
  connection_id: string;
  url: string;
  short_identifier: number | null;
  name: string | null;
  workplace_url: string | null;
  store_id: string | null;
  store_id_manual: boolean;
  is_company_group: boolean;
  /** säker | osäker | ingen träff | manuell | bolagsgrupp */
  match_confidence: string | null;
  synced_at: string | null;
}

export interface PkWorkplace {
  id: string;
  connection_id: string;
  url: string;
  name: string | null;
  store_id: string | null;
  store_id_manual: boolean;
  is_missing_since: string | null;
}

export interface PkStaffRow {
  id: string;
  connection_id: string;
  url: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile_phone: string | null;
  employment_number: string | null;
  pnr_masked: string | null;
  group_name: string | null;
  default_cost_group: string | null;
  employee_id: string | null;
  employee_id_manual: boolean;
  is_active_employment: boolean | null;
}

export interface PkClockedInRow {
  connection_id: string;
  store_id: string | null;
  store_name: string | null;
  workplace_name: string | null;
  costgroup_name: string | null;
  staff_url: string | null;
  display_name: string | null;
  is_guest: boolean | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  estimated_cost: number | null;
  clocked_in_at: string | null;
  clocked_out_at: string | null;
  status: string | null;
  ongoing_seconds: number | null;
}

export function usePkConnections() {
  return useQuery({
    queryKey: ["pk-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_connections")
        .select("id, label, secret_name, legal_entity_id, is_active")
        .order("label");
      if (error) throw error;
      return (data ?? []) as PkConnection[];
    },
  });
}

export function usePkSyncState() {
  return useQuery({
    queryKey: ["pk-sync-state"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_sync_state")
        .select("connection_id, resource, last_run_at, last_status, last_error, records_upserted, sync_cursor");
      if (error) throw error;
      return (data ?? []) as PkSyncState[];
    },
    refetchInterval: 60_000,
  });
}

export function usePkSyncLog(limit = 40) {
  return useQuery({
    queryKey: ["pk-sync-log", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_sync_log")
        .select("id, connection_id, resource, pages, upserts, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PkSyncLogRow[];
    },
    refetchInterval: 60_000,
  });
}

export function usePkCostgroups() {
  return useQuery({
    queryKey: ["pk-costgroups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_costgroups")
        .select(
          "id, connection_id, url, short_identifier, name, workplace_url, store_id, store_id_manual, is_company_group, match_confidence, synced_at",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as PkCostgroup[];
    },
  });
}

export function usePkWorkplaces() {
  return useQuery({
    queryKey: ["pk-workplaces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_workplaces")
        .select("id, connection_id, url, name, store_id, store_id_manual, is_missing_since")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PkWorkplace[];
    },
  });
}

export function usePkStaff() {
  return useQuery({
    queryKey: ["pk-staff"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pk_staff")
        .select(
          "id, connection_id, url, first_name, last_name, email, mobile_phone, employment_number, pnr_masked, group_name, default_cost_group, employee_id, employee_id_manual, is_active_employment",
        )
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as PkStaffRow[];
    },
  });
}

/** Vem som står instämplad just nu, direkt ur Personalkollens stämplingar. */
export function usePkClockedInNow() {
  return useQuery({
    queryKey: ["pk-clocked-in-now"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pk_clocked_in_now")
        .select("*")
        .order("clocked_in_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PkClockedInRow[];
    },
    refetchInterval: 60_000,
  });
}

/** Personalkostnad per butik och dag ur Personalkollens pass och stämplingar. */
export function usePkDailyLaborCost(storeId: string | null, date: string) {
  return useQuery({
    queryKey: ["pk-daily-labor-cost", storeId ?? "all", date],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pk_daily_labor_cost", {
        _store_id: storeId,
        _date: date,
      });
      if (error) throw error;
      return (data ?? []) as {
        store_id: string | null;
        day: string;
        variable_cost: number | null;
        fixed_cost: number | null;
        actual_cost: number | null;
        scheduled_cost: number | null;
        work_time_sec: number | null;
      }[];
    },
  });
}

/** Manuell mappning: kostnadsgrupp eller arbetsplats → butik. */
export function usePkSetMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { table: "pk_costgroups" | "pk_workplaces"; id: string; storeId: string | null }) => {
      const { error } = await supabase
        .from(p.table)
        .update({ store_id: p.storeId, store_id_manual: true })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pk-costgroups"] });
      qc.invalidateQueries({ queryKey: ["pk-workplaces"] });
      qc.invalidateQueries({ queryKey: ["pk-clocked-in-now"] });
    },
  });
}

/**
 * Manuellt tillagt kostnadsställe.
 *
 * Personalkollens /costgroups/-endpoint är stängd för våra API-nycklar, så nya
 * grupper upptäcks först när de förekommer i pass eller stämplingar. Här kan en
 * grupp läggas in i förväg med sitt id, så att första stämplingen hamnar rätt.
 */
export function usePkAddCostgroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      connectionId: string;
      shortIdentifier: number;
      name: string;
      workplaceUrl: string | null;
      storeId: string | null;
    }) => {
      const { error } = await supabase.from("pk_costgroups").insert({
        connection_id: p.connectionId,
        url: `https://personalkollen.se/api/costgroups/${p.shortIdentifier}/`,
        short_identifier: p.shortIdentifier,
        name: p.name,
        workplace_url: p.workplaceUrl,
        store_id: p.storeId,
        store_id_manual: !!p.storeId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pk-costgroups"] });
      qc.invalidateQueries({ queryKey: ["pk-clocked-in-now"] });
    },
  });
}

/** Manuell koppling: Personalkollen-person → personalkort i Makrilltrade. */
export function usePkSetStaffLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; employeeId: string | null }) => {
      const { error } = await supabase
        .from("pk_staff")
        .update({ employee_id: p.employeeId, employee_id_manual: true })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pk-staff"] }),
  });
}

/** Kör synken direkt, för felsökning och första inläsning. */
export function usePkRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { resource?: string; full?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("personalkollen-sync", { body: p });
      if (error) throw error;
      return data as { ok: boolean; results: any[]; warnings: string[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pk-sync-state"] });
      qc.invalidateQueries({ queryKey: ["pk-sync-log"] });
      qc.invalidateQueries({ queryKey: ["pk-costgroups"] });
      qc.invalidateQueries({ queryKey: ["pk-staff"] });
      qc.invalidateQueries({ queryKey: ["pk-clocked-in-now"] });
    },
  });
}

export function pkHours(sec?: number | null): string {
  const s = Math.max(0, sec ?? 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
