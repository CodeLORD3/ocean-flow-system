/**
 * Nyckeltalslager för personal (återanvändbart).
 *
 * Ren räknelogik utan databasläsning. Personalkostnaden hämtas från
 * Personalkollen för de enheter som är kopplade dit (rörlig + fast kostnad,
 * plus uppskattning för pågående pass) och räknas lokalt — arbetad tid ×
 * timlön från personalkortet — bara för enheter utan Personalkollen
 * (Zollikon och Morges). Saknas underlag returneras null i stället för ett
 * påhittat värde.
 */

export type RevenueSource = "pos" | "daily";

/** Antagna arbetstimmar per månad när månadslön slås ut per arbetad timme. */
export const MONTHLY_HOURS = 165;

/**
 * Timlönsekvivalent: timanställd använder timlönen, månadsanställd får
 * månadslönen fördelad över {@link MONTHLY_HOURS}. Saknas lön returneras null.
 */
export function effectiveHourlyRate(
  type: "hourly" | "monthly" | string | null | undefined,
  hourlyRate: number | null | undefined,
  monthlySalary: number | null | undefined,
): number | null {
  const num = (v: number | null | undefined) =>
    v === null || v === undefined || !Number.isFinite(Number(v)) || Number(v) <= 0 ? null : Number(v);
  if (type === "monthly") {
    const m = num(monthlySalary);
    return m === null ? null : m / MONTHLY_HOURS;
  }
  return num(hourlyRate);
}

export interface RevenueEntry {
  amount: number;
  source: RevenueSource;
  /** Sant när beloppet är exklusive moms (annars är momsen okänd). */
  exVat: boolean;
}

/** Personalkollens kostnadsrad för en enhet och dag. */
export interface PkCostRow {
  storeId: string;
  variable: number;
  fixed: number;
  actual: number;
  scheduled: number;
  workSec: number;
  ongoing: number;
  ongoingSec: number;
  ongoingCount: number;
}

export interface PkOverheadRow {
  legalEntityId: string | null;
  unitId: string;
  unitName: string;
  variable: number;
  fixed: number;
  actual: number;
  scheduled: number;
  workSec: number;
  ongoing: number;
}

/** Det minsta en butiksrad behöver innehålla för att kunna prissättas. */
export interface StoreKpiSource {
  storeId: string;
  name: string;
  city: string;
  workingNow: number;
  deviations: number;
  workedMinutes: number;
  plannedMinutes: number;
  staffRows: { staffId: string; workedMinutes: number }[];
}

export type CostSource = "personalkollen" | "beräknad";

export interface StoreKpi {
  storeId: string;
  name: string;
  city: string;
  currency: string;
  workingNow: number;
  deviations: number;
  workedMinutes: number;
  plannedMinutes: number;
  /** Kostnad för de minuter där underlag finns, annars null. */
  laborCost: number | null;
  /** Varifrån kostnaden kommer — Personalkollen eller lokal beräkning. */
  costSource: CostSource;
  variableCost: number | null;
  fixedCost: number | null;
  scheduledCost: number | null;
  ongoingCost: number | null;
  ongoingCount: number;
  /** Arbetad tid som kostnaden bygger på (Personalkollen för svenska enheter). */
  costMinutes: number;
  costPerHour: number | null;
  ratedMinutes: number;
  unratedMinutes: number;
  revenue: number | null;
  revenueSource: RevenueSource | null;
  revenueExVat: boolean;
  /** Personalkostnad i procent av omsättning exkl. moms. */
  costRatioPct: number | null;
}

export interface CityKpi {
  city: string;
  currency?: string;
  stores: number;
  workingNow: number;
  deviations: number;
  workedMinutes: number;
  plannedMinutes: number;
  laborCost: number | null;
  variableCost: number | null;
  fixedCost: number | null;
  scheduledCost: number | null;
  costMinutes: number;
  costPerHour: number | null;
  revenue: number | null;
  costRatioPct: number | null;
  unratedMinutes: number;
}

export interface StoreKpiOptions {
  /** Personalkollens kostnader per enhet. */
  pk?: Map<string, PkCostRow>;
  /** Enheter som använder Personalkollen. */
  pkStores?: Set<string>;
  /** Valuta per enhet (SEK som standard). */
  currencies?: Map<string, string>;
}

export function computeStoreKpis(
  sources: StoreKpiSource[],
  rates: Map<string, number | null>,
  revenue: Map<string, RevenueEntry>,
  overheadPct = 0,
  options: StoreKpiOptions = {},
): StoreKpi[] {
  const factor = 1 + Math.max(0, overheadPct) / 100;
  const pk = options.pk ?? new Map<string, PkCostRow>();
  const pkStores = options.pkStores ?? new Set<string>();
  const currencies = options.currencies ?? new Map<string, string>();

  return sources.map((s) => {
    const rev = revenue.get(s.storeId) ?? null;
    const currency = currencies.get(s.storeId) ?? "SEK";
    const usesPk = pkStores.has(s.storeId);
    const pkRow = pk.get(s.storeId) ?? null;

    let laborCost: number | null = null;
    let costSource: CostSource = usesPk ? "personalkollen" : "beräknad";
    let variableCost: number | null = null;
    let fixedCost: number | null = null;
    let scheduledCost: number | null = null;
    let ongoingCost: number | null = null;
    let ongoingCount = 0;
    let costMinutes = 0;
    let ratedMinutes = 0;
    let unratedMinutes = 0;

    if (usesPk) {
      // Personalkollen är sanningen — ingen lokal timlön blandas in.
      variableCost = pkRow ? pkRow.variable : 0;
      fixedCost = pkRow ? pkRow.fixed : 0;
      scheduledCost = pkRow ? pkRow.scheduled : 0;
      ongoingCost = pkRow ? pkRow.ongoing : 0;
      ongoingCount = pkRow ? pkRow.ongoingCount : 0;
      costMinutes = pkRow ? Math.round(pkRow.workSec / 60) : 0;
      laborCost = pkRow ? pkRow.actual : 0;
      ratedMinutes = costMinutes;
    } else {
      // Zollikon och Morges: arbetad tid × timlön från personalkortet.
      let cost = 0;
      s.staffRows.forEach((r) => {
        const rate = rates.get(r.staffId);
        if (rate === null || rate === undefined || !Number.isFinite(rate)) {
          unratedMinutes += r.workedMinutes;
          return;
        }
        ratedMinutes += r.workedMinutes;
        cost += (r.workedMinutes / 60) * rate * factor;
      });
      costMinutes = ratedMinutes;
      laborCost = ratedMinutes > 0 ? cost : null;
      variableCost = laborCost;
      fixedCost = 0;
    }

    const costPerHour = laborCost !== null && costMinutes > 0 ? laborCost / (costMinutes / 60) : null;
    const costRatioPct =
      laborCost !== null && rev && rev.amount > 0 ? (laborCost / rev.amount) * 100 : null;

    return {
      storeId: s.storeId,
      name: s.name,
      city: s.city,
      currency,
      workingNow: s.workingNow,
      deviations: s.deviations,
      workedMinutes: s.workedMinutes,
      plannedMinutes: s.plannedMinutes,
      laborCost,
      costSource,
      variableCost,
      fixedCost,
      scheduledCost,
      ongoingCost,
      ongoingCount,
      costMinutes,
      costPerHour,
      ratedMinutes,
      unratedMinutes,
      revenue: rev ? rev.amount : null,
      revenueSource: rev ? rev.source : null,
      revenueExVat: rev ? rev.exVat : false,
      costRatioPct,
    };
  });
}

function sumOrNull(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

function aggregate(label: string, rows: StoreKpi[], currency?: string): CityKpi {
  const laborCost = sumOrNull(rows.map((r) => r.laborCost));
  const revenue = sumOrNull(rows.map((r) => r.revenue));
  const costMinutes = rows.reduce((s, r) => s + r.costMinutes, 0);
  return {
    city: label,
    currency,
    stores: rows.length,
    workingNow: rows.reduce((s, r) => s + r.workingNow, 0),
    deviations: rows.reduce((s, r) => s + r.deviations, 0),
    workedMinutes: rows.reduce((s, r) => s + r.workedMinutes, 0),
    plannedMinutes: rows.reduce((s, r) => s + r.plannedMinutes, 0),
    unratedMinutes: rows.reduce((s, r) => s + r.unratedMinutes, 0),
    laborCost,
    variableCost: sumOrNull(rows.map((r) => r.variableCost)),
    fixedCost: sumOrNull(rows.map((r) => r.fixedCost)),
    scheduledCost: sumOrNull(rows.map((r) => r.scheduledCost)),
    costMinutes,
    costPerHour: laborCost !== null && costMinutes > 0 ? laborCost / (costMinutes / 60) : null,
    revenue,
    costRatioPct:
      laborCost !== null && revenue !== null && revenue > 0 ? (laborCost / revenue) * 100 : null,
  };
}

/** Per stad — städer hålls isär per valuta eftersom ingen omräkning görs. */
export function computeCityKpis(kpis: StoreKpi[]): CityKpi[] {
  const byCity = new Map<string, StoreKpi[]>();
  kpis.forEach((k) => {
    const key = `${k.city || "Okänd stad"}|${k.currency}`;
    byCity.set(key, [...(byCity.get(key) ?? []), k]);
  });

  return Array.from(byCity.entries())
    .map(([key, rows]) => {
      const [city, currency] = key.split("|");
      return aggregate(city, rows, currency);
    })
    .sort((a, b) => a.city.localeCompare(b.city, "sv"));
}

/**
 * Totalt per valuta — schweiziska enheter räknas i CHF och slås aldrig
 * samman med svenska kronor.
 */
export function computeCurrencyTotals(kpis: StoreKpi[]): CityKpi[] {
  const byCurrency = new Map<string, StoreKpi[]>();
  kpis.forEach((k) => byCurrency.set(k.currency, [...(byCurrency.get(k.currency) ?? []), k]));
  return Array.from(byCurrency.entries())
    .map(([currency, rows]) => aggregate(`Totalt ${currency}`, rows, currency))
    .sort((a, b) => (a.currency === "SEK" ? -1 : a.city.localeCompare(b.city, "sv")));
}

export function computeTotals(kpis: StoreKpi[]): CityKpi {
  return aggregate("Totalt", kpis, kpis[0]?.currency ?? "SEK");
}

/** Belopp med mellanrum som tusentalsavgränsare och valuta som suffix. */
export function formatMoney(value: number, currency = "SEK"): string {
  const num = Math.round(value)
    .toLocaleString("sv-SE")
    .replace(/\u00a0/g, " ");
  return `${num} ${currency === "SEK" ? "kr" : currency}`;
}

/** Svensk kronformatering (bakåtkompatibel). */
export function formatSek(value: number): string {
  return formatMoney(value, "SEK");
}

export const MISSING_COST_HINT = "Kostnadsdata saknas";
