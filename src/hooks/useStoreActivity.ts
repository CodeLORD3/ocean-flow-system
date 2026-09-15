import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type StoreActivity = {
  /** Senaste lagerrörelse (inleverans, försäljning, justering m.m.). */
  lastMovementAt: string | null;
  /** Senaste inventering (rörelse av typen inventering). */
  lastCountAt: string | null;
  /** Senaste inventeringsrapport som stängdes. */
  lastReportAt: string | null;
  /** Senaste händelse av alla slag. */
  lastAnyAt: string | null;
};

const newer = (a: string | null, b: string | null) => {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
};

/**
 * Senaste lageraktivitet per enhet — används för att direkt kunna se om någon
 * lagt in i lager eller inventerat inom 24 timmar.
 */
export function useStoreActivity() {
  return useQuery({
    queryKey: ["store-activity"],
    queryFn: async () => {
      const [locs, moves, sheets] = await Promise.all([
        supabase.from("storage_locations").select("id, store_id"),
        supabase
          .from("stock_movements")
          .select("location_id, movement_type, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("daily_stock_sheets")
          .select("store_id, closed_at, updated_at, created_at")
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);
      if (locs.error) throw locs.error;
      if (moves.error) throw moves.error;
      if (sheets.error) throw sheets.error;

      const storeOfLocation = new Map<string, string>();
      (locs.data || []).forEach((l: any) => {
        if (l.store_id) storeOfLocation.set(l.id, l.store_id);
      });

      const map = new Map<string, StoreActivity>();
      const ensure = (id: string) => {
        let e = map.get(id);
        if (!e) {
          e = { lastMovementAt: null, lastCountAt: null, lastReportAt: null, lastAnyAt: null };
          map.set(id, e);
        }
        return e;
      };

      (moves.data || []).forEach((m: any) => {
        const sid = m.location_id ? storeOfLocation.get(m.location_id) : undefined;
        if (!sid) return;
        const e = ensure(sid);
        e.lastMovementAt = newer(e.lastMovementAt, m.created_at);
        if (m.movement_type === "inventering") e.lastCountAt = newer(e.lastCountAt, m.created_at);
        e.lastAnyAt = newer(e.lastAnyAt, m.created_at);
      });

      (sheets.data || []).forEach((s: any) => {
        if (!s.store_id) return;
        const e = ensure(s.store_id);
        const ts = s.closed_at || s.updated_at || s.created_at;
        e.lastReportAt = newer(e.lastReportAt, ts);
        e.lastAnyAt = newer(e.lastAnyAt, ts);
      });

      return map;
    },
    staleTime: 60_000,
  });
}
