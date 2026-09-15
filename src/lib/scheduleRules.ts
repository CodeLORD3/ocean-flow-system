/**
 * Regelkontroller och täckning för schemavyerna.
 *
 * Allt räknas ur planerade pass — inga databasanrop här. Vilotiderna följer
 * arbetstidslagen: 11 timmar sammanhängande dygnsvila (13 § ATL) och 36 timmar
 * veckovila (14 § ATL). Bemanningsbehov per enhet och timme finns inte i
 * databasen ännu, därför räknas täckning som antal bemannade personer.
 */
import type { PlannedShiftRow } from "@/lib/liveStaff";
import { minutesOfTime } from "@/lib/scheduleFormat";

export const DAILY_REST_HOURS = 11;
export const WEEKLY_REST_HOURS = 36;

export interface ShiftRuleResult {
  /** Kort text för passblocket, t.ex. "Vila 7 h". */
  short: string;
  /** Full förklaring för panelen. */
  detail: string;
  restHours: number;
}

/** Absolut minut sedan epoch-dygnet för ett pass. Slut före start = över midnatt. */
function span(shift: PlannedShiftRow): { from: number; to: number } {
  const dayStart = new Date(`${shift.shift_date}T00:00:00`).getTime() / 60000;
  const from = dayStart + minutesOfTime(shift.start_time);
  let to = dayStart + minutesOfTime(shift.end_time);
  if (to <= from) to += 24 * 60;
  return { from, to };
}

/**
 * Dygnsvila per pass. Nyckeln är passets id, värdet regelbrottet mot det
 * föregående passet för samma person.
 */
export function dailyRestViolations(shifts: PlannedShiftRow[]): Map<string, ShiftRuleResult> {
  const byStaff = new Map<string, PlannedShiftRow[]>();
  shifts.forEach((shift) => {
    byStaff.set(shift.staff_id, [...(byStaff.get(shift.staff_id) ?? []), shift]);
  });
  const result = new Map<string, ShiftRuleResult>();
  byStaff.forEach((list) => {
    const sorted = [...list].sort((a, b) => span(a).from - span(b).from);
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = span(sorted[index - 1]);
      const current = span(sorted[index]);
      const restHours = (current.from - previous.to) / 60;
      if (restHours >= 0 && restHours < DAILY_REST_HOURS) {
        const rounded = Math.round(restHours * 10) / 10;
        result.set(sorted[index].id, {
          short: `Vila ${rounded.toLocaleString("sv-SE")} h`,
          detail: `Föregående pass slutar ${sorted[index - 1].end_time.slice(0, 5)}. Detta börjar ${sorted[index].start_time.slice(0, 5)}. Kravet är ${DAILY_REST_HOURS} timmar sammanhängande dygnsvila (13 § ATL).`,
          restHours: rounded,
        });
      }
    }
  });
  return result;
}

/** Längsta sammanhängande vila under veckan, i timmar. */
export function weeklyRestHours(shifts: PlannedShiftRow[], staffId: string, days: string[]): number | null {
  const list = shifts.filter((shift) => shift.staff_id === staffId).map(span).sort((a, b) => a.from - b.from);
  if (list.length === 0 || days.length === 0) return null;
  const weekFrom = new Date(`${days[0]}T00:00:00`).getTime() / 60000;
  const weekTo = new Date(`${days[days.length - 1]}T00:00:00`).getTime() / 60000 + 24 * 60;
  let longest = list[0].from - weekFrom;
  for (let index = 1; index < list.length; index += 1) {
    longest = Math.max(longest, list[index].from - list[index - 1].to);
  }
  longest = Math.max(longest, weekTo - list[list.length - 1].to);
  return Math.round((longest / 60) * 10) / 10;
}

/** Antal bemannade personer per dag. Behov saknas i databasen och är därför null. */
export function coveragePerDay(shifts: PlannedShiftRow[], days: string[]): { day: string; scheduled: number; target: number | null }[] {
  return days.map((day) => ({
    day,
    scheduled: new Set(shifts.filter((shift) => shift.shift_date === day).map((shift) => shift.staff_id)).size,
    target: null,
  }));
}

/** Antal bemannade personer per timme under ett dygn, för dagvyns bemanningsrad. */
export function coveragePerHour(shifts: PlannedShiftRow[], day: string, fromHour: number, toHour: number): { hour: number; scheduled: number }[] {
  const dayShifts = shifts.filter((shift) => shift.shift_date === day);
  return Array.from({ length: Math.max(0, toHour - fromHour) }, (_, index) => {
    const hour = fromHour + index;
    const start = hour * 60;
    const end = start + 60;
    const staff = new Set(
      dayShifts
        .filter((shift) => {
          const from = minutesOfTime(shift.start_time);
          let to = minutesOfTime(shift.end_time);
          if (to <= from) to += 24 * 60;
          return from < end && to > start;
        })
        .map((shift) => shift.staff_id),
    );
    return { hour, scheduled: staff.size };
  });
}

/** Första hålet i bemanningen mellan två timmar med personal, t.ex. "11–12". */
export function staffingGap(perHour: { hour: number; scheduled: number }[]): { label: string; fromHour: number; toHour: number } | null {
  const active = perHour.filter((entry) => entry.scheduled > 0);
  if (active.length < 2) return null;
  const first = active[0].hour;
  const last = active[active.length - 1].hour;
  const gap = perHour.find((entry) => entry.hour > first && entry.hour < last && entry.scheduled === 0);
  if (!gap) return null;
  let end = gap.hour + 1;
  while (end < last && (perHour.find((entry) => entry.hour === end)?.scheduled ?? 1) === 0) end += 1;
  return { label: `${String(gap.hour).padStart(2, "0")}–${String(end).padStart(2, "0")}`, fromHour: gap.hour, toHour: end };
}
