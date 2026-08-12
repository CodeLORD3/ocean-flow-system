/**
 * Nyckeltalslager för personal (återanvändbart).
 *
 * Ren räknelogik utan databasläsning: arbetad tid → personalkostnad →
 * kostnad som andel av omsättning. Saknas timlön eller omsättning returneras
 * null i stället för ett påhittat värde, så gränssnittet kan visa en
 * platshållare i stället för en siffra som inte går att lita på.
 */

export type RevenueSource = "pos" | "daily";

export interface RevenueEntry {
  amount: number;
  source: RevenueSource;
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

export interface StoreKpi {
  storeId: string;
  name: string;
  city: string;
  workingNow: number;
  deviations: number;
  workedMinutes: number;
  plannedMinutes: number;
  /** Kostnad för de minuter där timlön finns, annars null. */
  laborCost: number | null;
  ratedMinutes: number;
  unratedMinutes: number;
  revenue: number | null;
  revenueSource: RevenueSource | null;
  /** Personalkostnad i procent av omsättning. */
  costRatioPct: number | null;
}

export interface CityKpi {
  city: string;
  stores: number;
  workingNow: number;
  deviations: number;
  workedMinutes: number;
  plannedMinutes: number;
  laborCost: number | null;
  revenue: number | null;
  costRatioPct: number | null;
  unratedMinutes: number;
}

export function computeStoreKpis(
  sources: StoreKpiSource[],
  rates: Map<string, number | null>,
  revenue: Map<string, RevenueEntry>,
  overheadPct = 0,
): StoreKpi[] {
  const factor = 1 + Math.max(0, overheadPct) / 100;

  return sources.map((s) => {
    let cost = 0;
    let ratedMinutes = 0;
    let unratedMinutes = 0;

    s.staffRows.forEach((r) => {
      const rate = rates.get(r.staffId);
      if (rate === null || rate === undefined || !Number.isFinite(rate)) {
        unratedMinutes += r.workedMinutes;
        return;
      }
      ratedMinutes += r.workedMinutes;
      cost += (r.workedMinutes / 60) * rate * factor;
    });

    const rev = revenue.get(s.storeId) ?? null;
    const laborCost = ratedMinutes > 0 ? cost : null;
    const costRatioPct =
      laborCost !== null && rev && rev.amount > 0 ? (laborCost / rev.amount) * 100 : null;

    return {
      storeId: s.storeId,
      name: s.name,
      city: s.city,
      workingNow: s.workingNow,
      deviations: s.deviations,
      workedMinutes: s.workedMinutes,
      plannedMinutes: s.plannedMinutes,
      laborCost,
      ratedMinutes,
      unratedMinutes,
      revenue: rev ? rev.amount : null,
      revenueSource: rev ? rev.source : null,
      costRatioPct,
    };
  });
}

function sumOrNull(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

export function computeCityKpis(kpis: StoreKpi[]): CityKpi[] {
  const byCity = new Map<string, StoreKpi[]>();
  kpis.forEach((k) => {
    const key = k.city || "Okänd stad";
    byCity.set(key, [...(byCity.get(key) ?? []), k]);
  });

  return Array.from(byCity.entries())
    .map(([city, rows]) => {
      const laborCost = sumOrNull(rows.map((r) => r.laborCost));
      const revenue = sumOrNull(rows.map((r) => r.revenue));
      return {
        city,
        stores: rows.length,
        workingNow: rows.reduce((s, r) => s + r.workingNow, 0),
        deviations: rows.reduce((s, r) => s + r.deviations, 0),
        workedMinutes: rows.reduce((s, r) => s + r.workedMinutes, 0),
        plannedMinutes: rows.reduce((s, r) => s + r.plannedMinutes, 0),
        unratedMinutes: rows.reduce((s, r) => s + r.unratedMinutes, 0),
        laborCost,
        revenue,
        costRatioPct:
          laborCost !== null && revenue !== null && revenue > 0 ? (laborCost / revenue) * 100 : null,
      };
    })
    .sort((a, b) => a.city.localeCompare(b.city, "sv"));
}

export function computeTotals(kpis: StoreKpi[]): CityKpi {
  const all = computeCityKpis(kpis.map((k) => ({ ...k, city: "Totalt" })));
  return (
    all[0] ?? {
      city: "Totalt",
      stores: 0,
      workingNow: 0,
      deviations: 0,
      workedMinutes: 0,
      plannedMinutes: 0,
      laborCost: null,
      revenue: null,
      costRatioPct: null,
      unratedMinutes: 0,
    }
  );
}

/** Svensk kronformatering med mellanrum som tusentalsavgränsare. */
export function formatSek(value: number): string {
  return `${Math.round(value)
    .toLocaleString("sv-SE")
    .replace(/\u00a0/g, " ")} kr`;
}

export const MISSING_COST_HINT = "Kostnadsdata saknas — lägg till timlön/omsättning";
