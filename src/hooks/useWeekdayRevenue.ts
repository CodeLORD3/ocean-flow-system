import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Snittförsäljning per veckodag och försäljningsställe.
 *
 * Underlaget är historiskt: kassan (pos_transactions) först, annars butikens
 * dagsrapport (net_sales). Snittet räknas per veckodag över de senaste
 * `weeksBack` veckorna före den valda veckan, så en måndag jämförs med
 * tidigare måndagar. Saknas historik returneras null i stället för en gissning.
 */
export interface WeekdayRevenue {
  /** Index 0 = måndag … 6 = söndag. */
  average: (number | null)[];
  /** Antal dagar med underlag per veckodag. */
  samples: number[];
}

const EMPTY: WeekdayRevenue = { average: Array(7).fill(null), samples: Array(7).fill(0) };

function mondayIndex(day: string): number {
  const d = new Date(`${day}T12:00:00`);
  return (d.getDay() + 6) % 7;
}

export function useWeekdayRevenue(
  storeId: string | null,
  weekStart: string,
  weeksBack = 8,
): { data: WeekdayRevenue; isLoading: boolean } {
  const from = useMemo(() => {
    if (!weekStart) return "";
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() - weeksBack * 7);
    return d.toISOString().slice(0, 10);
  }, [weekStart, weeksBack]);

  const to = useMemo(() => {
    if (!weekStart) return "";
    const d = new Date(`${weekStart}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [weekStart]);

  const query = useQuery({
    queryKey: ["weekday-revenue", storeId, from, to],
    enabled: !!storeId && !!from && !!to,
    queryFn: async (): Promise<WeekdayRevenue> => {
      const perDay = new Map<string, number>();

      const { data: pos, error: posErr } = await supabase
        .from("pos_transactions")
        .select("total_ore, status, occurred_at")
        .eq("store_id", storeId!)
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`);
      if (posErr) throw posErr;

      (pos ?? []).forEach((t: any) => {
        if (!t.occurred_at) return;
        if (t.status && String(t.status).toLowerCase().includes("revers")) return;
        const day = String(t.occurred_at).slice(0, 10);
        perDay.set(day, (perDay.get(day) ?? 0) + Number(t.total_ore ?? 0) / 100);
      });

      const { data: daily, error: dailyErr } = await supabase
        .from("daily_reports")
        .select("report_date, gross_sales, net_sales")
        .eq("store_id", storeId!)
        .gte("report_date", from)
        .lte("report_date", to);
      if (dailyErr) throw dailyErr;

      (daily ?? []).forEach((r: any) => {
        const day = String(r.report_date ?? "").slice(0, 10);
        if (!day || perDay.has(day)) return;
        const amount = Number(r.net_sales ?? 0) || Number(r.gross_sales ?? 0);
        if (amount > 0) perDay.set(day, amount);
      });

      const sums = Array(7).fill(0) as number[];
      const counts = Array(7).fill(0) as number[];
      perDay.forEach((amount, day) => {
        if (amount <= 0) return;
        const idx = mondayIndex(day);
        sums[idx] += amount;
        counts[idx] += 1;
      });

      return {
        average: sums.map((sum, i) => (counts[i] ? sum / counts[i] : null)),
        samples: counts,
      };
    },
  });

  return { data: query.data ?? EMPTY, isLoading: query.isLoading };
}
