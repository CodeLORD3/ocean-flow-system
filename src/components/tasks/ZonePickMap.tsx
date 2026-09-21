import { useMemo } from "react";
import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";
import { centroid, toPath, zonePoints } from "@/lib/mapGeometry";

/**
 * Liten karta för att peka ut ett område när man inte minns namnet.
 * Ett tryck på en yta väljer den, ett tryck på den valda ytan tar bort valet.
 */
export function ZonePickMap({
  plan,
  zones,
  value,
  onChange,
  numberOf,
  colorOf,
}: {
  plan: FloorPlan;
  zones: MapZone[];
  value: string | null;
  onChange: (zoneId: string | null) => void;
  numberOf?: (zoneId: string) => number | null;
  colorOf?: (zoneId: string) => string | null;
}) {
  const shapes = useMemo(
    () =>
      [...zones]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((z) => {
          const pts = zonePoints(z);
          return { zone: z, path: toPath(pts), mid: centroid(pts) };
        }),
    [zones],
  );

  const view = useMemo(() => {
    const pts = shapes.flatMap((s) => s.path.split(" ").map((p) => p.split(",").map(Number)));
    if (pts.length === 0) return { x: 0, y: 0, w: plan.width, h: plan.height };
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 50;
    const x = Math.min(...xs) - pad;
    const y = Math.min(...ys) - pad;
    return { x, y, w: Math.max(...xs) - x + pad, h: Math.max(...ys) - y + pad };
  }, [shapes, plan.width, plan.height]);

  return (
    <div className="overflow-hidden rounded-lg border bg-muted/30">
      <svg
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        className="h-[260px] w-full"
        role="img"
        aria-label="Välj område på butikskartan"
      >
        {plan.background_url && (
          <image
            href={plan.background_url}
            x={plan.background_x}
            y={plan.background_y}
            width={plan.width * plan.background_scale}
            height={plan.height * plan.background_scale}
            opacity={plan.background_opacity * 0.5}
            preserveAspectRatio="xMidYMid meet"
          />
        )}
        {shapes.map(({ zone, path, mid }) => {
          const isSel = value === zone.id;
          const color = colorOf?.(zone.id) ?? "hsl(var(--primary))";
          const num = numberOf?.(zone.id) ?? null;
          return (
            <g
              key={zone.id}
              className="cursor-pointer"
              onClick={() => onChange(isSel ? null : zone.id)}
            >
              <polygon
                points={path}
                fill={color}
                fillOpacity={isSel ? 0.5 : 0.16}
                stroke={color}
                strokeWidth={isSel ? 4 : 2}
              />
              {num !== null && (
                <>
                  <circle cx={mid.x} cy={mid.y - 18} r={16} fill={color} />
                  <text
                    x={mid.x}
                    y={mid.y - 12}
                    textAnchor="middle"
                    className="fill-white text-[15px] font-semibold"
                  >
                    {num}
                  </text>
                </>
              )}
              <text x={mid.x} y={mid.y + 14} textAnchor="middle" className="fill-foreground text-[14px]">
                {zone.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
