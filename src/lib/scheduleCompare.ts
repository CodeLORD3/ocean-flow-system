import type { PlannedShiftRow } from "@/lib/liveStaff";

export interface ActualShift {
  id: string;
  staff_id: string;
  store_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

/** Lokalt datum (YYYY-MM-DD) för en tidsstämpel. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ActualDay {
  minutes: number;
  /** Sant när någon stämpling fortfarande är öppen — tiden räknas mot nu. */
  ongoing: boolean;
  firstIn: string | null;
  lastOut: string | null;
}

/**
 * Arbetad tid per `staffId|datum`. Öppna pass räknas fram till nu så att
 * schemat visar pågående arbete direkt i stället för noll.
 */
export function buildActualMap(shifts: ActualShift[], now = Date.now()): Map<string, ActualDay> {
  const map = new Map<string, ActualDay>();
  shifts.forEach((s) => {
    const day = localDay(s.clocked_in_at);
    const key = `${s.staff_id}|${day}`;
    const start = new Date(s.clocked_in_at).getTime();
    const end = s.clocked_out_at ? new Date(s.clocked_out_at).getTime() : now;
    const minutes = Math.max(0, Math.round((end - start) / 60000));
    const prev = map.get(key);
    const inClock = hhmm(s.clocked_in_at);
    const outClock = s.clocked_out_at ? hhmm(s.clocked_out_at) : null;
    map.set(key, {
      minutes: (prev?.minutes ?? 0) + minutes,
      ongoing: (prev?.ongoing ?? false) || !s.clocked_out_at,
      firstIn: prev?.firstIn ?? inClock,
      lastOut: outClock ?? prev?.lastOut ?? null,
    });
  });
  return map;
}

export function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function plannedMinutes(p: PlannedShiftRow): number {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.max(0, m(p.end_time) - m(p.start_time));
}

/** Avvikelse arbetad tid mot planerad — färgen visar över-/undertid. */
export function diffTone(diff: number, ongoing: boolean): string {
  if (ongoing) return "text-sky-500";
  if (diff > 15) return "text-amber-500";
  if (diff < -15) return "text-destructive";
  return "text-emerald-500";
}

export function signedMinutes(diff: number): string {
  const s = diff < 0 ? "−" : "+";
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${s}${h > 0 ? `${h}h ` : ""}${m}m`;
}
