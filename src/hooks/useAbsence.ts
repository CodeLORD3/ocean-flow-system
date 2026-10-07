import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  is_sick: boolean;
  affects_vacation_balance: boolean;
  requires_approval: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface AbsenceRequest {
  id: string;
  employee_id: string;
  absence_type_id: string;
  start_date: string;
  end_date: string | null;
  date_from?: string | null;
  date_to?: string | null;
  extent_pct: number;
  basis?: string | null;
  note: string | null;
  reason?: string | null;
  status: string;
  store_id: string | null;
  legal_entity_id: string | null;
  days_count: number | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

export interface VacationBalance {
  id: string;
  employee_id: string;
  vacation_year: number;
  entitled_days: number;
  earned_days: number;
  used_days: number;
  saved_days: number;
  manual_adjustment_days: number;
  expiry_flagged: boolean;
  expires_at: string | null;
}

const absenceKeys = {
  all: ["absence"] as const,
  requests: (employeeId?: string, storeId?: string | null) => ["absence", "requests", employeeId ?? "all", storeId ?? "all"] as const,
  balances: (employeeId?: string) => ["absence", "balances", employeeId ?? "all"] as const,
  sick: (employeeId?: string | null) => ["absence", "sick", employeeId ?? "none"] as const,
};

export function useAbsenceTypes() {
  return useQuery({
    queryKey: [...absenceKeys.all, "types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absence_types")
        .select("id, code, name, is_sick, affects_vacation_balance, requires_approval, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as AbsenceType[];
    },
  });
}

export function useAbsenceRequests(employeeId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: absenceKeys.requests(employeeId ?? undefined, storeId),
    queryFn: async () => {
      let query = supabase
        .from("absence_requests")
        .select("id, employee_id, absence_type_id, start_date, end_date, date_from, date_to, extent_pct, basis, note, reason, status, store_id, legal_entity_id, days_count, created_at, decided_at, decision_note")
        .order("start_date", { ascending: false })
        .limit(200);
      if (employeeId) query = query.eq("employee_id", employeeId);
      if (storeId) query = query.eq("store_id", storeId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AbsenceRequest[];
    },
  });
}

export function useVacationBalances(employeeId?: string | null) {
  return useQuery({
    queryKey: absenceKeys.balances(employeeId ?? undefined),
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vacation_balances")
        .select("id, employee_id, vacation_year, entitled_days, earned_days, used_days, saved_days, manual_adjustment_days, expiry_flagged, expires_at")
        .eq("employee_id", employeeId as string)
        .order("vacation_year", { ascending: false });
      if (error) throw error;
      return (data ?? []) as VacationBalance[];
    },
  });
}

export function useCreateAbsenceRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      employee_id: string;
      absence_type_id: string;
      start_date: string;
      end_date?: string | null;
      extent_pct: number;
      note?: string;
      basis?: "enligt_schema" | "halvdag" | "egen";
      store_id?: string | null;
      legal_entity_id?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("absence_requests")
        .insert({ ...input, created_by: userData.user?.id ?? null })
        .select("id, employee_id, absence_type_id, start_date, end_date, date_from, date_to, extent_pct, basis, note, reason, status, store_id, legal_entity_id, days_count, created_at, decided_at, decision_note")
        .single();
      if (error) throw error;
      return data as AbsenceRequest;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: absenceKeys.all });
    },
  });
}

export function useDecideAbsenceRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requestId: string; decision: "approved" | "rejected"; note?: string; conflictAction?: "none" | "open_shift" | "cancel_shift" }) => {
      const { data, error } = await supabase.rpc("decide_absence_request", {
        _request_id: input.requestId,
        _decision: input.decision,
        _decision_note: input.note ?? null,
        _conflict_action: input.conflictAction ?? "none",
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: absenceKeys.all });
      client.invalidateQueries({ queryKey: ["shifts"] });
      client.invalidateQueries({ queryKey: ["attestations"] });
    },
  });
}

export function useAbsenceConflicts(requestId?: string | null) {
  return useQuery({
    queryKey: [...absenceKeys.all, "conflicts", requestId ?? "none"],
    enabled: Boolean(requestId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("absence_conflicts", { _request_id: requestId as string });
      if (error) throw error;
      return (data ?? []) as { shift_id: string; shift_date: string; start_time: string; end_time: string; store_id: string; status: string }[];
    },
  });
}

export interface SickPeriod {
  id: string;
  employee_id: string;
  first_day: string;
  last_day: string | null;
  karens_applied: boolean;
  created_at: string;
}

export function useActiveSickPeriod(employeeId?: string | null) {
  return useQuery({
    queryKey: absenceKeys.sick(employeeId),
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sick_periods")
        .select("id, employee_id, first_day, last_day, karens_applied, created_at")
        .eq("employee_id", employeeId as string)
        .is("last_day", null)
        .order("first_day", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as SickPeriod | null;
    },
  });
}

export function useRegisterSickDay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; date: string }) => {
      const { data, error } = await supabase.rpc("register_sick_period", {
        _employee_id: input.employeeId,
        _first_day: input.date,
        _last_day: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: absenceKeys.all }),
  });
}

export function useUndoSickPeriod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; firstDay: string }) => {
      const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
      const { data, error } = await rpc("undo_sick_period", { _employee_id: input.employeeId, _first_day: input.firstDay });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: absenceKeys.all }),
  });
}

export function useEndSickPeriod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; lastDay?: string | null }) => {
      const rpc = supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
      const { data, error } = await rpc("end_sick_period", { _employee_id: input.employeeId, _last_day: input.lastDay ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: absenceKeys.all }),
  });
}

const REQUEST_COLS =
  "id, employee_id, absence_type_id, start_date, end_date, date_from, date_to, extent_pct, basis, note, reason, status, store_id, legal_entity_id, days_count, created_at, decided_at, decision_note";

/** All frånvaro som överlappar perioden — ingen radgräns som kan tappa poster. */
export function useAbsenceRequestsInRange(from: string, to: string) {
  return useQuery({
    queryKey: [...absenceKeys.all, "range", from, to],
    enabled: Boolean(from && to),
    queryFn: async () => {
      const rows: AbsenceRequest[] = [];
      for (let page = 0; page < 50; page++) {
        const { data, error } = await supabase
          .from("absence_requests")
          .select(REQUEST_COLS)
          .lte("start_date", to)
          .or(`end_date.gte.${from},end_date.is.null`)
          .order("start_date")
          .range(page * 1000, page * 1000 + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as AbsenceRequest[]));
        if (!data || data.length < 1000) break;
      }
      return rows;
    },
  });
}

/** Alla väntande ansökningar (sidokön), oberoende av vald vecka. */
export function usePendingAbsenceRequests() {
  return useQuery({
    queryKey: [...absenceKeys.all, "pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("absence_requests")
        .select(REQUEST_COLS)
        .eq("status", "pending")
        .order("start_date");
      if (error) throw error;
      return (data ?? []) as AbsenceRequest[];
    },
  });
}

type RpcFn = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
const callRpc = (name: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as RpcFn)(name, args).then(({ data, error }) => {
    if (error) throw error;
    return data as Record<string, unknown>;
  });

function useAdminAbsenceMutation<T>(fn: (input: T) => Promise<Record<string, unknown>>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: absenceKeys.all });
      client.invalidateQueries({ queryKey: ["shifts"] });
      client.invalidateQueries({ queryKey: ["attestations"] });
    },
  });
}

/** Adminnivå: registrera frånvaro åt en anställd, godkänd direkt. */
export const useAdminRegisterAbsence = () =>
  useAdminAbsenceMutation(
    (i: {
      employeeId: string;
      typeId: string;
      startDate: string;
      endDate: string | null;
      extentPct: number;
      note?: string;
      conflictAction: "keep" | "open_shift" | "cancel_shift";
    }) =>
      callRpc("admin_register_absence", {
        _employee_id: i.employeeId,
        _absence_type_id: i.typeId,
        _start_date: i.startDate,
        _end_date: i.endDate,
        _extent_pct: i.extentPct,
        _note: i.note ?? null,
        _conflict_action: i.conflictAction,
      }),
  );

export const useAdminUpdateAbsence = () =>
  useAdminAbsenceMutation((i: { id: string; startDate: string; endDate: string | null; extentPct: number; note?: string }) =>
    callRpc("admin_update_absence", {
      _request_id: i.id,
      _start_date: i.startDate,
      _end_date: i.endDate,
      _extent_pct: i.extentPct,
      _note: i.note ?? null,
    }),
  );

export const useAdminCancelAbsence = () =>
  useAdminAbsenceMutation((i: { id: string; reason?: string }) =>
    callRpc("admin_cancel_absence", { _request_id: i.id, _reason: i.reason ?? null }),
  );

export const useAdminEndSickAbsence = () =>
  useAdminAbsenceMutation((i: { id: string; lastDay?: string | null }) =>
    callRpc("admin_end_sick_absence", { _request_id: i.id, _last_day: i.lastDay ?? null }),
  );
