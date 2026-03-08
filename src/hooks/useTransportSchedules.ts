import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TransportSchedule = {
  id: string;
  zone_key: string;
  label: string;
  departure_days_before: number;
  departure_time: string;
  badge_color: string;
  created_at: string | null;
  updated_at: string | null;
};

export function useTransportSchedules() {
  return useQuery({
    queryKey: ["transport_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transport_schedules")
        .select("*")
        .order("departure_days_before", { ascending: false });
      if (error) throw error;
      return data as TransportSchedule[];
    },
  });
}

export function useUpdateTransportSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; departure_days_before: number; departure_time: string }) => {
      const { error } = await supabase
        .from("transport_schedules")
        .update({
          departure_days_before: params.departure_days_before,
          departure_time: params.departure_time,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transport_schedules"] }),
  });
}
