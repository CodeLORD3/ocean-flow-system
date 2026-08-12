import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MONTHLY_HOURS, effectiveHourlyRate } from "@/lib/staffKpi";

export type EmploymentType = "hourly" | "monthly";

export interface SalaryRow {
  id: string;
  staff_id: string;
  employment_type: EmploymentType;
  hourly_rate: number | null;
  monthly_salary: number | null;
  valid_from: string;
  note: string | null;
  created_at: string;
}

const SELECT = "id, staff_id, employment_type, hourly_rate, monthly_salary, valid_from, note, created_at";

/** Lönehistorik för en anställd — nyaste först. */
export function useSalaryHistory(staffId?: string | null) {
  return useQuery({
    queryKey: ["salary-history", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_salary_history")
        .select(SELECT)
        .eq("staff_id", staffId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SalaryRow[];
    },
  });
}

export interface SalaryInput {
  staff_id: string;
  employment_type: EmploymentType;
  hourly_rate: number | null;
  monthly_salary: number | null;
  valid_from: string;
  note?: string | null;
}

/**
 * Sparar en löneändring som en egen historikpost och speglar aktuell lön på
 * personalkortet. Historiska kostnader räknas alltid ur posten som gällde då.
 */
export function useSaveSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalaryInput) => {
      const { error } = await supabase
        .from("staff_salary_history")
        .upsert(
          {
            staff_id: input.staff_id,
            employment_type: input.employment_type,
            hourly_rate: input.hourly_rate,
            monthly_salary: input.monthly_salary,
            valid_from: input.valid_from,
            note: input.note ?? null,
          },
          { onConflict: "staff_id,valid_from" },
        );
      if (error) throw error;

      const { error: staffErr } = await supabase
        .from("staff")
        .update({
          employment_type: input.employment_type,
          hourly_rate: input.hourly_rate,
          monthly_salary: input.monthly_salary,
        } as any)
        .eq("id", input.staff_id);
      if (staffErr) throw staffErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["salary-history", vars.staff_id] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["staff-effective-rates"] });
    },
  });
}

export function useDeleteSalaryRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: { id: string; staff_id: string }) => {
      const { error } = await supabase.from("staff_salary_history").delete().eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["salary-history", vars.staff_id] });
      qc.invalidateQueries({ queryKey: ["staff-effective-rates"] });
    },
  });
}

/**
 * Timlönsekvivalent per anställd för ett datum.
 *
 * Timanställd → timlönen. Månadsanställd → månadslönen slås ut på
 * {@link MONTHLY_HOURS} timmar, så kostnaden blir proportionell mot arbetad tid.
 * Den lönepost som gällde på datumet används, annars personalkortets aktuella
 * lön som reserv.
 */
export function useEffectiveRates(day: string) {
  return useQuery({
    queryKey: ["staff-effective-rates", day],
    enabled: !!day,
    queryFn: async () => {
      const [{ data: staffRows, error: staffErr }, { data: history, error: histErr }] = await Promise.all([
        supabase.from("staff").select("id, hourly_rate, employment_type, monthly_salary"),
        supabase
          .from("staff_salary_history")
          .select(SELECT)
          .lte("valid_from", day)
          .order("valid_from", { ascending: true }),
      ]);
      if (staffErr) throw staffErr;
      if (histErr) throw histErr;

      const latest = new Map<string, SalaryRow>();
      (history ?? []).forEach((r: any) => latest.set(r.staff_id, r as SalaryRow));

      const map = new Map<string, number | null>();
      (staffRows ?? []).forEach((s: any) => {
        const row = latest.get(s.id);
        const type = (row?.employment_type ?? s.employment_type ?? "hourly") as EmploymentType;
        const hourly = row ? row.hourly_rate : s.hourly_rate;
        const monthly = row ? row.monthly_salary : s.monthly_salary;
        map.set(s.id, effectiveHourlyRate(type, hourly, monthly));
      });
      return map;
    },
  });
}
