import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { FloorPlan, MapZone } from "@/hooks/useStoreMap";
import { centroid, toPath, zonePoints } from "@/lib/mapGeometry";
import { cn } from "@/lib/utils";

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Liten karta för att peka ut ett område när man inte minns namnet.
 * Man kan zooma och dra i kartan, och ytor som ligger inuti en annan yta
 * kan väljas både direkt på kartan och i listan under den.
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
  const boxRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  /** Djup i trädet, så en yta inuti en annan ritas ovanpå sin förälder. */
  const depthOf = useMemo(() => {
    const byId = new Map(zones.map((z) => [z.id, z]));
    const d = new Map<string, number>();
    const depth = (z: MapZone, guard = 0): number => {
      if (d.has(z.id)) return d.get(z.id)!;
      const parent = z.parent_zone_id ? byId.get(z.parent_zone_id) : null;
      const val = parent && guard < 20 ? depth(parent, guard + 1) + 1 : 0;
      d.set(z.id, val);
      return val;
    };
    zones.forEach((z) => depth(z));
    return d;
  }, [zones]);

  const shapes = useMemo(
    () =>
      [...zones]
        .sort(
          (a, b) =>
            (depthOf.get(a.id) ?? 0) - (depthOf.get(b.id) ?? 0) || a.sort_order - b.sort_order,
        )
        .map((z) => {
          const pts = zonePoints(z);
          return { zone: z, path: toPath(pts), mid: centroid(pts) };
        }),
    [zones, depthOf],
  );

  const children = useMemo(
    () => (value ? zones.filter((z) => z.parent_zone_id === value) : []),
    [zones, value],
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

  /** Zoomar så att punkten under fingret/pekaren står still. */
  const zoomAt = (px: number, py: number, next: number) => {
    setZoom((prev) => {
      const z = clamp(next, MIN_ZOOM, MAX_ZOOM);
      const k = z / prev;
      setOffset((o) => ({ x: px - (px - o.x) * k, y: py - (py - o.y) * k }));
      return z;
    });
  };

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const scaleX = view.w / rect.width;
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * (view.h / rect.height);
      zoomAt(px, py, zoomRef.current * Math.exp(-dy * 0.0015));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.w, view.h]);

  const zoomButton = (dir: 1 | -1) => {
    zoomAt(view.w / 2, view.h / 2, zoom * (dir === 1 ? 1.4 : 1 / 1.4));
  };

  const reset = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-2">
      <div ref={boxRef} className="relative overflow-hidden rounded-lg border bg-muted/30">
        <svg
          viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
          className={cn("h-[300px] w-full touch-none", zoom > 1 && "cursor-grab")}
          role="img"
          aria-label="Välj område på butikskartan"
          onPointerDown={(e) => {
            if (zoom <= 1) return;
            drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
            (e.target as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            const rect = boxRef.current?.getBoundingClientRect();
            if (!rect) return;
            setOffset({
              x: d.ox + (e.clientX - d.x) * (view.w / rect.width),
              y: d.oy + (e.clientY - d.y) * (view.h / rect.height),
            });
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
          }}
        >
          <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
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
              const isChild = !!zone.parent_zone_id;
              const color = colorOf?.(zone.id) ?? "hsl(var(--primary))";
              const num = numberOf?.(zone.id) ?? null;
              return (
                <g
                  key={zone.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(isSel ? null : zone.id);
                  }}
                >
                  <polygon
                    points={path}
                    fill={color}
                    fillOpacity={isSel ? 0.5 : isChild ? 0.22 : 0.14}
                    stroke={color}
                    strokeWidth={(isSel ? 4 : 2) / zoom}
                  />
                  {num !== null && (
                    <>
                      <circle cx={mid.x} cy={mid.y - 18 / zoom} r={16 / zoom} fill={color} />
                      <text
                        x={mid.x}
                        y={mid.y - 12 / zoom}
                        textAnchor="middle"
                        fontSize={15 / zoom}
                        className="fill-white font-semibold"
                      >
                        {num}
                      </text>
                    </>
                  )}
                  <text
                    x={mid.x}
                    y={mid.y + 14 / zoom}
                    textAnchor="middle"
                    fontSize={14 / zoom}
                    className="fill-foreground"
                  >
                    {zone.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => zoomButton(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Zooma ut"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
            {zoom.toFixed(1)}x
          </span>
          <button
            type="button"
            onClick={() => zoomButton(1)}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Zooma in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Visa hela kartan"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Zooma med knapparna eller rullhjulet och dra i kartan. Tryck på ytan du menar.
      </p>

      {children.length > 0 && (
        <div className="space-y-1 rounded-lg border p-2">
          <p className="text-xs font-medium">Ytor inuti — välj en av dem om du menar den</p>
          <div className="flex flex-wrap gap-2">
            {children.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c.id)}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
