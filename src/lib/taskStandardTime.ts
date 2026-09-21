/**
 * Standardtid för en uppgift, delad i de fem delarna av arbetsflödet:
 * hämta → förbereda → utföra → kontrollera → återställa.
 * Summan är uppgiftens standardtid. I Genomför visas bara summan.
 */

export type StandardTimeParts = {
  fetch: number | null;
  prepare: number | null;
  doWork: number | null;
  check: number | null;
  restore: number | null;
};

export const PART_LABELS: { key: keyof StandardTimeParts; label: string }[] = [
  { key: "fetch", label: "Hämta utrustning" },
  { key: "prepare", label: "Förbereda" },
  { key: "doWork", label: "Utföra" },
  { key: "check", label: "Kontrollera" },
  { key: "restore", label: "Återställa" },
];

type PartRow = {
  std_fetch_minutes?: number | null;
  std_prepare_minutes?: number | null;
  std_do_minutes?: number | null;
  std_check_minutes?: number | null;
  std_restore_minutes?: number | null;
  estimated_minutes?: number | null;
};

export function standardParts(row: PartRow | null | undefined): StandardTimeParts {
  return {
    fetch: row?.std_fetch_minutes ?? null,
    prepare: row?.std_prepare_minutes ?? null,
    doWork: row?.std_do_minutes ?? null,
    check: row?.std_check_minutes ?? null,
    restore: row?.std_restore_minutes ?? null,
  };
}

export function partsSum(parts: StandardTimeParts): number | null {
  const values = PART_LABELS.map((p) => parts[p.key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0);
}

/** Standardtiden: summan av delarna om de finns, annars den beräknade tiden. */
export function standardMinutes(row: PartRow | null | undefined): number | null {
  const sum = partsSum(standardParts(row));
  return sum ?? row?.estimated_minutes ?? null;
}

export function minutesText(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return null;
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** Minuter mellan två tidpunkter, aldrig negativt. */
export function minutesBetween(from: string | Date, to: string | Date) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.max(0, Math.round(((b - a) / 60000) * 10) / 10);
}

export const PAUSE_REASONS = [
  { value: "kund", label: "Kund" },
  { value: "material", label: "Väntar på material" },
  { value: "kollega", label: "Väntar på kollega" },
  { value: "annat", label: "Annat" },
];

export function pauseReasonLabel(value: string | null | undefined) {
  return PAUSE_REASONS.find((r) => r.value === value)?.label ?? "Annat";
}

export type RunStatus = "ej_startad" | "pagar" | "pausad" | "klar";

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  ej_startad: "Ej startad",
  pagar: "Pågår",
  pausad: "Pausad",
  klar: "Klar",
};
