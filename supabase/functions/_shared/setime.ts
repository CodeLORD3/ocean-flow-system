/**
 * Svensk tid på ett enda ställe.
 *
 * Allt som rör datum, dygnsgränser och klockslag i stämpelklockan, attesten och
 * löneunderlaget ska gå genom den här modulen. Zonen anges alltid som IANA-zonen
 * Europe/Stockholm — aldrig som fast offset (+01:00/+02:00), eftersom ett fast
 * offset blir fel varje gång sommartiden växlar.
 */

export const SE_ZONE = "Europe/Stockholm";

const dateFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: SE_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: SE_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const partsFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: SE_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const asDate = (value: string | number | Date): Date =>
  value instanceof Date ? value : new Date(value);

/** Svenskt datum, ÅÅÅÅ-MM-DD. */
export function svenskDatum(value: string | number | Date = new Date()): string {
  return dateFmt.format(asDate(value));
}

/** Svensk tid, TT:MM:SS. */
export function svenskTid(value: string | number | Date = new Date()): string {
  return timeFmt.format(asDate(value)).replace(/\./g, ":");
}

/** Svensk tidsstämpel för visning: "ÅÅÅÅ-MM-DD TT:MM:SS". */
export function svenskStampel(value: string | number | Date = new Date()): string {
  return `${svenskDatum(value)} ${svenskTid(value)}`;
}

/**
 * Zonens offset i minuter för en given tidpunkt (60 vintertid, 120 sommartid).
 * Räknas fram genom att jämföra den lokala väggklockan med UTC — det gör att
 * övergångarna sköter sig själva, även framtida regeländringar.
 */
export function svenskZonOffsetMinuter(value: string | number | Date = new Date()): number {
  const d = asDate(value);
  const parts = partsFmt.formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - d.getTime()) / 60_000);
}

/** Samma offset uttryckt som "+02:00" — bara för visning/felsökning. */
export function svenskZonOffset(value: string | number | Date = new Date()): string {
  const minutes = svenskZonOffsetMinuter(value);
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * Gör en svensk väggklockstid till en riktig tidpunkt.
 *
 * Offsetet gissas först utifrån en ungefärlig tidpunkt och korrigeras sedan en
 * gång, vilket räcker för alla verkliga fall inklusive timmarna runt en
 * sommartidsväxling.
 */
export function svenskTidpunkt(datum: string, klockslag = "00:00:00"): Date {
  const hhmmss = klockslag.length === 5 ? `${klockslag}:00` : klockslag.slice(0, 8);
  const naive = Date.parse(`${datum}T${hhmmss}Z`);
  let guess = svenskZonOffsetMinuter(new Date(naive));
  let result = new Date(naive - guess * 60_000);
  const actual = svenskZonOffsetMinuter(result);
  if (actual !== guess) {
    guess = actual;
    result = new Date(naive - guess * 60_000);
  }
  return result;
}

/** Dygnets början i svensk tid. */
export function svenskDagStart(datum: string): Date {
  return svenskTidpunkt(datum, "00:00:00");
}

/** Dygnets slut i svensk tid (exklusiv gräns: nästa dygns start). */
export function svenskDagSlut(datum: string): Date {
  return svenskTidpunkt(nastaDag(datum), "00:00:00");
}

/** Sista sekunden i dygnet — för frågor som använder inklusiv övre gräns. */
export function svenskDagSista(datum: string): Date {
  return svenskTidpunkt(datum, "23:59:59");
}

const dayMs = 86_400_000;

/** Datumaritmetik på svenska datum utan att UTC läcker in. */
export function laggTillDagar(datum: string, dagar: number): string {
  return svenskDatum(new Date(Date.parse(`${datum}T12:00:00Z`) + dagar * dayMs));
}

export const nastaDag = (datum: string) => laggTillDagar(datum, 1);
export const foregaendeDag = (datum: string) => laggTillDagar(datum, -1);

/** Passgränser i svensk tid. Pass som slutar tidigare än det börjar går över midnatt. */
export function passGranser(datum: string, start: string, slut: string): { from: Date; to: Date } {
  const from = svenskTidpunkt(datum, start.slice(0, 5));
  let to = svenskTidpunkt(datum, slut.slice(0, 5));
  if (to <= from) to = svenskTidpunkt(nastaDag(datum), slut.slice(0, 5));
  return { from, to };
}

/** ISO-veckodag 1–7 (mån–sön) för ett svenskt datum. */
export function svenskVeckodag(datum: string): number {
  const d = new Date(`${datum}T12:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

/** Minut på dygnet (0–1439) för en tidpunkt, räknat i svensk tid. */
export function svenskMinutPaDygnet(value: string | number | Date): number {
  const [h, m] = svenskTid(value).split(":").map(Number);
  return h * 60 + m;
}
