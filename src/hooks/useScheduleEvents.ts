import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ScheduleEvent = {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  event_type: string;
  severity: string;
  portal: string;
  store_id: string | null;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  created_by: string | null;
};

export const EVENT_TYPES = [
  { value: "note", label: "Anteckning", color: "bg-blue-500" },
  { value: "delivery", label: "Specialleverans", color: "bg-purple-500" },
  { value: "vacation", label: "Semester", color: "bg-amber-500" },
  { value: "closed", label: "Stängt", color: "bg-red-500" },
  { value: "holiday", label: "Helgdag", color: "bg-rose-400" },
  { value: "meeting", label: "Möte", color: "bg-cyan-500" },
  { value: "maintenance", label: "Underhåll", color: "bg-orange-500" },
  { value: "inventory", label: "Inventering", color: "bg-emerald-500" },
  { value: "other", label: "Övrigt", color: "bg-gray-500" },
] as const;

export const SEVERITY_LEVELS = [
  { value: "info", label: "Info", color: "bg-blue-500" },
  { value: "low", label: "Låg", color: "bg-emerald-500" },
  { value: "medium", label: "Medium", color: "bg-amber-500" },
  { value: "high", label: "Hög", color: "bg-orange-500" },
  { value: "critical", label: "Kritisk", color: "bg-red-500" },
] as const;

export function useScheduleEvents(portal?: string, year?: number, storeId?: string | null) {
  const queryClient = useQueryClient();
  const currentYear = year || new Date().getFullYear();

  const query = useQuery({
    queryKey: ["schedule_events", portal, currentYear, storeId],
    queryFn: async () => {
      let q = supabase
        .from("schedule_events" as any)
        .select("*")
        .gte("event_date", `${currentYear}-01-01`)
        .lte("event_date", `${currentYear}-12-31`)
        .order("event_date");
      if (portal && portal !== "all") {
        q = q.eq("portal", portal);
      }
      if (storeId) {
        q = q.eq("store_id", storeId);
      } else if (portal !== "shop") {
        q = q.is("store_id", null);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) as ScheduleEvent[];
    },
  });

  const addEvent = useMutation({
    mutationFn: async (event: {
      event_date: string;
      title: string;
      description?: string;
      event_type: string;
      severity: string;
      portal: string;
      store_id?: string | null;
      all_day?: boolean;
      start_time?: string;
      end_time?: string;
      created_by?: string;
    }) => {
      const { error } = await supabase.from("schedule_events" as any).insert(event as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    },
  });

  const updateEvent = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScheduleEvent> & { id: string }) => {
      const { error } = await supabase
        .from("schedule_events" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    },
  });

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("schedule_events" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    },
  });

  return {
    events: query.data || [],
    isLoading: query.isLoading,
    addEvent,
    updateEvent,
    deleteEvent,
  };
}
