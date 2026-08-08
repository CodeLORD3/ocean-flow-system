import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Systeminställningar som nyckel/värde. Används i dag för larmgränsen på
 * oregistrerade plocklistor: fyra timmar passar en morgonleverans men blir fel
 * om plocklistan skrivs ut på eftermiddagen inför nästa dag.
 */

export const DEFAULT_PICKLIST_ALARM_HOURS = 4;

export function useSystemSetting(key: string) {
  return useQuery({
    queryKey: ["system_settings", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.value ?? null) as any;
    },
  });
}

export function usePicklistAlarmHours() {
  const q = useSystemSetting("picklist_alarm");
  const hours = Number(q.data?.hours);
  return {
    ...q,
    hours: Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_PICKLIST_ALARM_HOURS,
  };
}

export function useSetPicklistAlarmHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (hours: number) => {
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error("Larmgränsen måste vara fler än noll timmar.");
      }
      const { error } = await supabase
        .from("system_settings" as any)
        .upsert({ key: "picklist_alarm", value: { hours } } as any, { onConflict: "key" });
      if (error) throw new Error(error.message);
      return hours;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system_settings", "picklist_alarm"] });
    },
  });
}
