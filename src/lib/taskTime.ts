/**
 * Tidsmodellen för uppgifter. En uppgift kan ha exakt tid, ett tidsfönster,
 * en dagsdel eller ingen tid alls. Saknas tid visas ingenting — aldrig "–".
 * Beräknad tid (minuter) är något helt annat än när uppgiften ska göras.
 */
export type DaypartKey = "morgon" | "mitt" | "kvall" | "ingen";

export const DAYPARTS: { key: DaypartKey; label: string; from: number; to: number }[] = [
  { key: "morgon", label: "Morgon (06:00 – 10:00)", from: 6 * 60, to: 10 * 60 },
  { key: "mitt", label: "Mitt på dagen (10:00 – 15:00)", from: 10 * 60, to: 15 * 60 },
  { key: "kvall", label: "Kväll (15:00 – 22:00)", from: 15 * 60, to: 22 * 60 },
  { key: "ingen", label: "Utan tid", from: -1, to: -1 },
];

export function daypartLabel(key: DaypartKey): string {
  return DAYPARTS.find((d) => d.key === key)?.label ?? "Utan tid";
}

export type TaskTimeInput = {
  specific_time?: string | null;
  time_from?: string | null;
  time_to?: string | null;
  daypart?: string | null;
  /** Äldre fritextfält, t.ex. "07:15" eller "Morgon 06–10". */
  time_label?: string | null;
};

export type TaskTime = {
  kind: "specific" | "window" | "daypart" | "none";
  /** Minuter efter midnatt, används för sortering. Null när tid saknas. */
  minutes: number | null;
  /** Text att visa i listan. Tom sträng när ingen tid finns. */
  label: string;
};

/** "07:15:00" | "07:15" → 435. Null om texten inte innehåller en klocktid. */
export function parseClock(value?: string | null): number | null {
  const m = (value ?? "").match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function clockText(value?: string | null): string {
  const mins = parseClock(value);
  if (mins === null) return "";
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function taskTime(t: TaskTimeInput): TaskTime {
  const specific = parseClock(t.specific_time);
  if (specific !== null) {
    return { kind: "specific", minutes: specific, label: clockText(t.specific_time) };
  }
  const from = parseClock(t.time_from);
  const to = parseClock(t.time_to);
  if (from !== null) {
    return {
      kind: "window",
      minutes: from,
      label: to !== null ? `${clockText(t.time_from)}–${clockText(t.time_to)}` : clockText(t.time_from),
    };
  }
  const dp = DAYPARTS.find((d) => d.key === t.daypart && d.key !== "ingen");
  if (dp) return { kind: "daypart", minutes: dp.from, label: dp.label.split(" (")[0] };

  // Äldre rader har bara fritext. Innehåller den en klocktid räknas den som tid.
  const legacy = parseClock(t.time_label);
  if (legacy !== null) return { kind: "specific", minutes: legacy, label: clockText(t.time_label) };
  const legacyDp = DAYPARTS.find(
    (d) => d.key !== "ingen" && (t.time_label ?? "").toLowerCase().includes(d.label.split(" (")[0].toLowerCase()),
  );
  if (legacyDp) return { kind: "daypart", minutes: legacyDp.from, label: legacyDp.label.split(" (")[0] };

  return { kind: "none", minutes: null, label: "" };
}

/** Vilken grupp uppgiften hamnar i: morgon, mitt på dagen, kväll eller utan tid. */
export function daypartOf(t: TaskTimeInput): DaypartKey {
  const time = taskTime(t);
  if (time.minutes === null) return "ingen";
  const hit = DAYPARTS.find((d) => d.key !== "ingen" && time.minutes! >= d.from && time.minutes! < d.to);
  return hit?.key ?? (time.minutes < 6 * 60 ? "morgon" : "kvall");
}

/** Kronologisk ordning inom en grupp; uppgifter utan tid behåller sin ordning. */
export function compareByTime<T extends TaskTimeInput & { sort_order?: number | null }>(a: T, b: T): number {
  const am = taskTime(a).minutes;
  const bm = taskTime(b).minutes;
  if (am !== null && bm !== null && am !== bm) return am - bm;
  if (am !== null && bm === null) return -1;
  if (am === null && bm !== null) return 1;
  return (a.sort_order ?? 0) - (b.sort_order ?? 0);
}

/** Grupperar dagens uppgifter i dagsdelar, i fast ordning. */
export function groupByDaypart<T extends TaskTimeInput & { sort_order?: number | null }>(tasks: T[]) {
  return DAYPARTS.map((d) => ({
    ...d,
    tasks: tasks.filter((t) => daypartOf(t) === d.key).sort(compareByTime),
  })).filter((g) => g.tasks.length > 0);
}

/** "15 min", "1 h 30 min". Tom sträng när uppskattning saknas. */
export function durationText(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Summa beräknad tid för uppgifter som fortfarande är kvar. */
export function remainingMinutes(tasks: { done: boolean; estimated_minutes?: number | null }[]): number {
  return tasks.filter((t) => !t.done).reduce((sum, t) => sum + (t.estimated_minutes ?? 0), 0);
}
