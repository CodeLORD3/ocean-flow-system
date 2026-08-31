/**
 * Schemalogik för etapp 3: datumhjälpare, regelmotor (arbetstidsregler) och
 * den regelbaserade förslagsmotorn. Ingen AI här — allt är deterministiskt
 * och testbart, så att både schemavyn och importgranskningen kan använda
 * exakt samma kontroller.
 */

export const DAY_NAMES = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

export interface ShiftType {
  id: string;
  name: string;
  legal_entity_id: string | null;
  color_token: string;
  is_payroll_relevant: boolean;
  is_swappable: boolean;
  required_competency: string | null;
  sort_order: number;
}

export interface Shift {
  id: string;
  store_id: string;
  legal_entity_id: string | null;
  employee_id: string | null;
  shift_type_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  status: "draft" | "published" | "cancelled";
  published_at: string | null;
  note: string | null;
  import_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTemplate {
  id: string;
  store_id: string;
  legal_entity_id: string | null;
  name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_minutes: number;
  shift_type_id: string | null;
  count: number;
}

export interface Availability {
  id: string;
  employee_id: string;
  weekday: number | null;
  date: string | null;
  from_time: string;
  to_time: string;
  type: "onskar" | "otillganglig";
  note: string | null;
}

export interface ShiftRequest {
  id: string;
  shift_id: string;
  type: "swap" | "handover" | "claim_open";
  from_employee_id: string | null;
  to_employee_id: string | null;
  status: "pending" | "auto_approved" | "approved" | "rejected";
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ tid */

export function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export function hhmm(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Passlängd i minuter, rast borträknad. Pass över midnatt hanteras. */
export function shiftMinutes(s: Pick<Shift, "start_time" | "end_time" | "break_minutes">): number {
  const start = minutesOf(s.start_time);
  let end = minutesOf(s.end_time);
  if (end <= start) end += 1440;
  return Math.max(0, end - start - (s.break_minutes ?? 0));
}

export function shiftStart(s: Pick<Shift, "date" | "start_time">): Date {
  return new Date(`${s.date}T${s.start_time.slice(0, 5)}:00`);
}

export function shiftEnd(s: Pick<Shift, "date" | "start_time" | "end_time">): Date {
  const start = shiftStart(s);
  const end = new Date(`${s.date}T${s.end_time.slice(0, 5)}:00`);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
}

export function mondayOf(day: string): Date {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekDates(anchor: string): string[] {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return dateKey(d);
  });
}

export function isoWeek(day: string): number {
  const d = new Date(`${day}T12:00:00`);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 864e5));
}

/** ISO-veckodag 1–7 (mån–sön). */
export function weekdayOf(day: string): number {
  const d = new Date(`${day}T12:00:00`);
  return ((d.getDay() + 6) % 7) + 1;
}

export function formatMinutes(total: number): string {
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(Math.round(total));
  return `${sign}${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, "0")} min`;
}

/* --------------------------------------------------------- regelmotorn */

export type CheckSeverity = "block" | "warn" | "info";

export interface RuleCheck {
  code:
    | "dygnsvila"
    | "veckovila"
    | "minderarig"
    | "tillganglighet"
    | "kompetens"
    | "mertid"
    | "overlapp"
    | "franvaro";
  severity: CheckSeverity;
  label: string;
  detail: string;
}

export interface RuleContext {
  /** Alla pass för personen (publicerade + utkast) som ska vägas in. */
  shifts: Shift[];
  availability: Availability[];
  competencies: string[];
  birthDate: string | null;
  /** Sysselsättningsgrad 0–1 (1 = heltid). */
  employmentRate: number;
  requiredCompetency?: string | null;
  /** Godkända eller väntande frånvaroblock för personen. */
  absences?: { from: string; to: string; label?: string }[];
  /** Heltidsmått per vecka i minuter. */
  fullTimeWeekMinutes?: number;
}

const DAILY_REST_HOURS = 11;
const WEEKLY_REST_HOURS = 36;
const MINOR_EARLIEST = 6 * 60;
const MINOR_LATEST = 22 * 60;

/** Ålder vid ett givet datum. */
export function ageAt(birthDate: string | null, on: string): number | null {
  if (!birthDate) return null;
  const b = new Date(`${birthDate}T12:00:00`);
  const d = new Date(`${on}T12:00:00`);
  let age = d.getFullYear() - b.getFullYear();
  const before =
    d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (before) age -= 1;
  return age;
}

/**
 * Kontrollerar ett tänkt pass mot arbetstidsregler och personens
 * förutsättningar. Samma funktion används i schemavyn, i bytesbeslut och i
 * importgranskningen så att inget flöde kan gå runt reglerna.
 */
export function checkShift(
  candidate: Pick<Shift, "date" | "start_time" | "end_time" | "break_minutes"> & { id?: string },
  ctx: RuleContext,
): RuleCheck[] {
  const checks: RuleCheck[] = [];
  const start = shiftStart(candidate);
  const end = shiftEnd(candidate);
  const others = ctx.shifts.filter((s) => s.id !== candidate.id && s.status !== "cancelled");

  // Överlapp
  for (const s of others) {
    if (shiftStart(s) < end && shiftEnd(s) > start) {
      checks.push({
        code: "overlapp",
        severity: "block",
        label: "Överlappande pass",
        detail: `Krockar med ${s.date} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}.`,
      });
      break;
    }
  }

  // Frånvaro — behandlas som ett block även när det ännu inte är beslutat.
  const absence = (ctx.absences ?? []).find((a) => a.from <= candidate.date && a.to >= candidate.date);
  if (absence) {
    checks.push({
      code: "franvaro",
      severity: "block",
      label: "Frånvaro registrerad",
      detail: `${absence.label ? `${absence.label} · ` : ""}${absence.from}${absence.to !== absence.from ? `–${absence.to}` : ""}.`,
    });
  }

  // Dygnsvila 11 h
  for (const s of others) {
    const oEnd = shiftEnd(s);
    const oStart = shiftStart(s);
    const gapBefore = (start.getTime() - oEnd.getTime()) / 3600_000;
    const gapAfter = (oStart.getTime() - end.getTime()) / 3600_000;
    const gap = gapBefore >= 0 ? gapBefore : gapAfter >= 0 ? gapAfter : null;
    if (gap !== null && gap < DAILY_REST_HOURS) {
      checks.push({
        code: "dygnsvila",
        severity: "block",
        label: "Dygnsvila under 11 h",
        detail: `Endast ${gap.toFixed(1)} h vila mot passet ${s.date} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}.`,
      });
      break;
    }
  }

  // Veckovila 36 h — längsta sammanhängande ledighet under veckan
  const week = weekDates(candidate.date);
  const inWeek = [
    ...others.filter((s) => week.includes(s.date)),
    { ...candidate, date: candidate.date } as Shift,
  ]
    .map((s) => ({ from: shiftStart(s), to: shiftEnd(s) }))
    .sort((a, b) => a.from.getTime() - b.from.getTime());
  if (inWeek.length > 1) {
    let longest = 0;
    const weekStart = new Date(`${week[0]}T00:00:00`);
    const weekEnd = new Date(`${week[6]}T23:59:59`);
    let cursor = weekStart;
    for (const iv of inWeek) {
      longest = Math.max(longest, (iv.from.getTime() - cursor.getTime()) / 3600_000);
      if (iv.to > cursor) cursor = iv.to;
    }
    longest = Math.max(longest, (weekEnd.getTime() - cursor.getTime()) / 3600_000);
    if (longest < WEEKLY_REST_HOURS) {
      checks.push({
        code: "veckovila",
        severity: "warn",
        label: "Veckovila under 36 h",
        detail: `Längsta sammanhängande ledighet i veckan blir ${longest.toFixed(1)} h.`,
      });
    }
  }

  // Minderårig
  const age = ageAt(ctx.birthDate, candidate.date);
  if (age !== null && age < 18) {
    const s = minutesOf(candidate.start_time);
    const e = minutesOf(candidate.end_time);
    const crossesNight = e <= s || e > MINOR_LATEST || s < MINOR_EARLIEST;
    if (crossesNight) {
      checks.push({
        code: "minderarig",
        severity: "block",
        label: `Minderårig (${age} år)`,
        detail: `Pass ${candidate.start_time.slice(0, 5)}–${candidate.end_time.slice(0, 5)} ligger utanför 06:00–22:00.`,
      });
    }
    if (shiftMinutes(candidate) > 8 * 60) {
      checks.push({
        code: "minderarig",
        severity: "warn",
        label: `Minderårig (${age} år)`,
        detail: "Mer än 8 h arbetstid på ett pass.",
      });
    }
  }

  // Tillgänglighet
  const wd = weekdayOf(candidate.date);
  const conflicts = ctx.availability.filter((a) => {
    if (a.type !== "otillganglig") return false;
    if (a.date && a.date !== candidate.date) return false;
    if (!a.date && a.weekday !== wd) return false;
    return (
      minutesOf(a.from_time) < minutesOf(candidate.end_time) &&
      minutesOf(a.to_time) > minutesOf(candidate.start_time)
    );
  });
  if (conflicts.length) {
    checks.push({
      code: "tillganglighet",
      severity: "warn",
      label: "Markerad otillgänglig",
      detail: conflicts
        .map((c) => `${c.from_time.slice(0, 5)}–${c.to_time.slice(0, 5)}${c.note ? ` (${c.note})` : ""}`)
        .join(", "),
    });
  }

  // Kompetenskrav
  if (ctx.requiredCompetency && !ctx.competencies.includes(ctx.requiredCompetency)) {
    checks.push({
      code: "kompetens",
      severity: "block",
      label: "Saknar kompetens",
      detail: `Skifttypen kräver ${ctx.requiredCompetency}.`,
    });
  }

  // Mertid mot sysselsättningsgrad
  const fullTime = ctx.fullTimeWeekMinutes ?? 40 * 60;
  const contracted = fullTime * (ctx.employmentRate ?? 1);
  const plannedWeek =
    others.filter((s) => week.includes(s.date)).reduce((sum, s) => sum + shiftMinutes(s), 0) +
    shiftMinutes(candidate);
  if (contracted > 0 && plannedWeek > contracted + 30) {
    checks.push({
      code: "mertid",
      severity: "warn",
      label: "Mertid",
      detail: `${formatMinutes(plannedWeek)} planerat mot ${formatMinutes(contracted)} kontrakterat.`,
    });
  }

  return checks;
}

export const worstSeverity = (checks: RuleCheck[]): CheckSeverity | null =>
  checks.some((c) => c.severity === "block")
    ? "block"
    : checks.some((c) => c.severity === "warn")
      ? "warn"
      : checks.length
        ? "info"
        : null;

/* ------------------------------------------------------ förslagsmotorn */

export interface CandidateInput {
  employee_id: string;
  name: string;
  employmentRate: number;
  birthDate: string | null;
  competencies: string[];
  availability: Availability[];
  shifts: Shift[];
  /** Frånvaro (semester/sjuk) som datumintervall. */
  absences?: { from: string; to: string; label: string }[];
}

export interface Suggestion {
  employee_id: string;
  name: string;
  score: number;
  blocked: boolean;
  plannedWeekMinutes: number;
  contractedWeekMinutes: number;
  reasons: string[];
  checks: RuleCheck[];
}

/**
 * Rangordnar kandidater för ett pass: kompetens → tillgänglighet → frånvaro →
 * regelbrott → minst schemalagda timmar mot sysselsättningsgrad (deltid först).
 */
export function suggestCandidates(
  shift: Pick<Shift, "date" | "start_time" | "end_time" | "break_minutes">,
  candidates: CandidateInput[],
  opts: { requiredCompetency?: string | null; fullTimeWeekMinutes?: number; limit?: number } = {},
): Suggestion[] {
  const fullTime = opts.fullTimeWeekMinutes ?? 40 * 60;
  const week = weekDates(shift.date);

  const scored = candidates.map<Suggestion>((c) => {
    const checks = checkShift(shift, {
      shifts: c.shifts,
      availability: c.availability,
      competencies: c.competencies,
      birthDate: c.birthDate,
      employmentRate: c.employmentRate,
      requiredCompetency: opts.requiredCompetency,
      absences: c.absences,
      fullTimeWeekMinutes: fullTime,
    });
    const absence = (c.absences ?? []).find((a) => a.from <= shift.date && a.to >= shift.date);
    const plannedWeek = c.shifts
      .filter((s) => week.includes(s.date) && s.status !== "cancelled")
      .reduce((sum, s) => sum + shiftMinutes(s), 0);
    const contracted = fullTime * (c.employmentRate ?? 1);
    const reasons: string[] = [];
    let score = 100;

    const hasCompetency = !opts.requiredCompetency || c.competencies.includes(opts.requiredCompetency);
    if (hasCompetency) reasons.push(opts.requiredCompetency ? `Har ${opts.requiredCompetency}` : "Inga kompetenskrav");
    else score -= 60;

    const wants = c.availability.some(
      (a) =>
        a.type === "onskar" &&
        ((a.date && a.date === shift.date) || (!a.date && a.weekday === weekdayOf(shift.date))),
    );
    if (wants) {
      score += 12;
      reasons.push("Har önskat denna tid");
    }
    if (checks.some((k) => k.code === "tillganglighet")) {
      score -= 25;
      reasons.push("Markerad otillgänglig");
    } else {
      reasons.push("Inget tillgänglighetshinder");
    }

    if (absence || checks.some((k) => k.code === "franvaro")) {
      score -= 100;
      reasons.push(`Frånvaro: ${absence?.label ?? "registrerad"}`);
    }

    const rest = checks.find((k) => k.code === "dygnsvila");
    if (rest) {
      score -= 100;
      reasons.push(rest.label);
    }
    const weekRest = checks.find((k) => k.code === "veckovila");
    if (weekRest) {
      score -= 20;
      reasons.push(weekRest.label);
    }
    if (checks.some((k) => k.code === "minderarig" && k.severity === "block")) {
      score -= 100;
      reasons.push("Minderårig-regel");
    }

    const fillRatio = contracted > 0 ? plannedWeek / contracted : 1;
    score += Math.round((1 - Math.min(fillRatio, 1.5)) * 30);
    reasons.push(
      contracted > 0
        ? `${formatMinutes(plannedWeek)} av ${formatMinutes(contracted)} denna vecka`
        : `${formatMinutes(plannedWeek)} planerat denna vecka`,
    );
    if (checks.some((k) => k.code === "mertid")) reasons.push("Skulle ge mertid");

    const blocked =
      !hasCompetency || Boolean(absence) || checks.some((k) => k.code === "franvaro" || k.severity === "block");

    return {
      employee_id: c.employee_id,
      name: c.name,
      score,
      blocked,
      plannedWeekMinutes: plannedWeek,
      contractedWeekMinutes: contracted,
      reasons,
      checks,
    };
  });

  return scored
    .sort((a, b) => Number(a.blocked) - Number(b.blocked) || b.score - a.score)
    .slice(0, opts.limit ?? 5);
}
