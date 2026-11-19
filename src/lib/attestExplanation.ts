/**
 * Klartext om hur en dag attesterades: vem, när, med vilket underlag och vad som
 * därför betalas eller inte. Bygger bara på attestraden — räknar inga minuter själv.
 */
import { partsOf, type AttestPart, type PartDecisionRow, type PartsAttestation } from "@/lib/attestParts";

export interface ExplainAttestation extends PartsAttestation {
  approved_minutes?: number | null;
  decided_at?: string | null;
  decided_by?: string | null;
}

const TZ = "Europe/Stockholm";
const dayKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : "–";

/** "i dag kl. 12:48", "i går kl. 09:10" eller "17 nov kl. 08:00". */
export function whenText(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const day =
    dayKey(d) === dayKey(now)
      ? "i dag"
      : dayKey(d) === dayKey(yesterday)
        ? "i går"
        : new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: TZ }).format(d).replace(".", "");
  return `${day} kl. ${clock(iso)}`;
}

/** "9 minuterna" eller "1 h 03 min". */
const len = (m: number) => (m < 60 ? `${m} minuterna` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);
const late = (m: number) => (m < 60 ? `de ${m} sena minuterna på morgonen` : `den sena starten (${lenParen(m)})`);
const lenParen = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);

type Effect = { paid: boolean; text: string };

/** Vad ett beslut på en avvikelse innebär. paid = tiden räknas som arbetad. */
function effectOf(p: AttestPart, decision: PartDecisionRow["decision"] | "schema_hela" | "stamplad_hela"): Effect {
  const schema = decision === "schema" || decision === "schema_hela";
  const approved = decision === "godkand" || decision === "stamplad_hela";
  switch (p.kind) {
    case "sen_in":
      return schema
        ? { paid: true, text: `${late(p.minutes)} räknas som arbetade` }
        : { paid: false, text: `${late(p.minutes)} dras av` };
    case "tidig_ut":
      return schema
        ? { paid: true, text: `de ${len(p.minutes)} före schemats slut (${clock(p.sched)}) räknas som arbetade` }
        : { paid: false, text: `de ${len(p.minutes)} före schemats slut (${clock(p.sched)}) dras av` };
    case "missat_pass":
      return schema
        ? { paid: true, text: `passet ${clock(p.sched)}–${clock(p.sched_end)} betalas trots att stämpling saknas` }
        : { paid: false, text: `passet ${clock(p.sched)}–${clock(p.sched_end)} betalas inte eftersom stämpling saknas` };
    case "tidig_in":
      return { paid: approved, text: `tiden före ${clock(p.sched)} (${lenParen(p.minutes)}) ${approved ? "betalas" : "betalas inte"}` };
    case "sen_ut":
      return { paid: approved, text: `tiden efter ${clock(p.sched)} (${lenParen(p.minutes)}) ${approved ? "betalas" : "betalas inte"}` };
    case "oplanerad":
      return {
        paid: approved,
        text: `den oschemalagda tiden ${clock(p.stamp)}–${clock(p.stamp_end)} (${lenParen(p.minutes)}) ${approved ? "betalas" : "betalas inte"}`,
      };
    case "schemaandring":
      return { paid: approved, text: `tiden schemat utökades med i efterhand (${lenParen(p.minutes)}) ${approved ? "betalas" : "betalas inte"}` };
  }
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Betalt först, sedan det som inte betalas: "A, men B." */
function joinEffects(effects: Effect[]): string {
  const paid = effects.filter((e) => e.paid).map((e) => e.text);
  const unpaid = effects.filter((e) => !e.paid).map((e) => e.text);
  const p = paid.join(" och ");
  const u = unpaid.join(" och ");
  if (p && u) return `${cap(p)}, men ${u}.`;
  return `${cap(p || u)}.`;
}

/**
 * Hela förklaringen. `accountOf` ger kontots namn/e-post för ett användar-id.
 */
export function explainAttestation(
  a: ExplainAttestation,
  accountOf: (userId: string) => string | null | undefined,
  now: Date = new Date(),
): string {
  const parts = partsOf(a);
  const decisions = a.part_decisions ?? {};
  const account = (id?: string | null) => (id ? accountOf(id) || "okänt konto" : null);
  const accountSentence = (id?: string | null) => {
    const label = account(id);
    return label ? ` Beslutet togs från kontot ${label}.` : "";
  };

  if (a.status === "auto_approved") return "Godkänd automatiskt: stämplingen följer schemat.";
  if (a.status === "rejected") {
    return `Dagen nekades${a.decided_at ? ` ${whenText(a.decided_at, now)}` : ""}. Ingen tid betalas.${accountSentence(a.decided_by)}`;
  }

  if (a.status === "approved" && a.basis === "schema") {
    const head = `Dagen attesterades${a.decided_at ? ` ${whenText(a.decided_at, now)}` : ""} med Schematid för hela dagen. Då betalas bara schemat.`;
    const body = parts.length ? ` ${joinEffects(parts.map((p) => effectOf(p, "schema_hela")))}` : "";
    return `${head}${body}${accountSentence(a.decided_by)}`;
  }
  if (a.status === "approved" && a.basis === "stamplad") {
    const head = `Dagen attesterades${a.decided_at ? ` ${whenText(a.decided_at, now)}` : ""} med Stämplad tid för hela dagen. All stämplad tid betalas.`;
    return `${head}${accountSentence(a.decided_by)}`;
  }
  if (a.status === "approved" && a.basis === "justerad") {
    const h = ((a.approved_minutes ?? 0) / 60).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `Dagen justerades manuellt${a.decided_at ? ` ${whenText(a.decided_at, now)}` : ""} till ${h} h betald tid.${accountSentence(a.decided_by)}`;
  }

  // Beslut per avvikelse (även flaggade dagar där bara vissa delar är beslutade).
  const decided = parts.filter((p) => decisions[p.kind]);
  const pending = parts.filter((p) => !decisions[p.kind]);
  if (!parts.length) {
    return a.status === "flagged" ? "Väntar på attest." : "Attesterad.";
  }
  const pieces: string[] = [];
  if (decided.length) {
    const latest = decided
      .map((p) => decisions[p.kind]?.at)
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() ?? a.decided_at ?? null;
    pieces.push(`${decided.length === 1 ? "Avvikelsen" : "Avvikelserna"} attesterades${latest ? ` ${whenText(latest, now)}` : ""}.`);
    pieces.push(joinEffects(decided.map((p) => effectOf(p, decisions[p.kind]!.decision))));
    const by = [...new Set(decided.map((p) => decisions[p.kind]?.by).filter((x): x is string => Boolean(x)))];
    const labels = by.map((id) => account(id)).filter(Boolean);
    if (labels.length) pieces.push(`Beslutet togs från kontot ${labels.join(" och ")}.`);
  }
  if (pending.length) {
    pieces.push(
      `${pending.length === 1 ? "1 avvikelse väntar" : `${pending.length} avvikelser väntar`} på attest. Tiden utanför schemat betalas inte förrän den är godkänd.`,
    );
  }
  return pieces.join(" ");
}
