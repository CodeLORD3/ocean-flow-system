import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Uppgiftskalender: sammanställning per datum av samma checklist_items som
 * uppgiftsvyn använder. Egen kalender för uppgifter — separat från
 * personalkalendern.
 */
export type TaskDaySummary = {
  date: string;
  total: number;
  done: number;
  zoneIds: string[];
  /** Namnen på de första uppgifterna, för förhandsvisning i rutan. */
  preview: { task: string; done: boolean; zoneId: string | null }[];
};

export function useTaskCalendar(storeId?: string | null, from?: string, to?: string) {
  return useQuery({
    queryKey: ["task-calendar", storeId, from, to],
    queryFn: async () => {
      const { data: days, error: dErr } = await supabase
        .from("checklist_days")
        .select("id, checklist_date")
        .eq("store_id", storeId!)
        .gte("checklist_date", from!)
        .lte("checklist_date", to!);
      if (dErr) throw dErr;

      const dateOf = new Map<string, string>();
      (days || []).forEach((d: any) => dateOf.set(d.id, d.checklist_date));
      const ids = [...dateOf.keys()];

      const byDate = new Map<string, TaskDaySummary>();
      const ensure = (date: string) => {
        let row = byDate.get(date);
        if (!row) {
          row = { date, total: 0, done: 0, zoneIds: [], preview: [] };
          byDate.set(date, row);
        }
        return row;
      };
      dateOf.forEach((date) => ensure(date));

      if (ids.length > 0) {
        const { data, error } = await supabase
          .from("checklist_items")
          .select("day_id, task, done, zone_id, sort_order")
          .in("day_id", ids)
          .order("sort_order");
        if (error) throw error;
        (data || []).forEach((i: any) => {
          const date = dateOf.get(i.day_id);
          if (!date) return;
          const row = ensure(date);
          row.total += 1;
          if (i.done) row.done += 1;
          if (i.zone_id && !row.zoneIds.includes(i.zone_id)) row.zoneIds.push(i.zone_id);
          if (row.preview.length < 4) row.preview.push({ task: i.task, done: i.done, zoneId: i.zone_id });
        });
      }

      return byDate;
    },
    enabled: !!storeId && !!from && !!to,
  });
}
