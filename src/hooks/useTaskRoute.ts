import { useMemo } from "react";
import { useFloorPlans, useMapObjects, useMapZones } from "@/hooks/useStoreMap";
import { useZoneConnections } from "@/hooks/useZoneConnections";
import { useStandardRoute } from "@/hooks/useStandardRoute";
import { derivePxPerMeter } from "@/lib/mapScale";
import { applyStandardRoute, buildRoute, routeDrift } from "@/lib/taskRoute";
import type { ResolvedNeed } from "@/hooks/useResources";

/**
 * Arbetsvägen för en uppgift: systemets förslag, butikens standardväg och
 * skillnaden mellan dem. Allt hämtas ur kartan och resursregistret.
 */
export function useTaskRoute(input: {
  storeId: string | null;
  templateItemId?: string | null;
  area: { id: string; name: string } | null;
  taskName: string;
  needs: ResolvedNeed[];
  checkpoints?: string[];
  minutes?: { do?: number | null; check?: number | null };
}) {
  const { data: plans = [] } = useFloorPlans(input.storeId);
  const plan = plans[0] ?? null;
  const { data: zones = [] } = useMapZones(plan?.id ?? null);
  const { data: objects = [] } = useMapObjects(plan?.id ?? null);
  const { data: connections = [] } = useZoneConnections(input.storeId);
  const standardQuery = useStandardRoute(input.templateItemId ?? null, input.storeId);
  const standard = standardQuery.data ?? null;

  const pxPerMeter = useMemo(() => (plan ? derivePxPerMeter(plan, zones, objects) : null), [plan, zones, objects]);

  const calculated = useMemo(
    () =>
      buildRoute({
        area: input.area,
        taskName: input.taskName,
        needs: input.needs,
        zones,
        connections,
        pxPerMeter,
        checkpoints: input.checkpoints ?? [],
        minutes: input.minutes,
      }),
    [input.area, input.taskName, input.needs, zones, connections, pxPerMeter, input.checkpoints, input.minutes],
  );

  const route = useMemo(
    () => applyStandardRoute(calculated, standard, zones, connections, pxPerMeter),
    [calculated, standard, zones, connections, pxPerMeter],
  );

  const drift = useMemo(() => routeDrift(standard, calculated), [standard, calculated]);

  return {
    plan,
    zones,
    connections,
    pxPerMeter,
    standard,
    /** Vägen som gäller: standardvägen om butiken valt en, annars förslaget. */
    route,
    calculated,
    usingStandard: standard?.route_mode === "standard" && (standard?.stops?.length ?? 0) > 0,
    drift,
    isLoading: standardQuery.isLoading,
  };
}
