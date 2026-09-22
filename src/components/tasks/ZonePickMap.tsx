import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Minus, Plus, RotateCcw } from "lucide-react";
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
  onNext,
  autoNext,
}: {
  plan: FloorPlan;
  zones: MapZone[];
  value: string | null;
  onChange: (zoneId: string | null) => void;
  numberOf?: (zoneId: string) => number | null;
  colorOf?: (zoneId: string) => string | null;
  onNext?: () => void;
  /** Går vidare av sig självt när man tryckt på en yta utan ytor inuti. */
  autoNext?: boolean;
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

  const selected = useMemo(() => zones.find((z) => z.id === value) ?? null, [zones, value]);

  const children = useMemo(
    () => (value ? zones.filter((z) => z.parent_zone_id === value) : []),
    [zones, value],
  );

  /** Namnet blinkar upp en kort stund som bekräftelse innan nästa steg. */
  const [flash, setFlash] = useState<string | null>(null);

  /** Väljer en yta. Saknar den ytor inuti går vi vidare av oss självt. */
  const pick = (zoneId: string | null) => {
    onChange(zoneId);
    if (!zoneId || !autoNext || !onNext) return;
    const zone = zones.find((z) => z.id === zoneId);
    setFlash(zone?.name ?? null);
    window.setTimeout(() => {
      setFlash(null);
      onNext();
    }, 700);
  };

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
          className={cn(
            "h-[64vh] min-h-[420px] max-h-[760px] w-full touch-none",
            zoom > 1 && "cursor-grab",
          )}
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
              const color = colorOf?.(zone.id) ?? zone.color ?? "hsl(var(--primary))";
              const num = numberOf?.(zone.id) ?? null;
              /** Textstorlek i kartans egna mått så namnen alltid går att läsa. */
              const u = view.w / 640 / zoom;
              const label = num !== null ? `${num}. ${zone.name}` : zone.name;
              return (
                <g
                  key={zone.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(isSel ? null : zone.id);
                  }}
                >
                  <polygon
                    points={path}
                    fill={color}
                    fillOpacity={isSel ? 0.55 : isChild ? 0.34 : 0.26}
                    stroke={color}
                    strokeWidth={(isSel ? 5 : 2.5) * u}
                  />
                  {isSel && (
                    <polygon
                      points={path}
                      fill="none"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={2 * u}
                      strokeDasharray={`${8 * u} ${6 * u}`}
                    />
                  )}
                  <text
                    x={mid.x}
                    y={mid.y + 5 * u}
                    textAnchor="middle"
                    fontSize={15 * u}
                    stroke="hsl(var(--card))"
                    strokeWidth={5 * u}
                    paintOrder="stroke"
                    className={cn("fill-foreground", isSel ? "font-bold" : "font-semibold")}
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {flash && (
          <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
            <p className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg">
              Valt: {flash}
            </p>
          </div>
        )}

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
                onClick={() => pick(c.id)}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 border-primary bg-card p-3 shadow-sm">
          <p className="text-sm">
            Valt område: <span className="font-semibold">{selected.name}</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-full border px-3 py-2 text-sm hover:bg-muted"
            >
              Ta bort valet
            </button>
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                Välj person <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
