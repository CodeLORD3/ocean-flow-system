import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ClockOpsRow {
  store_id: string;
  store_name: string;
  legal_entity_id: string | null;
  clock_active_from: string | null;
  punches: number;
  employees_punched: number;
  warnings: number;
  scheduled_shifts: number;
  tone: "green" | "yellow" | "red" | "pending" | "none";
}

/** Daglig driftbevakning per svensk enhet (default: igår). */
export function useClockOpsDay(day?: string) {
  return useQuery({
    queryKey: ["clock-ops-day", day ?? "yesterday"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("clock_ops_day", day ? { _day: day } : {});
      if (error) throw error;
      return (data ?? []) as unknown as ClockOpsRow[];
    },
  });
}

export interface WrongSystemPunch {
  id: string;
  store_id: string | null;
  legal_entity_id: string | null;
  employee_id: string | null;
  pk_staff_name: string | null;
  work_date: string;
  punch_count: number;
  minutes: number;
}

/** Varningar "stämpling i fel system" i ett datumintervall. */
export function useWrongSystemPunches(from: string, to: string) {
  return useQuery({
    queryKey: ["wrong-system-punches", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wrong_system_punches")
        .select("id, store_id, legal_entity_id, employee_id, pk_staff_name, work_date, punch_count, minutes")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("work_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WrongSystemPunch[];
    },
  });
}
