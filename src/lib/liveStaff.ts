/**
 * Live personal — beräkningar.
 *
 * All logik som ger sidan sin betydelse bor här: hur öppettiden för ett datum
 * löses, hur raster härleds ur stämplingspar och hur avvikelser bedöms.
 * Inget i den här filen läser databasen — den tar emot rader och räknar.
 */

export interface OpeningHourRow {
  store_id: string;
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  closed: boolean;
}

export interface SpecialDayRow {
  store_id: string;
  day: string;
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
  note?: string | null;
}

export interface PlannedShiftRow {
  id: string;
  staff_id: string;
  store_id: string | null;
  shift_date: string;
  start_time: string;
  end_time: string;
  note: string | null;
}

export interface ActualShiftRow {
  id: string;
  staff_id: string;
  store_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

/** Öppettid för ett givet datum, i minuter från midnatt. */
export interface DayHours {
  closed: boolean;
  open: number | null;
  close: number | null;
  /** Varifrån tiden kom — används för att förklara tomma vyer. */
  source: "special" | "weekly" | "none";
  note?: string | null;
}

export type LiveStatus =
  | "working"
  | "planned"
  | "break"
  | "deviation"
  | "done"
  | "closed";

export const STATUS_LABEL: Record<LiveStatus, string> = {
  working: "Arbetar nu",
  planned: "Ej börjat",
  break: "Rast",
  deviation: "Avvikelse",
  done: "Avslutat",
  closed: "Stängt",
};

/** "08:30:00" eller "08:30" → minuter från midnatt. */
export function timeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hh = Number(h);
  const mm = Number(m ?? 0);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function minutesToTime(min: number): string {
  const clamped = Math.max(0, Math.round(min));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minuter från midnatt (lokal tid) för en tidsstämpel, relativt ett datum. */
export function isoToMinutes(iso: string, dateKey: string): number {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mins = d.getHours() * 60 + d.getMinutes();
  if (day === dateKey) return mins;
  // Pass som startade tidigare dygn klipps till dagens början, senare dygn till slutet.
  return day < dateKey ? 0 : 24 * 60;
}

export function dateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isToday(key: string): boolean {
  return key === dateKey();
}

/** Öppettid: avvikande dag först, därefter veckoschemat, annars okänt. */
export function resolveDayHours(
  storeId: string,
  day: string,
  weekly: OpeningHourRow[],
  specials: SpecialDayRow[],
): DayHours {
  const special = specials.find((s) => s.store_id === storeId && s.day === day);
  if (special) {
    if (special.closed) return { closed: true, open: null, close: null, source: "special", note: special.note };
    const open = timeToMinutes(special.open_time);
    const close = timeToMinutes(special.close_time);
    if (open !== null && close !== null) {
      return { closed: false, open, close, source: "special", note: special.note };
    }
  }

  const weekday = new Date(`${day}T12:00:00`).getDay();
  const row = weekly.find((w) => w.store_id === storeId && w.weekday === weekday);
  if (row) {
    if (row.closed) return { closed: true, open: null, close: null, source: "weekly" };
    const open = timeToMinutes(row.open_time);
    const close = timeToMinutes(row.close_time);
    if (open !== null && close !== null) return { closed: false, open, close, source: "weekly" };
  }

  return { closed: false, open: null, close: null, source: "none" };
}

export function formatDayHours(h: DayHours): string {
  if (h.closed) return "Stängt";
  if (h.open === null || h.close === null) return "Öppettid saknas";
  return `${minutesToTime(h.open)}–${minutesToTime(h.close)}`;
}

export interface Segment {
  kind: "work" | "break" | "planned";
  from: number;
  to: number;
  open: boolean;
  shiftId?: string;
}

/**
 * Faktiska pass och härledda raster för en anställd på en butik ett datum.
 *
 * Rast = luckan mellan en utstämpling och nästa instämpling samma dag och
 * butik. Luckor under 5 minuter räknas som felstämpling och hoppas över.
 */
export function buildActualSegments(
  shifts: ActualShiftRow[],
  day: string,
  nowMinutes: number,
): Segment[] {
  const sorted = [...shifts].sort((a, b) => a.clocked_in_at.localeCompare(b.clocked_in_at));
  const out: Segment[] = [];

  sorted.forEach((s, i) => {
    const from = isoToMinutes(s.clocked_in_at, day);
    const open = !s.clocked_out_at;
    const to = s.clocked_out_at ? isoToMinutes(s.clocked_out_at, day) : Math.max(from, nowMinutes);
    out.push({ kind: "work", from, to, open, shiftId: s.id });

    const next = sorted[i + 1];
    if (s.clocked_out_at && next) {
      const gapFrom = isoToMinutes(s.clocked_out_at, day);
      const gapTo = isoToMinutes(next.clocked_in_at, day);
      if (gapTo - gapFrom >= 5) out.push({ kind: "break", from: gapFrom, to: gapTo, open: false });
    }
  });

  return out;
}

export const LATE_THRESHOLD_MIN = 10;

export type DeviationKind =
  | "no_show"
  | "late_in"
  | "early_out"
  | "overtime"
  | "unplanned"
  | "unstaffed";

export const DEVIATION_LABEL: Record<DeviationKind, string> = {
  no_show: "Ej påbörjat pass",
  late_in: "Sen instämpling",
  early_out: "Tidig utstämpling",
  overtime: "Arbete efter planerad sluttid",
  unplanned: "Arbete utan planerat pass",
  unstaffed: "Öppen butik utan bemanning",
};

export interface Deviation {
  kind: DeviationKind;
  staffId?: string;
  storeId: string;
  detail: string;
}

export interface StaffDayRow {
  staffId: string;
  storeId: string;
  planned: PlannedShiftRow[];
  plannedSegments: Segment[];
  actualSegments: Segment[];
  status: LiveStatus;
  deviations: Deviation[];
  /** Faktiskt arbetade minuter (rast borträknad). */
  workedMinutes: number;
  plannedMinutes: number;
}

/** Bedömer en anställds dag på en butik. */
export function buildStaffDay(params: {
  staffId: string;
  storeId: string;
  day: string;
  nowMinutes: number;
  live: boolean;
  planned: PlannedShiftRow[];
  actual: ActualShiftRow[];
}): StaffDayRow {
  const { staffId, storeId, day, nowMinutes, live, planned, actual } = params;

  const plannedSegments: Segment[] = planned
    .map((p) => ({
      kind: "planned" as const,
      from: timeToMinutes(p.start_time) ?? 0,
      to: timeToMinutes(p.end_time) ?? 0,
      open: false,
    }))
    .filter((s) => s.to > s.from);

  const actualSegments = buildActualSegments(actual, day, live ? nowMinutes : 24 * 60);
  const workedMinutes = actualSegments
    .filter((s) => s.kind === "work")
    .reduce((sum, s) => sum + Math.max(0, s.to - s.from), 0);
  const plannedMinutes = plannedSegments.reduce((sum, s) => sum + (s.to - s.from), 0);

  const deviations: Deviation[] = [];
  const firstIn = actualSegments.find((s) => s.kind === "work")?.from ?? null;
  const lastOut = [...actualSegments].reverse().find((s) => s.kind === "work")?.to ?? null;
  const hasOpen = actualSegments.some((s) => s.kind === "work" && s.open);
  const onBreak =
    !hasOpen &&
    actualSegments.some((s) => s.kind === "break" && s.from <= nowMinutes && s.to >= nowMinutes);

  const plannedStart = plannedSegments.length ? Math.min(...plannedSegments.map((s) => s.from)) : null;
  const plannedEnd = plannedSegments.length ? Math.max(...plannedSegments.map((s) => s.to)) : null;

  if (plannedStart !== null) {
    if (firstIn === null) {
      // Endast en avvikelse när starttiden faktiskt passerats.
      if (!live || nowMinutes > plannedStart + LATE_THRESHOLD_MIN) {
        deviations.push({
          kind: "no_show",
          staffId,
          storeId,
          detail: `Planerad start ${minutesToTime(plannedStart)} — ingen instämpling`,
        });
      }
    } else if (firstIn > plannedStart + LATE_THRESHOLD_MIN) {
      deviations.push({
        kind: "late_in",
        staffId,
        storeId,
        detail: `Planerad ${minutesToTime(plannedStart)}, instämplad ${minutesToTime(firstIn)}`,
      });
    }
  } else if (firstIn !== null) {
    deviations.push({
      kind: "unplanned",
      staffId,
      storeId,
      detail: `Instämplad ${minutesToTime(firstIn)} utan planerat pass`,
    });
  }

  if (plannedEnd !== null && lastOut !== null) {
    if (!hasOpen && lastOut < plannedEnd - LATE_THRESHOLD_MIN && (!live || nowMinutes >= plannedEnd)) {
      deviations.push({
        kind: "early_out",
        staffId,
        storeId,
        detail: `Planerad slut ${minutesToTime(plannedEnd)}, utstämplad ${minutesToTime(lastOut)}`,
      });
    }
    if (lastOut > plannedEnd + LATE_THRESHOLD_MIN) {
      deviations.push({
        kind: "overtime",
        staffId,
        storeId,
        detail: `Planerad slut ${minutesToTime(plannedEnd)}, arbete till ${minutesToTime(lastOut)}`,
      });
    }
  }

  let status: LiveStatus;
  if (hasOpen) status = "working";
  else if (onBreak && live) status = "break";
  else if (firstIn !== null) status = "done";
  else if (plannedStart !== null && live && nowMinutes < plannedStart) status = "planned";
  else status = deviations.length ? "deviation" : plannedStart !== null ? "planned" : "done";

  if (deviations.some((d) => d.kind === "no_show")) status = "deviation";

  return {
    staffId,
    storeId,
    planned,
    plannedSegments,
    actualSegments,
    status,
    deviations,
    workedMinutes,
    plannedMinutes,
  };
}

export function formatMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return h > 0 ? `${h} h ${rest} min` : `${rest} min`;
}

/** Är butiken öppen just nu enligt dagens öppettid? */
export function isOpenNow(h: DayHours, nowMinutes: number): boolean {
  if (h.closed || h.open === null || h.close === null) return false;
  return nowMinutes >= h.open && nowMinutes < h.close;
}
