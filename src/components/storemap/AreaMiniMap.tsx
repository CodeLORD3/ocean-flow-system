import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";
import { toPath, zonePoints } from "@/lib/mapGeometry";

/**
 * Liten bild på hela kartan som visar var man befinner sig när bara
 * ett område visas stort. Enbart presentation — ingen data ändras.
 */
export function AreaMiniMap({
  plan,
  zones,
  activeZoneId,
  className,
}: {
  plan: FloorPlan;
  zones: MapZone[];
  activeZoneId?: string | null;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${plan.width} ${plan.height}`}
      className={className}
      role="img"
      aria-label="Hela butikskartan"
      preserveAspectRatio="xMidYMid meet"
    >
      <rect x={0} y={0} width={plan.width} height={plan.height} fill="hsl(var(--muted))" />
      {zones.map((z) => {
        const active = z.id === activeZoneId;
        return (
          <polygon
            key={z.id}
            points={toPath(zonePoints(z))}
            fill={active ? z.color ?? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
            fillOpacity={active ? 0.95 : 0.25}
            stroke={active ? "hsl(var(--foreground))" : "hsl(var(--border))"}
            strokeWidth={active ? 6 : 2}
          />
        );
      })}
    </svg>
  );
}
