import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Dagens framsteg för mig: hur många av mina uppgifter idag som är klara. */
export type MyDayProgress = { total: number; done: number; left: number; percent: number };

export function useMyDayProgress(staffId: string | undefined) {
  return useQuery({
    queryKey: ["my-day-progress", staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<MyDayProgress> => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("checklist_items")
        .select("id, done, checklist_days!inner(checklist_date)")
        .eq("assigned_staff_id", staffId!)
        .eq("checklist_days.checklist_date", today)
        .limit(500);
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.length;
      const done = rows.filter((r: any) => r.done).length;
      return {
        total,
        done,
        left: total - done,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
      };
    },
    staleTime: 30_000,
  });
}
