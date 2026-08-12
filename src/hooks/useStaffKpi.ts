import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CityKpi,
  RevenueEntry,
  StoreKpi,
  StoreKpiSource,
  computeCityKpis,
  computeStoreKpis,
  computeTotals,
} from "@/lib/staffKpi";

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

/**
 * Omsättning per butik för ett datum.
 *
 * Kassan (pos_transactions) först eftersom den är löpande under dagen, annars
 * butikens dagsrapport. Finns ingen av dem lämnas butiken utan omsättning.
 */
export function useStoreRevenue(day: string) {
  return useQuery({
    queryKey: ["store-revenue-day", day],
    enabled: !!day,
    queryFn: async () => {
      const map = new Map<string, RevenueEntry>();

      const { data: pos, error: posErr } = await supabase
        .from("pos_transactions")
        .select("store_id, total_ore, status, occurred_at")
        .gte("occurred_at", `${day}T00:00:00`)
        .lte("occurred_at", `${day}T23:59:59`);
      if (posErr) throw posErr;

      (pos ?? []).forEach((t: any) => {
        if (!t.store_id) return;
        if (t.status && String(t.status).toLowerCase().includes("revers")) return;
        const amount = Number(t.total_ore ?? 0) / 100;
        const prev = map.get(t.store_id);
        map.set(t.store_id, { amount: (prev?.amount ?? 0) + amount, source: "pos" });
      });

      const { data: daily, error: dailyErr } = await supabase
        .from("daily_reports")
        .select("store_id, gross_sales, net_sales")
        .eq("report_date", day);
      if (dailyErr) throw dailyErr;

      (daily ?? []).forEach((r: any) => {
        if (!r.store_id || map.has(r.store_id)) return;
        const amount = Number(r.gross_sales ?? r.net_sales ?? 0);
        if (amount > 0) map.set(r.store_id, { amount, source: "daily" });
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
  isLoading: boolean;
  /** Sant när ingen anställd har timlön inlagd. */
  ratesMissing: boolean;
  revenueMissing: boolean;
  overheadPct: number;
}

/** Personalkostnad och kostnadsandel per butik och stad för ett datum. */
export function useStaffKpi(day: string, sources: StoreKpiSource[]): StaffKpiResult {
  const rates = useStaffRates();
  const revenue = useStoreRevenue(day);
  const overhead = usePayrollOverhead();

  const rateMap = rates.data ?? new Map<string, number | null>();
  const revenueMap = revenue.data ?? new Map<string, RevenueEntry>();
  const overheadPct = overhead.data ?? 0;

  const stores = useMemo(
    () => computeStoreKpis(sources, rateMap, revenueMap, overheadPct),
    [sources, rateMap, revenueMap, overheadPct],
  );

  const cities = useMemo(() => computeCityKpis(stores), [stores]);
  const totals = useMemo(() => computeTotals(stores), [stores]);

  return {
    stores,
    cities,
    totals,
    isLoading: rates.isLoading || revenue.isLoading,
    ratesMissing: Array.from(rateMap.values()).every((v) => v === null),
    revenueMissing: revenueMap.size === 0,
    overheadPct,
  };
}
