import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";
import { useStoreOpeningHours } from "@/hooks/useStoreOpeningHours";
import { usePlannedShifts } from "@/hooks/usePlannedShifts";
import {
  ActualShiftRow,
  DayHours,
  Deviation,
  StaffDayRow,
  buildStaffDay,
  isOpenNow,
  isToday,
  resolveDayHours,
  type SpecialDayRow,
} from "@/lib/liveStaff";

/** Faktiska stämplingar för ett datum — ett anrop för alla butiker. */
function useActualShifts(day: string) {
  return useQuery({
    queryKey: ["live-staff-shifts", day],
    enabled: !!day,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_shifts")
        .select("id, staff_id, store_id, clocked_in_at, clocked_out_at")
        .gte("clocked_in_at", `${day}T00:00:00`)
        .lte("clocked_in_at", `${day}T23:59:59`)
        .order("clocked_in_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ActualShiftRow[];
    },
  });
}

function useSpecialDays(day: string) {
  return useQuery({
    queryKey: ["live-special-days", day],
    enabled: !!day,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_special_days")
        .select("store_id, day, closed, open_time, close_time, note")
        .eq("day", day);
      if (error) throw error;
      return (data ?? []) as SpecialDayRow[];
    },
  });
}

export interface LiveStoreRow {
  id: string;
  name: string;
  city: string;
  isWholesale: boolean;
  hoursText: string | null;
  hours: DayHours;
  openNow: boolean;
  staffRows: StaffDayRow[];
  workingNow: number;
  plannedCount: number;
  deviations: Deviation[];
  workedMinutes: number;
  plannedMinutes: number;
  events: LiveEvent[];
}

export interface LiveEvent {
  at: string;
  minutes: number;
  staffId: string;
  storeId: string;
  kind: "in" | "out";
}

/** En minutklocka som driver NU-linjen och live-etiketten. */
export function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * Hela dagens bild per butik.
 *
 * Fyra frågor totalt (butiker, öppettider, stämplingar, planerade pass) plus
 * personallistan — aldrig en fråga per anställd.
 */
export function useLiveStaffDay(day: string) {
  const qc = useQueryClient();
  const now = useMinuteTick();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const live = isToday(day);

  const stores = useStores();
  const staff = useStaff();
  const weekly = useStoreOpeningHours();
  const specials = useSpecialDays(day);
  const actual = useActualShifts(day);
  const planned = usePlannedShifts(day);

  // Realtid: samma mönster som notiser och orderrader i övriga systemet.
  useEffect(() => {
    const channel = supabase
      .channel("live-staff-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_shifts" }, () => {
        qc.invalidateQueries({ queryKey: ["live-staff-shifts"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_planned_shifts" }, () => {
        qc.invalidateQueries({ queryKey: ["planned-shifts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const isLoading =
    stores.isLoading || weekly.isLoading || actual.isLoading || planned.isLoading || specials.isLoading;

  const rows: LiveStoreRow[] = useMemo(() => {
    const storeList = stores.data ?? [];
    const weeklyRows = weekly.data ?? [];
    const specialRows = specials.data ?? [];
    const actualRows = actual.data ?? [];
    const plannedRows = planned.data ?? [];

    return storeList.map((store) => {
      const hours = resolveDayHours(store.id, day, weeklyRows, specialRows);
      const openNow = live && isOpenNow(hours, nowMinutes);

      const storeActual = actualRows.filter((s) => s.store_id === store.id);
      const storePlanned = plannedRows.filter((p) => p.store_id === store.id);

      const staffIds = Array.from(
        new Set([...storeActual.map((s) => s.staff_id), ...storePlanned.map((p) => p.staff_id)]),
      );

      const staffRows = staffIds.map((staffId) =>
        buildStaffDay({
          staffId,
          storeId: store.id,
          day,
          nowMinutes,
          live,
          planned: storePlanned.filter((p) => p.staff_id === staffId),
          actual: storeActual.filter((s) => s.staff_id === staffId),
        }),
      );

      const deviations: Deviation[] = staffRows.flatMap((r) => r.deviations);
      const workingNow = staffRows.filter((r) => r.status === "working").length;

      if (openNow && workingNow === 0) {
        deviations.push({
          kind: "unstaffed",
          storeId: store.id,
          detail: "Butiken är öppen men ingen är instämplad",
        });
      }

      const events: LiveEvent[] = [];
      storeActual.forEach((s) => {
        events.push({
          at: s.clocked_in_at,
          minutes: new Date(s.clocked_in_at).getHours() * 60 + new Date(s.clocked_in_at).getMinutes(),
          staffId: s.staff_id,
          storeId: store.id,
          kind: "in",
        });
        if (s.clocked_out_at) {
          events.push({
            at: s.clocked_out_at,
            minutes:
              new Date(s.clocked_out_at).getHours() * 60 + new Date(s.clocked_out_at).getMinutes(),
            staffId: s.staff_id,
            storeId: store.id,
            kind: "out",
          });
        }
      });
      events.sort((a, b) => b.at.localeCompare(a.at));

      return {
        id: store.id,
        name: store.name,
        city: store.city,
        isWholesale: !!store.is_wholesale,
        hoursText: store.hours ?? null,
        hours,
        openNow,
        staffRows,
        workingNow,
        plannedCount: new Set(storePlanned.map((p) => p.staff_id)).size,
        deviations,
        workedMinutes: staffRows.reduce((sum, r) => sum + r.workedMinutes, 0),
        plannedMinutes: staffRows.reduce((sum, r) => sum + r.plannedMinutes, 0),
        events,
      };
    });
  }, [stores.data, weekly.data, specials.data, actual.data, planned.data, day, nowMinutes, live]);

  const staffById = useMemo(() => {
    const map = new Map<string, any>();
    (staff.data ?? []).forEach((s: any) => map.set(s.id, s));
    return map;
  }, [staff.data]);

  return { rows, staffById, isLoading, now, nowMinutes, live };
}

export function staffName(staffById: Map<string, any>, id: string): string {
  const s = staffById.get(id);
  if (!s) return "Okänd person";
  return `${s.first_name} ${s.last_name}`.trim();
}
