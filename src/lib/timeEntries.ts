/**
 * Beräkning från den append-only journalen.
 *
 * Journalen får aldrig ändras: en rättelse är en ny rad med
 * corrects_entry_id + correction_kind ('replace' | 'void'). Effektiv tid räknas
 * därför fram genom att rätta bort ersatta/ogiltigförklarade rader.
 */
import type { TimeEntry } from "@/hooks/useClock";
import { svenskDatum, svenskTid } from "@/lib/swedishTime";

export interface DaySummary {
  employee_id: string;
  day: string;
  first_in: string | null;
  last_out: string | null;
  break_seconds: number;
  work_seconds: number;
  sources: string[];
  entries: TimeEntry[];
}

/** Rader som gäller efter korrigeringar. */
export function effectiveEntries(entries: TimeEntry[]): TimeEntry[] {
  const superseded = new Set<string>();
  for (const e of entries) {
    if (e.corrects_entry_id) superseded.add(e.corrects_entry_id);
  }
  return entries
    .filter((e) => !superseded.has(e.id))
    .filter((e) => e.correction_kind !== "void")
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

const dayOf = (iso: string) => svenskDatum(iso);

export function summarizeDays(entries: TimeEntry[]): DaySummary[] {
  const effective = effectiveEntries(entries);
  const groups = new Map<string, TimeEntry[]>();
  for (const e of effective) {
    const key = `${e.employee_id}|${dayOf(e.occurred_at)}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  const out: DaySummary[] = [];
  for (const [key, list] of groups) {
    const [employee_id, day] = key.split("|");
    let workSec = 0;
    let breakSec = 0;
    let inAt: string | null = null;
    let breakAt: string | null = null;
    let firstIn: string | null = null;
    let lastOut: string | null = null;

    for (const e of list) {
      const t = new Date(e.occurred_at).getTime();
      if (e.type === "in") {
        inAt = e.occurred_at;
        if (!firstIn) firstIn = e.occurred_at;
      } else if (e.type === "ut") {
        if (inAt) workSec += (t - new Date(inAt).getTime()) / 1000;
        inAt = null;
        lastOut = e.occurred_at;
      } else if (e.type === "rast_start") {
        breakAt = e.occurred_at;
      } else if (e.type === "rast_slut" && breakAt) {
        breakSec += (t - new Date(breakAt).getTime()) / 1000;
        breakAt = null;
      }
    }

    out.push({
      employee_id,
      day,
      first_in: firstIn,
      last_out: lastOut,
      break_seconds: Math.max(0, Math.round(breakSec)),
      work_seconds: Math.max(0, Math.round(workSec - breakSec)),
      sources: [...new Set(list.map((e) => e.source))],
      entries: list,
    });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

export const hhmm = (iso: string | null) =>
  iso ? svenskTid(iso).slice(0, 5) : "–";

export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export const TYPE_LABEL: Record<TimeEntry["type"], string> = {
  in: "In",
  ut: "Ut",
  rast_start: "Rast start",
  rast_slut: "Rast slut",
};

export const SOURCE_LABEL: Record<TimeEntry["source"], string> = {
  clock: "Klocka",
  manual: "Manuell",
  correction: "Rättelse",
  import: "Import",
};
