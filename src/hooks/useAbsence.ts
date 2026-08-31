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
  extent_pct: number;
  note: string | null;
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
        .select("id, employee_id, absence_type_id, start_date, end_date, extent_pct, note, status, store_id, legal_entity_id, days_count, created_at, decided_at, decision_note")
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
      store_id?: string | null;
      legal_entity_id?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("absence_requests")
        .insert({ ...input, created_by: userData.user?.id ?? null })
        .select("id, employee_id, absence_type_id, start_date, end_date, extent_pct, note, status, store_id, legal_entity_id, days_count, created_at, decided_at, decision_note")
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
