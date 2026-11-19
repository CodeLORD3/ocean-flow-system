/**
 * Avvikelser mot schemat, en per del av dagen. Tid inom schemat är godkänd direkt;
 * varje del utanför schemat attesteras för sig (decide_attestation_part i databasen,
 * som också räknar om godkänd tid — klienten räknar aldrig minuter själv).
 */
export type PartKind = "tidig_in" | "sen_in" | "tidig_ut" | "sen_ut" | "oplanerad" | "missat_pass" | "schemaandring";
export type PartDecision = "godkand" | "nekad" | "stamplad" | "schema";

export interface AttestPart {
  kind: PartKind;
  minutes: number;
  stamp?: string;
  stamp_end?: string;
  sched?: string;
  sched_end?: string;
}

export interface PartDecisionRow {
  decision: PartDecision;
  by?: string | null;
  at?: string | null;
  note?: string | null;
}

export interface PartsAttestation {
  id: string;
  status: string;
  basis?: string | null;
  computed?: { model?: string; parts?: AttestPart[] } | null;
  part_decisions?: Record<string, PartDecisionRow> | null;
}

/** Extra tid (före/efter schemat eller ej schemalagd) godkänns eller nekas. */
/** "schemaandring": schemat utökades efter att dagen var slut — den nya tiden betalas först efter attest. */
export const EXTRA_KINDS: PartKind[] = ["tidig_in", "sen_ut", "oplanerad", "schemaandring"];

export const PART_TITLE: Record<PartKind, string> = {
  tidig_in: "Stämplade in tidigare",
  sen_in: "Stämplade in senare",
  tidig_ut: "Stämplade ut tidigare",
  sen_ut: "Stämplade ut senare",
  oplanerad: "Ej schemalagd tid",
  missat_pass: "Ingen stämpling på passet",
  schemaandring: "Schemat ändrat i efterhand",
};

export const DECISION_LABEL: Record<PartDecision, string> = {
  godkand: "Godkänd",
  nekad: "Nekad – betalas inte",
  stamplad: "Stämplad tid",
  schema: "Schematid",
};

export const isExtra = (kind: PartKind) => EXTRA_KINDS.includes(kind);

/** Valen chefen har: extra tid godkänns/nekas, kortare tid betalas som stämplat eller schema. */
export function decisionOptions(kind: PartKind): { value: PartDecision; label: string }[] {
  return isExtra(kind)
    ? [
        { value: "godkand", label: "Godkänn" },
        { value: "nekad", label: "Neka" },
      ]
    : [
        { value: "stamplad", label: "Stämplad tid" },
        { value: "schema", label: "Schematid" },
      ];
}

export function partsOf(a: PartsAttestation): AttestPart[] {
  return a.computed?.model === "delar" ? (a.computed.parts ?? []) : [];
}

/** Manuellt justerade eller avslagna dagar har ett helt dagsbeslut — delarna är då bara information. */
export const hasWholeDayDecision = (a: PartsAttestation) =>
  a.status === "rejected" || (a.status === "approved" && a.basis !== "avvikelse");

export function pendingParts(a: PartsAttestation): AttestPart[] {
  if (hasWholeDayDecision(a)) return [];
  const decided = a.part_decisions ?? {};
  return partsOf(a).filter((p) => !decided[p.kind]);
}

/** Beslutet "som stämplat": extra tid godkänd, kortare tid betalas som stämplad. */
export const asStampedDecision = (kind: PartKind): PartDecision => (isExtra(kind) ? "godkand" : "stamplad");

const time = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "–";

export function formatPartMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

/** En rad text som beskriver avvikelsen, t.ex. "In 07:32 · schema 08:00 · 28 min extra". */
export function describePart(p: AttestPart): string {
  const len = formatPartMinutes(p.minutes);
  switch (p.kind) {
    case "tidig_in":
      return `In ${time(p.stamp)} · schema ${time(p.sched)} · ${len} extra`;
    case "sen_in":
      return `In ${time(p.stamp)} · schema ${time(p.sched)} · ${len} kortare`;
    case "tidig_ut":
      return `Ut ${time(p.stamp)} · schema ${time(p.sched)} · ${len} kortare`;
    case "sen_ut":
      return `Ut ${time(p.stamp)} · schema ${time(p.sched)} · ${len} extra`;
    case "oplanerad":
      return `In ${time(p.stamp)} · Ut ${time(p.stamp_end)} · ${len} utan schema`;
    case "missat_pass":
      return `Schema ${time(p.sched)}–${time(p.sched_end)} · ${len}`;
    case "schemaandring":
      return `Först ${time(p.stamp)}–${time(p.stamp_end)} · nu ${time(p.sched)}–${time(p.sched_end)} · ${len} mer`;
  }
}
