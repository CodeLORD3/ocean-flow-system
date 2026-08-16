/**
 * Delad SumUp-logik (etapp 1: hämtning, kö, tolkning av rader).
 *
 * SumUp pushar inte kvitton från POS-appen — vi pollar Transactions API:
 *   1. GET /v2.1/merchants/{mid}/transactions/history   → nya transaction_id
 *   2. GET /v2.1/merchants/{mid}/transactions?id=       → products[], vat_rates[]
 *   3. GET /v1.1/receipts/{id}?mid=                     → receipt_no, card_reader.code
 *
 * Etapp 1 rör aldrig lagret. Rader tolkas men bokförs inte.
 * Belopp kommer som decimaltal i huvudenheter (10.10) och lagras i minsta
 * enhet (rappen/öre). Kortnummer lagras aldrig.
 */

export const SUMUP_BASE = "https://api.sumup.com";

/* ------------------------------------------------------------------ belopp */

/** 10.10 CHF → 1010 rappen. Tål strängar ("10.10") och null. */
export function majorToMinor(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Kortdata får aldrig lagras: last4/pan tvättas bort ur payloaden. */
export function scrubCard(input: any): any {
  if (Array.isArray(input)) return input.map(scrubCard);
  if (input && typeof input === "object") {
    const out: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (/^(last_4_digits|last4|last_four|pan|card_number|masked_pan)$/i.test(key)) continue;
      out[key] = scrubCard(value);
    }
    return out;
  }
  return input;
}

/** SumUps betalsätt → våra koder. */
export function normalizePayment(raw?: string): string {
  const m = (raw ?? "").toLowerCase();
  if (/cash|bar/.test(m)) return "cash";
  if (/card|pos|ec|visa|master|maestro|amex/.test(m)) return "card";
  if (/twint/.test(m)) return "twint";
  if (/invoice|rechnung/.test(m)) return "invoice";
  return "other";
}

/* --------------------------------------------------------- kvantitetstolkning */

export type QuantitySource = "namn_vikt" | "rapporterad" | "harledd_pris" | "okand";

export type SumupLine = {
  name: string;
  /** Namnet utan viktprefix — nyckeln som matchas mot produktregistret. */
  cleanName: string;
  /** Rå kvantitet precis som SumUp skickade den (kan vara heltal även för kg). */
  externalQuantity: number | null;
  /** Kvantitet vi bokför på. */
  quantity: number;
  quantitySource: QuantitySource;
  unitPriceMinor: number;
  lineTotalMinor: number;
  vatRate: number | null;
};

export type RawSumupProduct = {
  name?: string;
  description?: string;
  price?: number | string;
  quantity?: number | string;
  vat_rate?: number | string;
  price_with_vat?: number | string;
  total_with_vat?: number | string;
  total_price?: number | string;
};

/**
 * Tolkar en rad ur products[].
 *
 * Ordning enligt viktvarutestet (docs/sumup-integration.md avsnitt 4):
 *   1. `quantity` bär decimaler (1.24) → rapporterad kvantitet, används rakt.
 *   2. kg-vara där quantity är heltal → härled ur radtotal / kilopris.
 *      Kilopriset tas i första hand ur radens `price`, annars ur dagens
 *      prislista (kgPriceMinor).
 *   3. Går ingen väg → kvantitet 1 med källa "okand", raden flaggas för
 *      granskning i stället för att gissa.
 *
 * `isWeightItem` styrs av produktens enhet i Makrilltrade (kg), inte av SumUp.
 */
/**
 * Zollikons kassa skickar vikten som prefix i artikelnamnet
 * ("0.724 kg Lachs filet") med quantity = 1 och price = radens totalbelopp.
 * Detta är den verkliga vägen enligt viktvarutestet (se docs, avsnitt 4.1).
 */
export function parseNameWeight(
  name: string,
): { quantity: number; cleanName: string; unit: "kg" } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b\s*(.+)$/i.exec(name ?? "");
  if (!m) return null;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  const kg = m[2].toLowerCase() === "g" ? value / 1000 : value;
  const cleanName = m[3].trim();
  if (!cleanName) return null;
  return { quantity: round3(kg), cleanName, unit: "kg" };
}

export function interpretLine(
  raw: RawSumupProduct,
  opts: { isWeightItem?: boolean; kgPriceMinor?: number | null } = {},
): SumupLine {
  const name = String(raw.name ?? raw.description ?? "").trim();
  const unitPriceMinor = majorToMinor(raw.price);
  const lineTotalMinor = majorToMinor(raw.total_with_vat ?? raw.total_price ?? 0);
  const vatRate = raw.vat_rate === undefined || raw.vat_rate === null ? null : Number(raw.vat_rate);

  // 1. Vikten står i namnet — kassans faktiska sätt att sälja kg-varor.
  const named = parseNameWeight(name);
  const rawQty = raw.quantity === undefined || raw.quantity === null ? null : Number(raw.quantity);
  const externalQuantity = rawQty !== null && Number.isFinite(rawQty) ? rawQty : null;

  if (named) {
    const qty = named.quantity;
    return {
      name,
      cleanName: named.cleanName,
      externalQuantity: rawQty !== null && Number.isFinite(rawQty) ? rawQty : null,
      quantity: qty,
      quantitySource: "namn_vikt",
      // price är radens totalbelopp när vikten ligger i namnet — räkna om till kilopris.
      unitPriceMinor: qty > 0 ? Math.round(Math.abs(lineTotalMinor || unitPriceMinor) / qty) : unitPriceMinor,
      lineTotalMinor: lineTotalMinor || unitPriceMinor,
      vatRate,
    };
  }

  // 2. Rapporterad kvantitet med decimaler.
  if (externalQuantity !== null && !Number.isInteger(externalQuantity) && externalQuantity !== 0) {
    return {
      name,
      cleanName: name,
      externalQuantity,
      quantity: round3(Math.abs(externalQuantity)),
      quantitySource: "rapporterad",
      unitPriceMinor,
      lineTotalMinor,
      vatRate,
    };
  }

  if (!opts.isWeightItem) {
    // Styckvara: heltalskvantiteten är sann.
    const qty = externalQuantity !== null && externalQuantity !== 0 ? Math.abs(externalQuantity) : 1;
    return {
      name,
      cleanName: name,
      externalQuantity,
      quantity: qty,
      quantitySource: externalQuantity !== null ? "rapporterad" : "okand",
      unitPriceMinor,
      lineTotalMinor,
      vatRate,
    };
  }

  // 3. Viktvara utan decimaler: härled vikten ur radtotal / kilopris.
  const perKg = unitPriceMinor > 0 ? unitPriceMinor : (opts.kgPriceMinor ?? 0);
  if (perKg > 0 && lineTotalMinor !== 0) {
    return {
      name,
      cleanName: name,
      externalQuantity,
      quantity: round3(Math.abs(lineTotalMinor) / perKg),
      quantitySource: "harledd_pris",
      unitPriceMinor: perKg,
      lineTotalMinor,
      vatRate,
    };
  }

  // 4. Ingen väg fram — gissa inte.
  return {
    name,
    cleanName: name,
    externalQuantity,
    quantity: externalQuantity !== null && externalQuantity !== 0 ? Math.abs(externalQuantity) : 1,
    quantitySource: "okand",
    unitPriceMinor,
    lineTotalMinor,
    vatRate,
  };
}

/* ------------------------------------------------------------------ API-klient */

export type SumupError = { status: number; code: string; message: string };

export class SumupClient {
  constructor(private key: string) {}

  private async get(path: string): Promise<any> {
    const res = await fetch(`${SUMUP_BASE}${path}`, {
      headers: { Authorization: `Bearer ${this.key}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const code =
        res.status === 401 || res.status === 403
          ? "auth"
          : res.status === 429
            ? "rate_limit"
            : res.status >= 500
              ? "upstream"
              : "http";
      const err: SumupError = {
        status: res.status,
        code,
        message: text.slice(0, 400) || res.statusText,
      };
      throw err;
    }
    return await res.json();
  }

  /**
   * Sidad historik. `changes_since` gör hämtningen inkrementell; vi paginerar
   * via länkarna i svaret (`links[].rel === "next"`) tills de tar slut.
   */
  async history(
    merchantCode: string,
    changesSince: string,
    limit = 100,
    maxPages = 20,
  ): Promise<any[]> {
    const items: any[] = [];
    let path =
      `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions/history` +
      `?limit=${limit}&changes_since=${encodeURIComponent(changesSince)}`;
    for (let page = 0; page < maxPages && path; page++) {
      const body = await this.get(path);
      const batch: any[] = body?.items ?? [];
      items.push(...batch);
      const next = (body?.links ?? []).find((l: any) => l?.rel === "next")?.href as
        | string
        | undefined;
      if (!next || batch.length === 0) break;
      path = next.startsWith("http") ? next.replace(SUMUP_BASE, "") : next;
    }
    return items;
  }

  /** Fullt transaktionsobjekt med products[] och vat_rates[]. */
  transaction(merchantCode: string, id: string): Promise<any> {
    return this.get(
      `/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions?id=${encodeURIComponent(id)}`,
    );
  }

  /** Kvittot: receipt_no och card_reader.code hämtas alltid härifrån. */
  receipt(merchantCode: string, id: string): Promise<any> {
    return this.get(
      `/v1.1/receipts/${encodeURIComponent(id)}?mid=${encodeURIComponent(merchantCode)}`,
    );
  }
}

/* ------------------------------------------------------------------ öppettider */

/**
 * Tyst kassa-larm: bara under öppettid. Veckodag 0 = söndag, som i
 * store_opening_hours.
 */
export function isOpenNow(
  hours: { weekday: number; open_time: string | null; close_time: string | null; closed: boolean }[],
  now: Date,
  timeZone = "Europe/Zurich",
): boolean {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayName = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase();
  const map: Record<string, number> = { sön: 0, mån: 1, tis: 2, ons: 3, tors: 4, fre: 5, lör: 6 };
  const weekday = map[weekdayName.replace(".", "")] ?? new Date(now).getUTCDay();

  const row = hours.find((h) => h.weekday === weekday);
  if (!row || row.closed || !row.open_time || !row.close_time) return false;
  const minutes = hh * 60 + mm;
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  return minutes >= toMin(row.open_time) && minutes <= toMin(row.close_time);
}
