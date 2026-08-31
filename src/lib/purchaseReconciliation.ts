/**
 * Behovsavstämning: gemensamma begrepp för kundbehov kontra grossistbeställning.
 *
 * Viktig avgränsning: "Behovsdifferens" (Beställt − Kundbehov) är INTE samma sak
 * som grossistorderns befintliga "Avvikelse", som är en leveransavvikelse
 * (Beställt vs Packat/Mottaget). De två får aldrig blandas samman.
 */

/** Grossistorderstatusar som räknas som öppna, dvs. ännu inte avslutade. */
export const OPEN_SHOP_ORDER_STATUSES = ["Ny", "Pågående", "Packad", "Skickad"] as const;

/** Statusar som aldrig ska räknas in i beställd mängd. */
export const IGNORED_SHOP_ORDER_STATUSES = ["Avbruten"] as const;

export type ReconStatus = "tackt" | "saknas" | "kontrollera" | "info";

export const RECON_STATUS_LABELS: Record<ReconStatus, string> = {
  tackt: "Täckt",
  saknas: "Saknas",
  kontrollera: "Kontrollera",
  info: "Info",
};

/**
 * Statuspill i samma stil som orderlistans befintliga statusar: ljus bakgrund,
 * dämpad ram och text som alltid följer med färgen.
 */
export const RECON_STATUS_PILL: Record<ReconStatus, string> = {
  tackt: "bg-success/15 text-success border-success/20",
  saknas: "bg-destructive/10 text-destructive border-destructive/20",
  kontrollera: "bg-warning/15 text-warning border-warning/20",
  info: "bg-muted text-muted-foreground border-border",
};

export const RECON_STATUS_HINTS: Record<ReconStatus, string> = {
  tackt: "Beställt täcker kundbehovet och produktmatchningen är säker.",
  saknas: "Beställt understiger kundbehovet, eller produkten saknas i grossistordern.",
  kontrollera: "Osäker produktmatchning — ingen differens räknas förrän matchningen bekräftats manuellt.",
  info: "Produkten är inte markerad som grossistvara.",
};

/** Texten som visas när beställt kraftigt överstiger kundbehovet. */
export const SURPLUS_WARNING = "Stort överskott – kontrollera svinnrisk";

/**
 * Normaliserad nyckel för varunamn. Samma princip som databasens
 * shopify_match_key så att kandidatförslagen känns igen från övriga flöden.
 */
export const matchKey = (v?: string | null) =>
  (v ?? "")
    .toLowerCase()
    .replace(/[åäàá]/g, "a")
    .replace(/[öø]/g, "o")
    .replace(/[üú]/g, "u")
    .replace(/[éèê]/g, "e")
    .replace(/[^a-z0-9]/g, "");

/** kg visas med en decimal, styck utan — samma regel som i Totallistan. */
export const qtyText = (v: number, unit: string) =>
  Number(v || 0).toLocaleString("sv-SE", {
    minimumFractionDigits: unit === "kg" ? 1 : 0,
    maximumFractionDigits: unit === "kg" ? 1 : 0,
  });

/** Differens med tecken. Noll visas som 0 utan tecken. */
export const diffText = (v: number, unit: string) => {
  const n = Number(v || 0);
  if (Math.abs(n) < 0.05) return qtyText(0, unit);
  return `${n > 0 ? "+" : "−"}${qtyText(Math.abs(n), unit)}`;
};

/** Mängd som ska visas som "–" när den är noll (aldrig "0"). */
export const dashIfZero = (v: number, unit: string) =>
  Math.abs(Number(v || 0)) < 0.005 ? "–" : `${qtyText(v, unit)} ${unit}`;

export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Måndag i samma ISO-vecka som datumet. */
export const mondayOf = (d: Date) => {
  const r = new Date(d);
  const day = r.getDay() || 7;
  r.setDate(r.getDate() - (day - 1));
  r.setHours(0, 0, 0, 0);
  return r;
};

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

/** ISO-veckonummer och ISO-år. */
export function isoWeekOf(dateIso: string) {
  const d = new Date(dateIso + "T00:00:00");
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: t.getUTCFullYear() };
}

/** Måndagen i veckan som innehåller ett veckonummer, utifrån ett referensdatum. */
export const weekRange = (monday: Date) => ({
  from: isoDate(monday),
  to: isoDate(addDays(monday, 6)),
});
