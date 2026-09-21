import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ZoneConnection } from "@/lib/taskRoute";

export type ZoneConnectionRow = ZoneConnection & {
  id: string;
  store_id: string;
  floor_plan_id: string | null;
};

/** Vilka områden man kan gå direkt mellan, med ungefärlig gångtid och avstånd. */
export function useZoneConnections(storeId?: string | null) {
  return useQuery({
    queryKey: ["zone-connections", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("map_zone_connections").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ZoneConnectionRow[];
    },
  });
}

export function useSaveZoneConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      storeId: string;
      floorPlanId?: string | null;
      fromZoneId: string;
      toZoneId: string;
      walkSeconds?: number | null;
      distanceMeters?: number | null;
      active?: boolean;
    }) => {
      if (input.fromZoneId === input.toZoneId) throw new Error("Välj två olika områden.");
      const patch = {
        store_id: input.storeId,
        floor_plan_id: input.floorPlanId ?? null,
        from_zone_id: input.fromZoneId,
        to_zone_id: input.toZoneId,
        walk_seconds: input.walkSeconds ?? null,
        distance_meters: input.distanceMeters ?? null,
        active: input.active ?? true,
      };
      if (input.id) {
        const { error } = await supabase.from("map_zone_connections").update(patch).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      // Kopplingen gäller båda riktningarna — finns den redan uppdateras den.
      const { data: existing } = await supabase
        .from("map_zone_connections")
        .select("id")
        .or(
          `and(from_zone_id.eq.${input.fromZoneId},to_zone_id.eq.${input.toZoneId}),and(from_zone_id.eq.${input.toZoneId},to_zone_id.eq.${input.fromZoneId})`,
        )
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase.from("map_zone_connections").update(patch).eq("id", existing.id);
        if (error) throw error;
        return existing.id as string;
      }
      const { data, error } = await supabase.from("map_zone_connections").insert(patch).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zone-connections"] }),
  });
}

export function useSetZoneConnectionActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("map_zone_connections").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["zone-connections"] }),
  });
}
