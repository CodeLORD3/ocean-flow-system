import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";
import { centroid, toPath, zonePoints } from "@/lib/mapGeometry";
import type { TaskRowArea } from "@/components/tasks/TaskRow";

export type ZoneTaskCount = { total: number; left: number };

type Props = {
  plan: FloorPlan;
  zones: MapZone[];
  areas: Map<string, TaskRowArea>;
  /** Uppgifter per område: hur många totalt och hur många som är kvar. */
  counts: Map<string, ZoneTaskCount>;
  /** Valt område, samma värde som områdesfiltret i listan. */
  selected: string;
  onSelect: (zoneId: string) => void;
  onOpenMap?: () => void;
};

/**
 * Butikskartan i uppgiftslistan: varje område färgas efter hur mycket som är
 * kvar idag och ett klick filtrerar listan på området. Kartan och listan visar
 * samma nummer, så "2. Kundyta" i listan är område 2 på kartan.
 */
export function TaskZoneMap({ plan, zones, areas, counts, selected, onSelect, onOpenMap }: Props) {
  const shapes = useMemo(
    () =>
      [...zones]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((z) => {
          const pts = zonePoints(z);
          return { zone: z, path: toPath(pts), mid: centroid(pts), area: areas.get(z.id) ?? null };
        }),
    [zones, areas],
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <p className="text-sm font-semibold">Var i butiken</p>
        <div className="flex items-center gap-2">
          {selected !== "all" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onSelect("all")}>
              Visa hela butiken
            </Button>
          )}
          {onOpenMap && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onOpenMap}>
              Öppna butikskartan
            </Button>
          )}
        </div>
      </div>

      <div className="bg-muted/30">
        <svg
          viewBox={`0 0 ${plan.width} ${plan.height}`}
          className="h-[240px] w-full sm:h-[320px]"
          role="img"
          aria-label="Butikskartan med dagens uppgifter"
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
          {shapes.map(({ zone, path, mid, area }) => {
            const c = counts.get(zone.id) ?? { total: 0, left: 0 };
            const isSel = selected === zone.id;
            const color = area?.color ?? "hsl(var(--primary))";
            return (
              <g
                key={zone.id}
                onClick={() => onSelect(isSel ? "all" : zone.id)}
                className="cursor-pointer"
              >
                <polygon
                  points={path}
                  fill={color}
                  fillOpacity={isSel ? 0.5 : c.left > 0 ? 0.3 : 0.14}
                  stroke={color}
                  strokeWidth={isSel ? 4 : 2}
                />
                <circle cx={mid.x} cy={mid.y - 18} r={16} fill={color} />
                <text
                  x={mid.x}
                  y={mid.y - 12}
                  textAnchor="middle"
                  className="fill-white text-[15px] font-semibold"
                >
                  {area?.number ?? ""}
                </text>
                <text x={mid.x} y={mid.y + 14} textAnchor="middle" className="fill-foreground text-[14px]">
                  {zone.name}
                </text>
                {c.total > 0 && (
                  <text
                    x={mid.x}
                    y={mid.y + 32}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[13px]"
                  >
                    {c.left > 0 ? `${c.left} kvar av ${c.total}` : `${c.total} klara`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2 border-t p-3">
        {shapes.map(({ zone, area }) => {
          const c = counts.get(zone.id) ?? { total: 0, left: 0 };
          const isSel = selected === zone.id;
          return (
            <button
              key={zone.id}
              type="button"
              onClick={() => onSelect(isSel ? "all" : zone.id)}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                isSel ? "border-primary bg-primary/10 font-semibold" : "border-border",
              )}
            >
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ background: area?.color ?? "hsl(var(--primary))" }}
              >
                {area?.number ?? ""}
              </span>
              {zone.name}
              {c.total > 0 && (
                <span className="font-mono tabular-nums text-muted-foreground">
                  {c.left > 0 ? `${c.left}/${c.total}` : `${c.total} klara`}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
