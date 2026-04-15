import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import { addDays, addWeeks, addMonths, addYears, format, parseISO, isBefore, isAfter } from "date-fns";

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
  recurrence_type: string;
  recurrence_end_date: string | null;
  assigned_to: string | null;
  is_done: boolean;
  meeting_item_id: string | null;
  staff?: { id: string; first_name: string; last_name: string } | null;
};

export type RecurrenceType = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const RECURRENCE_OPTIONS: { value: RecurrenceType; label: string }[] = [
  { value: "none", label: "Ingen upprepning" },
  { value: "daily", label: "Dagligen" },
  { value: "weekly", label: "Veckovis" },
  { value: "monthly", label: "Månadsvis" },
  { value: "yearly", label: "Årligen" },
];

export const EVENT_TYPES = [
  { value: "note", label: "Anteckning", color: "bg-blue-500", hex: "#3B82F6" },
  { value: "meeting", label: "Möte", color: "bg-cyan-500", hex: "#06B6D4" },
  { value: "task", label: "Uppgift", color: "bg-purple-500", hex: "#8B5CF6" },
  { value: "delivery", label: "Specialleverans", color: "bg-indigo-500", hex: "#6366F1" },
  { value: "vacation", label: "Semester", color: "bg-orange-500", hex: "#F97316" },
  { value: "closed", label: "Stängt", color: "bg-red-600", hex: "#DC2626" },
  { value: "holiday", label: "Helgdag", color: "bg-pink-500", hex: "#EC4899" },
  { value: "maintenance", label: "Underhåll", color: "bg-amber-600", hex: "#D97706" },
  { value: "inventory", label: "Inventering", color: "bg-emerald-500", hex: "#10B981" },
  { value: "other", label: "Övrigt", color: "bg-gray-500", hex: "#6B7280" },
] as const;

export const SEVERITY_LEVELS = [
  { value: "info", label: "Info", color: "bg-blue-500" },
  { value: "low", label: "Låg", color: "bg-emerald-500" },
  { value: "medium", label: "Medium", color: "bg-amber-500" },
  { value: "high", label: "Hög", color: "bg-orange-500" },
  { value: "critical", label: "Kritisk", color: "bg-red-500" },
] as const;

function generateRecurrences(event: ScheduleEvent, yearStart: string, yearEnd: string): ScheduleEvent[] {
  if (!event.recurrence_type || event.recurrence_type === "none") return [event];

  const results: ScheduleEvent[] = [];
  const start = parseISO(event.event_date);
  const rangeStart = parseISO(yearStart);
  const rangeEnd = parseISO(yearEnd);
  const recEnd = event.recurrence_end_date ? parseISO(event.recurrence_end_date) : rangeEnd;
  const effectiveEnd = isBefore(recEnd, rangeEnd) ? recEnd : rangeEnd;

  const advanceFn =
    event.recurrence_type === "daily" ? addDays :
    event.recurrence_type === "weekly" ? addWeeks :
    event.recurrence_type === "monthly" ? addMonths :
    addYears;

  let current = start;
  for (let i = 0; i < 400; i++) {
    if (isAfter(current, effectiveEnd)) break;
    if (!isBefore(current, rangeStart)) {
      results.push({
        ...event,
        event_date: format(current, "yyyy-MM-dd"),
        id: i === 0 ? event.id : `${event.id}__rec_${i}`,
      });
    }
    current = advanceFn(current, 1);
  }

  return results;
}

export function useScheduleEvents(portal?: string, year?: number, storeId?: string | null) {
  const queryClient = useQueryClient();
  const currentYear = year || new Date().getFullYear();

  const query = useQuery({
    queryKey: ["schedule_events", portal, currentYear, storeId],
    queryFn: async () => {
      let q = supabase
        .from("schedule_events" as any)
        .select("*, staff:assigned_to(id, first_name, last_name)")
        .order("event_date");

      q = q.lte("event_date", `${currentYear}-12-31`);

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

  const events = useMemo(() => {
    if (!query.data) return [];
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    return query.data.flatMap(e => generateRecurrences(e, yearStart, yearEnd));
  }, [query.data, currentYear]);

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
      recurrence_type?: string;
      recurrence_end_date?: string | null;
      assigned_to?: string | null;
      is_done?: boolean;
      meeting_item_id?: string | null;
    }) => {
      const { data, error } = await supabase.from("schedule_events" as any).insert(event as any).select("*").single();
      if (error) throw error;
      return data;
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
      const realId = id.includes("__rec_") ? id.split("__rec_")[0] : id;
      const { error } = await supabase.from("schedule_events" as any).delete().eq("id", realId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule_events"] });
    },
  });

  return {
    events,
    isLoading: query.isLoading,
    addEvent,
    updateEvent,
    deleteEvent,
  };
}
