/**
 * Vilket datum en webborder gäller.
 *
 * Shopify skickar bara när ordern LADES, aldrig när den ska hämtas eller
 * levereras. Reglerna är butikens egna:
 *
 *   Hämta i butik  → nästkommande torsdag räknat från måndagsstoppet.
 *                    Order senast måndag 23:59 → torsdag samma vecka.
 *                    Order från tisdag och framåt → torsdag veckan efter.
 *   Hemleverans    → datumet som står i leveransrubriken (fraktalternativets
 *                    namn/beskrivning). Saknas eller ligger bakåt i tiden
 *                    används samma torsdagsregel.
 *   Event          → datumet i produktnamnet/beskrivningen om det går att
 *                    läsa ut, annars markeras ordern som event utan datum.
 *
 * Alla datum räknas i butikens lokala tid (Europa), aldrig i UTC.
 */

const MONTHS: Record<string, number> = {
  // svenska
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6, juli: 7,
  augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  // engelska
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10,
  sept: 9,
  // tyska (Zollikon)
  januar: 1, februar: 2, "märz": 3, maerz: 3, mai: 5, juni_de: 6, oktober_de: 10, dezember: 12,
  // franska (Morges)
  janvier: 1, "février": 2, fevrier: 2, mars_fr: 3, avril: 4, juin: 6, juillet: 7,
  "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, "décembre": 12, decembre: 12,
};

function monthOf(raw: string): number | null {
  const k = raw.toLowerCase().replace(/\.$/, "").trim();
  if (MONTHS[k]) return MONTHS[k];
  const hit = Object.keys(MONTHS).find((m) => k.length >= 3 && m.startsWith(k));
  return hit ? MONTHS[hit] : null;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Butikens lokala datum (Europa) för ett tidsstämpel. */
export function localDate(ts: string | Date, timeZone = "Europe/Stockholm"): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  const day = isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(day);
}

const asUtc = (isoDate: string) => new Date(isoDate + "T00:00:00Z");
/** Mån=1 … Sön=7 */
const weekday = (isoDate: string) => asUtc(isoDate).getUTCDay() || 7;
const addDays = (isoDate: string, n: number) => {
  const d = asUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Torsdagen ordern gäller: första måndagen som är orderdagen eller senare är
 * stoppdagen, torsdagen tre dagar efter den är leveransdagen.
 *   mån 10 aug → tor 13 aug · tis 11 aug → tor 20 aug · sön 16 aug → tor 20 aug
 */
export function pickupThursday(orderLocalDate: string): string {
  const wd = weekday(orderLocalDate);
  const daysToMonday = wd === 1 ? 0 : 8 - wd;
  return addDays(orderLocalDate, daysToMonday + 3);
}

/**
 * Letar ett datum i fritext: "2026-08-20", "20/8", "20.8.2026",
 * "torsdag 20 augusti", "August 20", "Donnerstag 20. August".
 * Saknas årtal väljs det årtal som lägger datumet närmast framåt i tiden.
 */
export function findDateInText(raw: string | null | undefined, todayIso: string): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const full = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (full) return iso(Number(full[1]), Number(full[2]), Number(full[3]));

  const dmy = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return iso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const lower = s.toLowerCase();

  const words = lower.match(/(\d{1,2})\s*\.?\s+([a-zåäöéûôü]+)\.?(?:\s+(\d{4}))?/);
  const wm = words ? monthOf(words[2]) : null;
  if (wm) return withYear(Number(words![1]), wm, words![3], todayIso);

  const enWords = lower.match(/([a-zåäöéûôü]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?/);
  const em = enWords ? monthOf(enWords[1]) : null;
  if (em) return withYear(Number(enWords![2]), em, enWords![3], todayIso);

  const dm = lower.match(/\b(\d{1,2})[/.](\d{1,2})\b/);
  if (dm) return withYear(Number(dm[1]), Number(dm[2]), undefined, todayIso);

  return null;
}

function withYear(day: number, month: number, year: string | undefined, todayIso: string): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year) return iso(Number(year), month, day);
  const y = Number(todayIso.slice(0, 4));
  const candidate = iso(y, month, day);
  // Ett datum som redan passerat med mer än en månad gäller nästa år.
  if (candidate < addDays(todayIso, -31)) return iso(y + 1, month, day);
  return candidate;
}

/** Alla texter i ordern som kan bära ett leveransdatum. */
export function deliveryTexts(payload: any): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = String(v ?? "").trim();
    if (s) out.push(s);
  };
  for (const a of Array.isArray(payload?.note_attributes) ? payload.note_attributes : []) {
    const k = String(a?.name ?? a?.key ?? "").toLowerCase();
    if (/date|datum|delivery|leverans|lieferung|livraison|pickup|abhol/.test(k)) push(a?.value);
  }
  for (const l of Array.isArray(payload?.shipping_lines) ? payload.shipping_lines : []) {
    push(l?.title);
    push(l?.code);
    push(l?.source);
  }
  push(payload?.note);
  return out;
}

/** Texter i orderraderna som kan bära ett eventdatum. */
export function eventTexts(lineItems: any[]): string[] {
  const out: string[] = [];
  for (const li of lineItems || []) {
    const t = String(li?.title ?? li?.name ?? "").trim();
    if (t) out.push(t);
    if (String(li?.variant_title ?? "").trim()) out.push(String(li.variant_title).trim());
    for (const p of Array.isArray(li?.properties) ? li.properties : []) {
      const v = String(p?.value ?? "").trim();
      if (v) out.push(`${String(p?.name ?? "")} ${v}`);
    }
  }
  return out;
}

export interface WantedDateResult {
  wantedDate: string;
  source: "leveransrubrik" | "eventdatum" | "torsdagsregel";
  note: string | null;
  eventWithoutDate: boolean;
}

/**
 * Räknar ut vilket datum ordern gäller enligt butikens regler.
 * `orderLocalDate` är dagen ordern lades i butikens tid.
 */
export function resolveWantedDate(opts: {
  payload: any;
  lineItems: any[];
  isPickup: boolean;
  allEventLines: boolean;
  orderLocalDate: string;
}): WantedDateResult {
  const { payload, lineItems, isPickup, allEventLines, orderLocalDate } = opts;
  const thursday = pickupThursday(orderLocalDate);

  if (allEventLines) {
    for (const t of eventTexts(lineItems)) {
      const d = findDateInText(t, orderLocalDate);
      if (d && d >= orderLocalDate) {
        return { wantedDate: d, source: "eventdatum", note: `Eventdatum läst ur "${t}"`, eventWithoutDate: false };
      }
    }
    return {
      wantedDate: thursday,
      source: "torsdagsregel",
      note: "EVENT — datum saknas i produkttexten, kontrollera eventdatumet manuellt",
      eventWithoutDate: true,
    };
  }

  /**
   * Står ett datum i kassans uppgifter (leveransrubrik, "Delivery Date") gäller
   * det alltid — även vid hämtning, så att butiker som skickar ett hämtdatum
   * behåller sitt. Torsdagsregeln används först när inget datum finns.
   */
  for (const t of deliveryTexts(payload)) {
    const d = findDateInText(t, orderLocalDate);
    if (d && d >= orderLocalDate) {
      return { wantedDate: d, source: "leveransrubrik", note: `Datum läst ur "${t}"`, eventWithoutDate: false };
    }
  }


  return {
    wantedDate: thursday,
    source: "torsdagsregel",
    note: isPickup
      ? "Hämtdatum enligt torsdagsregeln"
      : "Leveransrubriken saknade datum — torsdagsregeln användes",
    eventWithoutDate: false,
  };
}
