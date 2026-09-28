import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreTarget = {
  id?: number;
  store_id: string;
  iso_year: number;
  iso_week: number;
  target_sales_ex_vat: number | null;
  target_staff_cost_pct: number | null;
  source?: string | null;
};

const db = supabase as unknown as { from: (t: string) => any };

/** ISO-år och vecka för ett datum (YYYY-MM-DD eller Date). */
export function isoWeekOf(d: Date): { iso_year: number; iso_week: number } {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { iso_year: t.getUTCFullYear(), iso_week: Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7) };
}

/** Måndag i en ISO-vecka. */
export function isoWeekMonday(iso_year: number, iso_week: number): Date {
  const jan4 = new Date(Date.UTC(iso_year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const mon = new Date(jan4);
  mon.setUTCDate(jan4.getUTCDate() - day + 1 + (iso_week - 1) * 7);
  return new Date(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate());
}

export function shiftWeek(y: number, w: number, delta: number) {
  const m = isoWeekMonday(y, w);
  m.setDate(m.getDate() + delta * 7);
  return isoWeekOf(m);
}

export function useStoreTargets() {
  return useQuery({
    queryKey: ["store-targets"],
    queryFn: async () => {
      const { data, error } = await db.from("store_targets").select("*").order("iso_year").order("iso_week");
      if (error) throw error;
      return (data ?? []) as StoreTarget[];
    },
  });
}

export function useSaveStoreTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: StoreTarget[]) => {
      const { error } = await db.from("store_targets").upsert(
        rows.map(({ id: _id, ...r }) => r),
        { onConflict: "store_id,iso_year,iso_week" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-targets"] }),
  });
}

export const targetKey = (storeId: string, y: number, w: number) => `${storeId}|${y}|${w}`;
