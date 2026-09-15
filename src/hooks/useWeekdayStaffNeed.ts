import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Personalbehov per veckodag och försäljningsställe.
 *
 * En enda logik för alla dagar: omsättningen sätter ramen. Snittförsäljningen
 * för veckodagen gånger taket för personalkostnad ger en lönebudget i kronor,
 * som delas med kostnaden per arbetad timme. Resultatet är behovet i TIMMAR —
 * samma enhet som personalkostnadsraden i planeraren. Historiken (faktiskt
 * arbetade timmar samma veckodag) får bara justera ramen inom ±25 %, så den
 * nyanserar men aldrig styr. Personer visas som omräkning via den historiska
 * snittlängden på ett pass, annars 8 timmar.
 *
 * Saknas försäljningsunderlag eller timkostnad returneras inget behov — ingen
 * gissning.
 */

/** Hur mycket historiken får dra ramen, uppåt eller nedåt. */
const HISTORY_CLAMP = 0.25;
/** Passlängd när historik saknas. */
const DEFAULT_SHIFT_HOURS = 8;

export type StaffNeedSource = "omsättning" | "omsättning+historik" | "utan utrymme" | "saknas";

/** Satserna som gör om försäljning till lönebudget. */
export interface NeedMargins {
  vatPct: number;
  grossMarginPct: number;
  otherCostPct: number;
  profitTargetPct: number;
}

/**
 * Lönebudgeten för en dag: moms bort, varukostnad bort via
 * bruttovinstmarginalen, övriga kostnader och vinstkrav bort. Det som blir kvar
 * får gå till löner.
 */
export function laborBudget(revenue: number, m: NeedMargins): { net: number; gross: number; budget: number } {
  const net = revenue / (1 + m.vatPct / 100);
  const gross = net * (m.grossMarginPct / 100);
  const budget = gross - net * ((m.otherCostPct + m.profitTargetPct) / 100);
  return { net, gross, budget };
}

export interface WeekdayNeedDay {
  /** Behov i timmar, en decimal. Null när underlag saknas. */
  hours: number | null;
  /** Behov omräknat till personer (avrundat, minst 1 när timmar finns). */
  people: number | null;
  source: StaffNeedSource;
  /** Antal dagar med försäljningsunderlag för veckodagen. */
  samples: number;
  /** Snittlängd på ett pass som använts vid omräkningen. */
  avgShiftHours: number;
  /** Lönebudget i kronor som behovet bygger på. */
  budget: number | null;
  /** Nettoförsäljning (moms borträknad). */
  net: number | null;
  /** Bruttovinst i kronor. */
  gross: number | null;
}

/** Historiskt arbetsunderlag per veckodag. Index 0 = måndag … 6 = söndag. */
export interface WeekdayWorkHistory {
  /** Snitt arbetade timmar per dag för veckodagen. Null när underlag saknas. */
  hoursPerDay: (number | null)[];
  /** Snittlängd på ett pass för veckodagen. Null när underlag saknas. */
  avgShiftHours: (number | null)[];
  /** Antal dagar med underlag per veckodag. */
  samples: number[];
}

const EMPTY_HISTORY: WeekdayWorkHistory = {
  hoursPerDay: Array(7).fill(null),
  avgShiftHours: Array(7).fill(null),
  samples: Array(7).fill(0),
};

export const EMPTY_NEED: WeekdayNeedDay[] = Array.from({ length: 7 }, () => ({
  hours: null,
  people: null,
  source: "saknas" as StaffNeedSource,
  samples: 0,
  avgShiftHours: DEFAULT_SHIFT_HOURS,
  budget: null,
  net: null,
  gross: null,
}));

function mondayIndex(day: string): number {
  const d = new Date(`${day}T12:00:00`);
  return (d.getDay() + 6) % 7;
}

/**
 * Faktiskt arbetade timmar per veckodag ur stämplingsjournalen. In- och
 * ut-stämplingar paras per person och arbetsdag; en öppen instämpling utan
 * utstämpling hoppas över så den inte drar snittet.
 */
export function useWeekdayWorkHistory(
  storeId: string | null,
  weekStart: string,
  weeksBack = 8,
): { data: WeekdayWorkHistory; isLoading: boolean } {
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
    queryKey: ["weekday-work-history", storeId, from, to],
    enabled: !!storeId && !!from && !!to,
    queryFn: async (): Promise<WeekdayWorkHistory> => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("employee_id, arbetsdag, type, occurred_at")
        .eq("store_id", storeId!)
        .gte("arbetsdag", from)
        .lte("arbetsdag", to)
        .order("occurred_at", { ascending: true });
      if (error) throw error;

      /** dag → person → stämplingar i tidsordning. */
      const byDay = new Map<string, Map<string, { type: string; at: number }[]>>();
      (data ?? []).forEach((e: any) => {
        const day = String(e.arbetsdag ?? "").slice(0, 10);
        const employeeId = String(e.employee_id ?? "");
        const at = e.occurred_at ? new Date(e.occurred_at).getTime() : NaN;
        if (!day || !employeeId || Number.isNaN(at)) return;
        const type = String(e.type ?? "");
        if (type !== "in" && type !== "out") return;
        const people = byDay.get(day) ?? new Map<string, { type: string; at: number }[]>();
        const list = people.get(employeeId) ?? [];
        list.push({ type, at });
        people.set(employeeId, list);
        byDay.set(day, people);
      });

      /** dag → { timmar, antal pass } */
      const perDay = new Map<string, { hours: number; shifts: number }>();
      byDay.forEach((people, day) => {
        let hours = 0;
        let shiftCount = 0;
        people.forEach((punches) => {
          punches.sort((a, b) => a.at - b.at);
          let openAt: number | null = null;
          punches.forEach((p) => {
            if (p.type === "in") {
              openAt = p.at;
            } else if (openAt !== null) {
              const span = (p.at - openAt) / 3_600_000;
              if (span > 0 && span < 24) {
                hours += span;
                shiftCount += 1;
              }
              openAt = null;
            }
          });
        });
        if (hours > 0 && shiftCount > 0) perDay.set(day, { hours, shifts: shiftCount });
      });

      const hourSums = Array(7).fill(0) as number[];
      const shiftSums = Array(7).fill(0) as number[];
      const counts = Array(7).fill(0) as number[];
      perDay.forEach((v, day) => {
        const idx = mondayIndex(day);
        hourSums[idx] += v.hours;
        shiftSums[idx] += v.shifts;
        counts[idx] += 1;
      });

      return {
        hoursPerDay: hourSums.map((sum, i) => (counts[i] ? sum / counts[i] : null)),
        avgShiftHours: shiftSums.map((shiftCount, i) => (shiftCount ? hourSums[i] / shiftCount : null)),
        samples: counts,
      };
    },
  });

  return { data: query.data ?? EMPTY_HISTORY, isLoading: query.isLoading };
}

/**
 * Behovet för en veckodag: kalkylens lönebudget, dämpad mot historiken.
 *
 * @param averageRevenue snittförsäljning för veckodagen, kronor inkl. moms
 * @param hourlyCost kostnad per arbetad timme inklusive arbetsgivaravgift
 * @param margins moms, bruttovinstmarginal, övriga kostnader och vinstkrav
 */
export function computeNeedForDay(
  averageRevenue: number | null,
  revenueSamples: number,
  hourlyCost: number | null,
  margins: NeedMargins,
  historyHours: number | null,
  historyShiftHours: number | null,
): WeekdayNeedDay {
  const avgShiftHours = historyShiftHours && historyShiftHours > 0 ? historyShiftHours : DEFAULT_SHIFT_HOURS;

  if (!averageRevenue || averageRevenue <= 0 || !hourlyCost || hourlyCost <= 0) {
    return {
      hours: null,
      people: null,
      source: "saknas",
      samples: revenueSamples,
      avgShiftHours,
      budget: null,
      net: null,
      gross: null,
    };
  }

  const { net, gross, budget } = laborBudget(averageRevenue, margins);

  if (budget <= 0) {
    return {
      hours: 0,
      people: 0,
      source: "utan utrymme",
      samples: revenueSamples,
      avgShiftHours,
      budget,
      net,
      gross,
    };
  }

  const frameHours = budget / hourlyCost;

  let hours = frameHours;
  let source: StaffNeedSource = "omsättning";
  if (historyHours && historyHours > 0) {
    const min = frameHours * (1 - HISTORY_CLAMP);
    const max = frameHours * (1 + HISTORY_CLAMP);
    hours = Math.min(max, Math.max(min, historyHours));
    source = "omsättning+historik";
  }

  const rounded = Math.round(hours * 10) / 10;
  return {
    hours: rounded,
    people: Math.max(1, Math.round(rounded / avgShiftHours)),
    source,
    samples: revenueSamples,
    avgShiftHours,
    budget,
    net,
    gross,
  };
}

/**
 * Hela veckans behov. Omsättningen kommer från anroparen (useWeekdayRevenue)
 * så behov och kostnadsprocent bygger på exakt samma underlag.
 */
export function useWeekdayStaffNeed(
  storeId: string | null,
  weekStart: string,
  opts: {
    averageRevenue: (number | null)[];
    revenueSamples: number[];
    hourlyCost: number | null;
    margins: NeedMargins;
    weeksBack?: number;
  },
): { data: WeekdayNeedDay[]; isLoading: boolean } {
  const { averageRevenue, revenueSamples, hourlyCost, margins, weeksBack = 8 } = opts;
  const history = useWeekdayWorkHistory(storeId, weekStart, weeksBack);

  const data = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        computeNeedForDay(
          averageRevenue[i] ?? null,
          revenueSamples[i] ?? 0,
          hourlyCost,
          margins,
          history.data.hoursPerDay[i] ?? null,
          history.data.avgShiftHours[i] ?? null,
        ),
      ),
    [averageRevenue, revenueSamples, hourlyCost, margins, history.data],
  );

  return { data, isLoading: history.isLoading };
}
