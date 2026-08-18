import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CityKpi,
  PkCostRow,
  RevenueEntry,
  StoreKpi,
  StoreKpiSource,
  computeCityKpis,
  computeCurrencyTotals,
  computeStoreKpis,
  computeTotals,
} from "@/lib/staffKpi";
import { useEffectiveRates } from "@/hooks/useSalaryHistory";
import { usePkMappedStores, usePkStoreLaborCost } from "@/hooks/usePkLaborCost";

/** Timlön per anställd — tom om ingen lön är inlagd. */
export function useStaffRates() {
  return useQuery({
    queryKey: ["staff-hourly-rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, hourly_rate");
      if (error) throw error;
      const map = new Map<string, number | null>();
      (data ?? []).forEach((r: any) => {
        const v = r.hourly_rate === null || r.hourly_rate === undefined ? null : Number(r.hourly_rate);
        map.set(r.id, v !== null && Number.isFinite(v) && v > 0 ? v : null);
      });
      return map;
    },
  });
}

/** Valuta per enhet — schweiziska butiker redovisas i CHF. */
export function useStoreCurrencies() {
  return useQuery({
    queryKey: ["store-currencies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, currency");
      if (error) throw error;
      const map = new Map<string, string>();
      (data ?? []).forEach((r: any) => map.set(String(r.id), String(r.currency || "SEK").toUpperCase()));
      return map;
    },
  });
}

/** Momsbelopp ur kassans momsuppdelning — tolerant mot olika format. */
function vatFromBreakdown(raw: any): number | null {
  if (!raw) return null;
  const values = Array.isArray(raw) ? raw : Object.values(raw);
  let sum = 0;
  let found = false;
  values.forEach((v: any) => {
    if (v === null || v === undefined) return;
    if (typeof v === "number") {
      sum += v;
      found = true;
      return;
    }
    const keys = ["vat_ore", "vat_amount_ore", "vat_amount", "vat", "tax_ore", "tax"];
    for (const k of keys) {
      const n = Number(v?.[k]);
      if (Number.isFinite(n)) {
        sum += k.endsWith("_ore") ? n / 100 : n;
        found = true;
        return;
      }
    }
  });
  return found ? sum : null;
}

/**
 * Omsättning per butik för ett datum, exklusive moms när momsen är känd.
 *
 * Kassan (pos_transactions — Nimpos, Zettle, SumUp) först eftersom den är
 * löpande under dagen, annars butikens dagsrapport (net_sales = exkl. moms).
 */
export function useStoreRevenue(day: string) {
  return useQuery({
    queryKey: ["store-revenue-day-exvat", day],
    enabled: !!day,
    queryFn: async () => {
      const map = new Map<string, RevenueEntry>();

      const { data: pos, error: posErr } = await supabase
        .from("pos_transactions")
        .select("store_id, total_ore, status, occurred_at, vat_breakdown")
        .gte("occurred_at", `${day}T00:00:00`)
        .lte("occurred_at", `${day}T23:59:59`);
      if (posErr) throw posErr;

      const posVatKnown = new Map<string, boolean>();
      (pos ?? []).forEach((t: any) => {
        if (!t.store_id) return;
        if (t.status && String(t.status).toLowerCase().includes("revers")) return;
        const gross = Number(t.total_ore ?? 0) / 100;
        const vat = vatFromBreakdown(t.vat_breakdown);
        const amount = vat === null ? gross : gross - vat;
        const prev = map.get(t.store_id);
        const known = (posVatKnown.get(t.store_id) ?? true) && vat !== null;
        posVatKnown.set(t.store_id, known);
        map.set(t.store_id, { amount: (prev?.amount ?? 0) + amount, source: "pos", exVat: known });
      });

      const { data: daily, error: dailyErr } = await supabase
        .from("daily_reports")
        .select("store_id, gross_sales, net_sales")
        .eq("report_date", day);
      if (dailyErr) throw dailyErr;

      (daily ?? []).forEach((r: any) => {
        if (!r.store_id || map.has(r.store_id)) return;
        const net = Number(r.net_sales ?? 0);
        if (net > 0) {
          map.set(r.store_id, { amount: net, source: "daily", exVat: true });
          return;
        }
        const gross = Number(r.gross_sales ?? 0);
        if (gross > 0) map.set(r.store_id, { amount: gross, source: "daily", exVat: false });
      });

      return map;
    },
  });
}

/** Påslag för arbetsgivaravgifter m.m. — 0 om inget är inställt. */
export function usePayrollOverhead() {
  return useQuery({
    queryKey: ["payroll-overhead-pct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "payroll_overhead_pct")
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.value ?? null) as any;
      const num = typeof raw === "number" ? raw : Number(raw?.pct ?? raw?.value ?? NaN);
      return Number.isFinite(num) && num > 0 ? num : 0;
    },
  });
}

export interface StaffKpiResult {
  stores: StoreKpi[];
  cities: CityKpi[];
  totals: CityKpi;
  /** Totalt per valuta — ingen valutaomräkning görs. */
  currencyTotals: CityKpi[];
  isLoading: boolean;
  /** Sant när ingen anställd har timlön inlagd (gäller bara enheter utan Personalkollen). */
  ratesMissing: boolean;
  revenueMissing: boolean;
  overheadPct: number;
  pkStores: Set<string>;
}

/** Personalkostnad och kostnadsandel per butik och stad för ett datum. */
export function useStaffKpi(day: string, sources: StoreKpiSource[]): StaffKpiResult {
  const rates = useEffectiveRates(day);
  const revenue = useStoreRevenue(day);
  const overhead = usePayrollOverhead();
  const currencies = useStoreCurrencies();
  const mapped = usePkMappedStores();

  const storeIds = useMemo(() => sources.map((s) => s.storeId), [sources]);
  const pkCost = usePkStoreLaborCost(day, storeIds);

  const rateMap = rates.data ?? new Map<string, number | null>();
  const revenueMap = revenue.data ?? new Map<string, RevenueEntry>();
  const overheadPct = overhead.data ?? 0;
  const currencyMap = currencies.data ?? new Map<string, string>();
  const pkStores = mapped.data ?? new Set<string>();
  const pkMap = pkCost.data ?? new Map<string, PkCostRow>();

  const stores = useMemo(
    () =>
      computeStoreKpis(sources, rateMap, revenueMap, overheadPct, {
        pk: pkMap,
        pkStores,
        currencies: currencyMap,
      }),
    [sources, rateMap, revenueMap, overheadPct, pkMap, pkStores, currencyMap],
  );

  const cities = useMemo(() => computeCityKpis(stores), [stores]);
  const totals = useMemo(() => computeTotals(stores), [stores]);
  const currencyTotals = useMemo(() => computeCurrencyTotals(stores), [stores]);

  return {
    stores,
    cities,
    totals,
    currencyTotals,
    isLoading: rates.isLoading || revenue.isLoading || pkCost.isLoading || mapped.isLoading,
    ratesMissing: Array.from(rateMap.values()).every((v) => v === null),
    revenueMissing: revenueMap.size === 0,
    overheadPct,
    pkStores,
  };
}

/**
 * Omsättning per butik och dag i ett datumintervall.
 *
 * Nyckel: `${store_id}|${YYYY-MM-DD}`. Kassan går före dagsrapporten, precis
 * som i dagsvyn. Används av personalkalendern för att räkna personalkostnad
 * i procent av omsättningen per dag och vecka.
 */
export function useStoreRevenueRange(from: string, to: string) {
  return useQuery({
    queryKey: ["store-revenue-range", from, to],
    enabled: !!from && !!to,
    queryFn: async () => {
      const map = new Map<string, RevenueEntry>();

      const { data: pos, error: posErr } = await supabase
        .from("pos_transactions")
        .select("store_id, total_ore, status, occurred_at, vat_breakdown")
        .gte("occurred_at", `${from}T00:00:00`)
        .lte("occurred_at", `${to}T23:59:59`);
      if (posErr) throw posErr;

      (pos ?? []).forEach((t: any) => {
        if (!t.store_id || !t.occurred_at) return;
        if (t.status && String(t.status).toLowerCase().includes("revers")) return;
        const day = String(t.occurred_at).slice(0, 10);
        const key = `${t.store_id}|${day}`;
        const gross = Number(t.total_ore ?? 0) / 100;
        const vat = vatFromBreakdown(t.vat_breakdown);
        const amount = vat === null ? gross : gross - vat;
        const prev = map.get(key);
        map.set(key, {
          amount: (prev?.amount ?? 0) + amount,
          source: "pos",
          exVat: (prev?.exVat ?? true) && vat !== null,
        });
      });

      const { data: daily, error: dailyErr } = await supabase
        .from("daily_reports")
        .select("store_id, report_date, gross_sales, net_sales")
        .gte("report_date", from)
        .lte("report_date", to);
      if (dailyErr) throw dailyErr;

      (daily ?? []).forEach((r: any) => {
        if (!r.store_id || !r.report_date) return;
        const key = `${r.store_id}|${String(r.report_date).slice(0, 10)}`;
        if (map.has(key)) return;
        const net = Number(r.net_sales ?? 0);
        if (net > 0) {
          map.set(key, { amount: net, source: "daily", exVat: true });
          return;
        }
        const gross = Number(r.gross_sales ?? 0);
        if (gross > 0) map.set(key, { amount: gross, source: "daily", exVat: false });
      });

      return map;
    },
  });
}
