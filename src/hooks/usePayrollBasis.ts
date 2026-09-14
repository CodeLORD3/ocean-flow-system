import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PayrollBasisRow {
  employee_id: string;
  employment_id: string;
  full_name: string;
  employment_number: string | null;
  pay_type: string | null;
  form: string | null;
  store_name: string | null;
  period_start: string;
  period_end: string;
  worked_hours: number;
  ob50_hours: number;
  ob70_hours: number;
  ob100_hours: number;
  mertid_hours: number;
  overtime_hours: number;
  absence_days: number;
  absence_hours: number;
  unattested_days: number;
}

/** Löneunderlag per period (16:e–15:e) för ett bolag. */
export function usePayrollBasis(legalEntityId: string | null, period: string | null) {
  return useQuery({
    queryKey: ["payroll-basis", legalEntityId, period],
    enabled: !!legalEntityId && !!period,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("payroll_basis_period", {
        _legal_entity_id: legalEntityId as string,
        _period: period as string,
      });
      if (error) throw error;
      return (data ?? []) as unknown as PayrollBasisRow[];
    },
  });
}
