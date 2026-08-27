/**
 * Deterministisk parser för schemaimport (etapp 3 E).
 *
 * Filen läses lokalt (xlsx/csv), tolkas till standardformatet och matchas mot
 * personal i tre steg: anställningsnummer exakt → personnummer (normaliserat,
 * matchas via den säkra databasfunktionen — aldrig klartext i logg) → namn
 * fuzzy med förslag. Resultatet går ALLTID via granskningsvyn.
 */
import * as XLSX from "xlsx";

export const IMPORT_COLUMNS = [
  "datum",
  "starttid",
  "sluttid",
  "rast_min",
  "anstallningsnummer",
  "personnummer",
  "namn",
  "enhet",
  "skifttyp",
  "notering",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export interface RawRow {
  index: number;
  values: Record<string, string>;
}

export interface ParsedRow {
  index: number;
  raw: Record<string, string>;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  employment_number: string | null;
  pnr: string | null;
  name: string | null;
  store_hint: string | null;
  shift_type_hint: string | null;
  note: string | null;
  errors: string[];
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, maj: 5, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
};

const normKey = (k: string) =>
  k
    .toLowerCase()
    .trim()
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[\s.-]+/g, "_");

const COLUMN_ALIASES: Record<string, ImportColumn> = {
  datum: "datum",
  date: "datum",
  dag: "datum",
  starttid: "starttid",
  start: "starttid",
  fran: "starttid",
  sluttid: "sluttid",
  slut: "sluttid",
  till: "sluttid",
  rast_min: "rast_min",
  rast: "rast_min",
  rastminuter: "rast_min",
  anstallningsnummer: "anstallningsnummer",
  anstnr: "anstallningsnummer",
  anstallningsnr: "anstallningsnummer",
  personnummer: "personnummer",
  pnr: "personnummer",
  namn: "namn",
  name: "namn",
  enhet: "enhet",
  butik: "enhet",
  store: "enhet",
  skifttyp: "skifttyp",
  passtyp: "skifttyp",
  typ: "skifttyp",
  notering: "notering",
  kommentar: "notering",
};

/** Tåligt datum: 2026-09-01, 1/9, 1/9-26, "mån 1 sep", Excel-serienummer. */
export function parseDate(value: string, fallbackYear = new Date().getFullYear()): string | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return iso(y, m, d);
  }
  if (/^\d{5}$/.test(v)) {
    const serial = Number(v);
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 864e5);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  let m = v.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fallbackYear;
    return iso(year, Number(m[2]), Number(m[1]));
  }
  m = v.match(/(\d{1,2})\s*([a-zåäö]{3,})\.?\s*(\d{2,4})?/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3)];
    if (mon) {
      const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : fallbackYear;
      return iso(year, mon, Number(m[1]));
    }
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (!y || !m || !d || m > 12 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Tider med eller utan kolon: 8, 08, 8:30, 0830, 8.30, 08:30:00. */
export function parseTime(value: string): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/^0?\.\d+$/.test(v) || /^0,\d+$/.test(v)) {
    const frac = Number(v.replace(",", "."));
    const mins = Math.round(frac * 1440);
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  let m = v.match(/^(\d{1,2})[:.,](\d{1,2})/);
  if (m) return clampTime(Number(m[1]), Number(m[2]));
  m = v.match(/^(\d{3,4})$/);
  if (m) {
    const s = m[1].padStart(4, "0");
    return clampTime(Number(s.slice(0, 2)), Number(s.slice(2)));
  }
  m = v.match(/^(\d{1,2})$/);
  if (m) return clampTime(Number(m[1]), 0);
  return null;
}

function clampTime(h: number, min: number): string | null {
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function normalizePnr(value: string): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 12) return digits;
  if (digits.length === 10) {
    const yy = Number(digits.slice(0, 2));
    const century = yy > Number(String(new Date().getFullYear()).slice(2)) ? "19" : "20";
    return century + digits;
  }
  return null;
}

/** Läser en xlsx/csv-fil till råa rader med normaliserade kolumnnamn. */
export async function readFileRows(file: File): Promise<{ rows: RawRow[]; headers: string[] }> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const table = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  const headers = table.length ? Object.keys(table[0]) : [];
  const rows = table.map((r, i) => ({
    index: i + 2,
    values: Object.fromEntries(Object.entries(r).map(([k, v]) => [normKey(k), String(v ?? "").trim()])),
  }));
  return { rows, headers };
}

/** Ser filen ut som mallen? Annars går den till AI-fallbacken. */
export function looksLikeTemplate(rows: RawRow[]): boolean {
  if (!rows.length) return false;
  const keys = new Set(Object.keys(rows[0].values));
  const mapped = [...keys].map((k) => COLUMN_ALIASES[k]).filter(Boolean);
  return mapped.includes("datum") && mapped.includes("starttid") && mapped.includes("sluttid");
}

export function parseRows(rows: RawRow[]): ParsedRow[] {
  return rows.map((row) => {
    const get = (col: ImportColumn): string => {
      for (const [key, value] of Object.entries(row.values)) {
        if (COLUMN_ALIASES[key] === col && value) return value;
      }
      return "";
    };
    const errors: string[] = [];
    const date = parseDate(get("datum"));
    if (!date) errors.push(`Datum kunde inte tolkas: "${get("datum") || "tomt"}"`);
    const start = parseTime(get("starttid"));
    if (!start) errors.push(`Starttid kunde inte tolkas: "${get("starttid") || "tomt"}"`);
    const end = parseTime(get("sluttid"));
    if (!end) errors.push(`Sluttid kunde inte tolkas: "${get("sluttid") || "tomt"}"`);
    const breakRaw = get("rast_min").replace(",", ".");
    const breakMinutes = breakRaw ? Math.max(0, Math.round(Number(breakRaw) || 0)) : 0;

    return {
      index: row.index,
      raw: row.values,
      date,
      start_time: start,
      end_time: end,
      break_minutes: breakMinutes,
      employment_number: get("anstallningsnummer") || null,
      pnr: normalizePnr(get("personnummer")),
      name: get("namn") || null,
      store_hint: get("enhet") || null,
      shift_type_hint: get("skifttyp") || null,
      note: get("notering") || null,
      errors,
    };
  });
}

/* --------------------------------------------------- personmatchning */

export interface MatchTarget {
  employee_id: string;
  name: string;
  employment_number: string | null;
  pnr_last4: string | null;
}

export interface NameSuggestion {
  employee_id: string;
  name: string;
  score: number;
}

const clean = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .trim();

/** Enkel likhet (token-överlapp + prefix) för namnförslag. */
export function nameScore(a: string, b: string): number {
  const ta = clean(a).split(/\s+/).filter(Boolean);
  const tb = clean(b).split(/\s+/).filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  for (const t of ta) {
    if (tb.some((o) => o === t || (t.length > 2 && (o.startsWith(t) || t.startsWith(o))))) hits += 1;
  }
  return hits / Math.max(ta.length, tb.length);
}

export function suggestNames(name: string, targets: MatchTarget[], limit = 3): NameSuggestion[] {
  return targets
    .map((t) => ({ employee_id: t.employee_id, name: t.name, score: nameScore(name, t.name) }))
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export type MatchMethod = "employment_number" | "pnr" | "name" | "none";

export interface MatchResult {
  employee_id: string | null;
  method: MatchMethod;
  suggestions: NameSuggestion[];
}

/**
 * Matchar en rad. pnrLookup slår mot den säkra databasfunktionen så att
 * personnummer aldrig jämförs eller loggas i klartext här.
 */
export async function matchRow(
  row: ParsedRow,
  targets: MatchTarget[],
  pnrLookup: (pnr: string) => Promise<string | null>,
): Promise<MatchResult> {
  if (row.employment_number) {
    const hit = targets.find(
      (t) => t.employment_number && t.employment_number.toLowerCase() === row.employment_number!.toLowerCase(),
    );
    if (hit) return { employee_id: hit.employee_id, method: "employment_number", suggestions: [] };
  }
  if (row.pnr) {
    const id = await pnrLookup(row.pnr);
    if (id) return { employee_id: id, method: "pnr", suggestions: [] };
  }
  if (row.name) {
    const suggestions = suggestNames(row.name, targets);
    if (suggestions.length === 1 && suggestions[0].score >= 0.9) {
      return { employee_id: suggestions[0].employee_id, method: "name", suggestions };
    }
    return { employee_id: null, method: "none", suggestions };
  }
  return { employee_id: null, method: "none", suggestions: [] };
}

/* --------------------------------------------------- mall & AI-underlag */

export interface PromptStaffRow {
  name: string;
  employment_number: string | null;
  employment_rate: number;
  competencies: string[];
  store: string;
}

/** Promptmall (svenska) + personallista som chefen klistrar in i valfri LLM. */
export function buildAiPrompt(
  staff: PromptStaffRow[],
  shiftTypes: string[],
  weekLabel: string,
): string {
  return [
    "Du ska skapa ett veckoschema för en fiskbutik i Makrilltrade.",
    `Vecka: ${weekLabel}.`,
    "",
    "Svara ENDAST med en tabell (CSV med semikolon) med exakt dessa kolumner i denna ordning:",
    "datum;starttid;sluttid;rast_min;anstallningsnummer;personnummer;namn;enhet;skifttyp;notering",
    "",
    "Regler:",
    "- datum som ÅÅÅÅ-MM-DD, tider som HH:MM, rast_min som heltal.",
    "- Använd anställningsnummer när det finns; lämna personnummer tomt.",
    "- skifttyp måste vara en av: " + shiftTypes.join(", "),
    "- Minst 11 timmars dygnsvila och 36 timmars sammanhängande veckovila per person.",
    "- Personer under 18 år får inte schemaläggas före 06:00 eller efter 22:00.",
    "- Håll planerade timmar nära personens sysselsättningsgrad (heltid = 40 h/vecka).",
    "",
    "Personal:",
    ...staff.map(
      (s) =>
        `- ${s.name} (anst.nr ${s.employment_number ?? "saknas"}), ${Math.round(s.employment_rate * 100)} %, enhet ${s.store}${
          s.competencies.length ? `, kompetenser: ${s.competencies.join("/")}` : ""
        }`,
    ),
  ].join("\n");
}

/** Laddar ner en tom xlsx-mall med rätt kolumner. */
export function downloadTemplate(filename = "makrilltrade-schemamall.xlsx") {
  const ws = XLSX.utils.aoa_to_sheet([
    [...IMPORT_COLUMNS],
    ["2026-09-01", "08:00", "17:00", 30, "1001", "", "Exempel Person", "Ålstens Fisk", "Ordinarie", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schema");
  XLSX.writeFile(wb, filename);
}

/** Exporterar en befintlig vecka i samma mall (för round-trip-diff). */
export function exportWeek(
  rows: {
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    employment_number: string | null;
    name: string;
    store: string;
    shift_type: string;
    note: string | null;
  }[],
  filename: string,
) {
  const ws = XLSX.utils.aoa_to_sheet([
    [...IMPORT_COLUMNS],
    ...rows.map((r) => [
      r.date,
      r.start_time.slice(0, 5),
      r.end_time.slice(0, 5),
      r.break_minutes,
      r.employment_number ?? "",
      "",
      r.name,
      r.store,
      r.shift_type,
      r.note ?? "",
    ]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schema");
  XLSX.writeFile(wb, filename);
}
