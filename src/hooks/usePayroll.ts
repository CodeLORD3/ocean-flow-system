import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Löneunderlag (etapp 5).
 *
 * Makrilltrade är master för enheter — timmar, OB-timmar, dagar och omfattning.
 * Kronor i payroll_lines.preliminary_cost är enbart preliminära KPI-värden;
 * Fortnox Lön avgör bruttolön, skatt och utbetalning.
 */

export interface PayrollPeriod {
  id: string;
  legal_entity_id: string;
  period: string;
  status: "open" | "computed" | "reviewed" | "exported" | "reexported";
  computed_at: string | null;
  reviewed_at: string | null;
  exported_at: string | null;
  fortnox_batch_ref: string | null;
  correction_reason: string | null;
}

export interface PayrollLine {
  id: string;
  period_id: string;
  legal_entity_id: string;
  store_id: string | null;
  employee_id: string;
  employment_id: string | null;
  line_type: string;
  line_date: string;
  quantity: number;
  extent_pct: number | null;
  unit_amount: number | null;
  cost_center: string | null;
  source_ref: string | null;
  source_type: string | null;
  note: string | null;
  preliminary_cost: number | null;
  fortnox_transaction_id: string | null;
  export_status: "pending" | "sent" | "error" | "corrected";
}

export interface ComputeIssue {
  kind: string;
  detail: string;
  employee_id?: string;
}

export const ISSUE_LABEL: Record<string, string> = {
  missing_wage_code: "Löneart saknas i mappningen",
  missing_fortnox_employee_id: "Fortnox-anställningsnummer saknas",
  date_outside_employment: "Datum utanför anställningstiden",
  wellness_over_limit: "Friskvård över skattefri gräns",
};

export const PERIOD_STATUS_LABEL: Record<PayrollPeriod["status"], string> = {
  open: "Öppen",
  computed: "Beräknad",
  reviewed: "Granskad",
  exported: "Exporterad",
  reexported: "Omexporterad",
};

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function usePayrollPeriods(legalEntityId: string | null) {
  return useQuery({
    queryKey: ["payroll-periods", legalEntityId],
    enabled: !!legalEntityId,
    queryFn: async () => {
      const id = legalEntityId;
      if (!id) return [] as PayrollPeriod[];
      const { data, error } = await supabase
        .from("payroll_periods")
        .select("*")
        .eq("legal_entity_id", id)
        .order("period", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollPeriod[];
    },
  });
}

export function usePayrollLines(periodId: string | null) {
  return useQuery({
    queryKey: ["payroll-lines", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const id = periodId;
      if (!id) return [] as PayrollLine[];
      const { data, error } = await supabase
        .from("payroll_lines")
        .select("*")
        .eq("period_id", id)
        .order("line_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollLine[];
    },
  });
}

export function useComputePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ legalEntityId, period, force }: { legalEntityId: string; period: string; force?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("payroll-compute", {
        body: { legal_entity_id: legalEntityId, period, force: force ?? false },
      });
      if (error) throw error;
      const result = data as { error?: string; issues?: ComputeIssue[]; lines?: number; period_id?: string; unlocked_stores?: string[]; status?: string };
      if (result?.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      qc.invalidateQueries({ queryKey: ["payroll-lines"] });
    },
  });
}

export function useSetPeriodStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: PayrollPeriod["status"]; reason?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const patch: Record<string, unknown> = { status };
      if (status === "reviewed") patch.reviewed_at = new Date().toISOString();
      if (status === "open" && reason) {
        patch.correction_reason = reason;
        patch.exported_by = auth.user?.id ?? null;
      }
      const { error } = await supabase.from("payroll_periods").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payroll-periods"] }),
  });
}

export function usePayrollPolicies(legalEntityId: string | null) {
  return useQuery({
    queryKey: ["payroll-policies", legalEntityId],
    enabled: !!legalEntityId,
    queryFn: async () => {
      const id = legalEntityId;
      if (!id) return [];
      const { data, error } = await supabase
        .from("payroll_policies")
        .select("*")
        .eq("legal_entity_id", id)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWageCodeMap(legalEntityId: string | null) {
  return useQuery({
    queryKey: ["fortnox-wage-code-map", legalEntityId],
    enabled: !!legalEntityId,
    queryFn: async () => {
      const id = legalEntityId;
      if (!id) return [];
      const { data, error } = await supabase
        .from("fortnox_wage_code_map")
        .select("*")
        .eq("legal_entity_id", id)
        .order("line_type", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface PayrollExportLogRow {
  id: string;
  transaction_type: string;
  status: string;
  http_status: number | null;
  error_message: string | null;
  created_at: string;
}

export function usePayrollExportLog(periodId: string | null) {
  return useQuery({
    queryKey: ["payroll-export-log", periodId],
    enabled: !!periodId,
    queryFn: async () => {
      const id = periodId;
      if (!id) return [] as PayrollExportLogRow[];
      const { data, error } = await supabase
        .from("payroll_export_log")
        .select("id, transaction_type, status, http_status, error_message, created_at")
        .eq("payroll_period_id", id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PayrollExportLogRow[];
    },
  });
}

export interface PayrollExportResult {
  mode: "fortnox" | "paxml";
  sent?: number;
  skipped?: number;
  remaining?: number;
  failures?: { line_id: string; message: string }[];
  issues?: ComputeIssue[];
  lines?: number;
  xml?: string;
  status?: string;
  error?: string;
}

/**
 * Export av löneunderlaget. mode "fortnox" postar enheter till Fortnox Lön,
 * mode "paxml" hämtar PAXml 2.2 utan att röra Fortnox.
 */
export function useExportPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ legalEntityId, period, mode }: { legalEntityId: string; period: string; mode: "fortnox" | "paxml" }) => {
      const { data, error } = await supabase.functions.invoke("fortnox-payroll-export", {
        body: { legal_entity_id: legalEntityId, period, mode },
      });
      if (error) throw error;
      const result = data as PayrollExportResult;
      if (result?.error) {
        const err = new Error(result.error) as Error & { issues?: ComputeIssue[] };
        err.issues = result.issues;
        throw err;
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-periods"] });
      qc.invalidateQueries({ queryKey: ["payroll-lines"] });
      qc.invalidateQueries({ queryKey: ["payroll-export-log"] });
    },
  });
}
