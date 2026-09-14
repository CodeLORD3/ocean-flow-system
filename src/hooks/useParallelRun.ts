import { useMemo } from "react";
import { useTimeEntries, usePkLoggedTimes } from "@/hooks/useClock";
import { useEmployees, useAllEmployments } from "@/hooks/useEmployees";
import { summarizeDays } from "@/lib/timeEntries";
import { buildStoreDays, buildStoreStatus, type CompareRow, type StoreStatus } from "@/lib/parallelRun";

/**
 * Daglig parallellkörning klocka mot Personalkollen, aggregerad per butik.
 * Testpersoner filtreras bort — deras stämplingar är körbevis, inte drift.
 */
export function useParallelRun(from: string, to: string) {
  const entries = useTimeEntries(from, to, null);
  const pk = usePkLoggedTimes(from, to, null);
  const { data: employees = [] } = useEmployees(true);
  const { data: employments = [] } = useAllEmployments();

  const realEmployees = useMemo(() => new Set(employees.filter((e) => !e.is_test).map((e) => e.id)), [employees]);

  const storeByEmployee = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const em of employments) {
      if (em.is_active === false) continue;
      if (!map.get(em.employee_id)) map.set(em.employee_id, em.store_id);
    }
    return map;
  }, [employments]);

  const rows = useMemo<CompareRow[]>(() => {
    const clockSeconds = new Map<string, number>();
    for (const day of summarizeDays(entries.data ?? [])) {
      if (!realEmployees.has(day.employee_id)) continue;
      clockSeconds.set(`${day.employee_id}|${day.day}`, day.work_seconds);
    }
    const pkSeconds = new Map<string, number>();
    for (const row of pk.data ?? []) {
      if (!row.employee_id || !realEmployees.has(row.employee_id)) continue;
      const key = `${row.employee_id}|${row.day}`;
      pkSeconds.set(key, (pkSeconds.get(key) ?? 0) + row.seconds);
    }
    const keys = new Set([...clockSeconds.keys(), ...pkSeconds.keys()]);
    return [...keys].map((key) => {
      const [employee_id, day] = key.split("|");
      const clock = clockSeconds.get(key);
      const pkValue = pkSeconds.get(key);
      return {
        day,
        employee_id,
        diffMinutes: clock != null && pkValue != null ? Math.round((clock - pkValue) / 60) : null,
      };
    });
  }, [entries.data, pk.data, realEmployees]);

  const storeStatus: StoreStatus[] = useMemo(
    () => buildStoreStatus(buildStoreDays(rows, storeByEmployee)),
    [rows, storeByEmployee],
  );

  return { rows, storeStatus, isLoading: entries.isLoading || pk.isLoading };
}
