import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PkCostRow, PkOverheadRow } from "@/lib/staffKpi";

/**
 * Personalkostnad från Personalkollen per enhet och dag.
 *
 * Sanningen är Personalkollens egna belopp: `variable_cost` (stämplad kostnad),
 * `fixed_cost` (fast dagskostnad), `scheduled_cost` (schemalagd kostnad) och
 * `ongoing_cost` (uppskattning för pass som ännu inte är utstämplade). Ingen
 * lokal timlön används för enheter som är kopplade till Personalkollen.
 */
export function usePkStoreLaborCost(day: string, storeIds: string[]) {
  const key = [...storeIds].sort().join(",");
  return useQuery({
    queryKey: ["pk-daily-labor-cost", day, key],
    enabled: !!day && storeIds.length > 0,
    refetchInterval: 120_000,
    queryFn: async () => {
      const map = new Map<string, PkCostRow>();
      const results = await Promise.all(
        storeIds.map(async (id) => {
          const { data, error } = await supabase.rpc("pk_daily_labor_cost", {
            _store_id: id,
            _date: day,
          });
          if (error) throw error;
          return { id, row: (data ?? [])[0] as any };
        }),
      );
      results.forEach(({ id, row }) => {
        if (!row) return;
        map.set(id, {
          storeId: id,
          variable: Number(row.variable_cost ?? 0),
          fixed: Number(row.fixed_cost ?? 0),
          actual: Number(row.actual_cost ?? 0),
          scheduled: Number(row.scheduled_cost ?? 0),
          workSec: Number(row.work_time_sec ?? 0),
          ongoing: Number(row.ongoing_cost ?? 0),
          ongoingSec: Number(row.ongoing_sec ?? 0),
          ongoingCount: Number(row.ongoing_count ?? 0),
        });
      });
      return map;
    },
  });
}

/** Overheadenheter (administration) — egen rad per bolag, ingår ej i butikerna. */
export function usePkOverheadCost(day: string) {
  return useQuery({
    queryKey: ["pk-overhead-daily-cost", day],
    enabled: !!day,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pk_overhead_daily_cost", { _date: day });
      if (error) throw error;
      return (data ?? []).map((r: any): PkOverheadRow => ({
        legalEntityId: r.legal_entity_id ?? null,
        unitId: String(r.unit_id),
        unitName: String(r.unit_name ?? "Administration"),
        variable: Number(r.variable_cost ?? 0),
        fixed: Number(r.fixed_cost ?? 0),
        actual: Number(r.actual_cost ?? 0),
        scheduled: Number(r.scheduled_cost ?? 0),
        workSec: Number(r.work_time_sec ?? 0),
        ongoing: Number(r.ongoing_cost ?? 0),
      }));
    },
  });
}

/** Enheter som är kopplade till Personalkollen (kostnadsgrupp eller arbetsplats). */
export function usePkMappedStores() {
  return useQuery({
    queryKey: ["pk-mapped-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pk_mapped_stores");
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: any) => String(r.store_id)));
    },
  });
}
