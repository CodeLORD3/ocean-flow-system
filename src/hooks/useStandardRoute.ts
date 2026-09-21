import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RouteStop, StandardRoute, WorkRoute } from "@/lib/taskRoute";

/**
 * Butikens valda arbetsväg för en uppgift. Systemet föreslår, människan
 * bestämmer standarden. Kartan ändras aldrig av detta.
 */
export function useStandardRoute(templateItemId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: ["task-standard-route", templateItemId, storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_standard_routes")
        .select("*")
        .eq("template_item_id", templateItemId!)
        .eq("store_id", storeId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as StandardRoute | null) ?? null;
    },
    enabled: !!templateItemId && !!storeId,
  });
}

export function useSaveStandardRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      templateItemId: string;
      storeId: string;
      routeMode: "calculated" | "standard";
      stops: RouteStop[];
      totalMeters?: number | null;
      walkSeconds?: number | null;
      staffId?: string | null;
      currentVersion?: number | null;
    }) => {
      const { error } = await supabase.from("task_standard_routes").upsert(
        {
          template_item_id: input.templateItemId,
          store_id: input.storeId,
          route_mode: input.routeMode,
          stops: input.stops.map((s) => ({ key: s.key, purpose: s.purpose, zone_id: s.zoneId, items: s.items })),
          version: (input.currentVersion ?? 0) + 1,
          total_meters: input.totalMeters ?? null,
          walk_seconds: input.walkSeconds ?? null,
          created_by_staff_id: input.staffId ?? null,
        },
        { onConflict: "template_item_id,store_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-standard-route"] }),
  });
}

/**
 * Fryser vägen som gällde när arbetet startades. Historiken skrivs aldrig om
 * av en senare 5S-förändring.
 */
export function useFreezeRoute() {
  return useMutation({
    mutationFn: async (input: {
      checklistItemId: string;
      templateItemId?: string | null;
      storeId?: string | null;
      route: WorkRoute;
      source: "calculated" | "standard" | "manual";
      version?: number | null;
      staffId?: string | null;
    }) => {
      const { error } = await supabase.from("task_route_snapshots").insert({
        checklist_item_id: input.checklistItemId,
        template_item_id: input.templateItemId ?? null,
        store_id: input.storeId ?? null,
        stops: input.route.stops.map((s) => ({
          key: s.key,
          purpose: s.purpose,
          zone_id: s.zoneId,
          zone_name: s.zoneName,
          place: s.place,
          items: s.items,
        })),
        total_meters: input.route.totalMeters,
        walk_seconds: input.route.walkSeconds,
        route_source: input.source,
        route_version: input.version ?? null,
        created_by_staff_id: input.staffId ?? null,
      });
      if (error) throw error;
    },
  });
}

/** Historiken över vilka vägar som gällt — underlag för framtida förbättringar. */
export function useRouteSnapshots(templateItemId?: string | null, storeId?: string | null) {
  return useQuery({
    queryKey: ["task-route-snapshots", templateItemId, storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_route_snapshots")
        .select("*")
        .eq("template_item_id", templateItemId!)
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!templateItemId && !!storeId,
  });
}
