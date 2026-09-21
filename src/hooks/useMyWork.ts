import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** En sak jag ska göra — hämtas från uppgifterna, ingen ny datakälla skapas. */
export type MyWorkItem = {
  id: string;
  task: string;
  date: string;
  storeId: string | null;
  time: string | null;
  minutes: number | null;
  late: boolean;
  today: boolean;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Uppgifter som är tilldelade mig och inte klara: försenade, idag och kommande.
 * Läser befintliga checklist_items via dagens checklista — inget nytt lagras.
 */
export function useMyWork(staffId: string | undefined, days = 14) {
  return useQuery({
    queryKey: ["my-work", staffId, days],
    enabled: !!staffId,
    queryFn: async (): Promise<MyWorkItem[]> => {
      const today = iso(new Date());
      const from = iso(new Date(Date.now() - 14 * 86400000));
      const to = iso(new Date(Date.now() + days * 86400000));
      const { data, error } = await supabase
        .from("checklist_items")
        .select(
          "id, task, done, specific_time, time_from, daypart, estimated_minutes, checklist_days!inner(checklist_date, store_id)",
        )
        .eq("assigned_staff_id", staffId!)
        .eq("done", false)
        .gte("checklist_days.checklist_date", from)
        .lte("checklist_days.checklist_date", to)
        .limit(200);
      if (error) throw error;
      return (data ?? [])
        .map((r: any) => {
          const date: string = r.checklist_days?.checklist_date ?? today;
          return {
            id: r.id as string,
            task: (r.task as string) ?? "",
            date,
            storeId: (r.checklist_days?.store_id as string) ?? null,
            time: (r.specific_time || r.time_from || r.daypart || null) as string | null,
            minutes: (r.estimated_minutes as number) ?? null,
            late: date < today,
            today: date === today,
          };
        })
        .sort((a, b) => (a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date)));
    },
    staleTime: 30_000,
  });
}
