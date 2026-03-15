import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ManualScheduleEntry = {
  id: string;
  product_id: string;
  quantity: number;
  departure_date: string;
  departure_time: string;
  schedule_type: string;
  notes: string | null;
  created_at: string;
  products?: { name: string; unit: string; category: string } | null;
};

export function useManualScheduleEntries(scheduleType: "purchase" | "production") {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["manual_schedule_entries", scheduleType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_schedule_entries")
        .select("*, products(name, unit, category)")
        .eq("schedule_type", scheduleType)
        .order("departure_date");
      if (error) throw error;
      return data as ManualScheduleEntry[];
    },
  });

  const addEntry = useMutation({
    mutationFn: async (entry: {
      product_id: string;
      quantity: number;
      departure_date: string;
      departure_time: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("manual_schedule_entries").insert({
        ...entry,
        schedule_type: scheduleType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual_schedule_entries", scheduleType] });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_schedule_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manual_schedule_entries", scheduleType] });
    },
  });

  return { entries: query.data || [], isLoading: query.isLoading, addEntry, deleteEntry };
}
