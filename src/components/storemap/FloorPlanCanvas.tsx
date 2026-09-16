import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { STATUS_COLOR, type MapProgress } from "@/lib/mapStatus";
import type { FloorPlan, MapObject, MapObjectType, MapWall, MapZone } from "@/hooks/useStoreMap";

export type Selection = { kind: "zone" | "object"; id: string } | null;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type DragState = {
  kind: "zone" | "object";
  id: string;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  origX: number;
  origY: number;
  origW: number;
  origH: number;
};

export function FloorPlanCanvas({
  plan,
  zones,
  objects,
  walls,
  types,
  zoneProgress,
  objectProgress,
  selected,
  onSelect,
  editMode,
  showBackground,
  showGrid,
  onCommit,
}: {
  plan: FloorPlan;
  zones: MapZone[];
  objects: MapObject[];
  walls: MapWall[];
  types: Record<string, MapObjectType>;
  zoneProgress: Record<string, MapProgress>;
  objectProgress: Record<string, MapProgress>;
  selected: Selection;
  onSelect: (s: Selection) => void;
  editMode: boolean;
  showBackground: boolean;
  showGrid: boolean;
  onCommit?: (patch: {
    kind: "zone" | "object";
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const z = Math.min(el.clientWidth / plan.width, el.clientHeight / plan.height) * 0.95;
    setZoom(z);
    setOffset({ x: (el.clientWidth - plan.width * z) / 2, y: (el.clientHeight - plan.height * z) / 2 });
  }, [plan.width, plan.height]);

  useEffect(() => {
    fit();
  }, [fit]);

  /* Zoom mot pekaren, med icke-passiv lyssnare så sidan inte skrollar bakom. */
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
    const next = clamp(zoom * Math.exp(-dy * 0.0015), MIN_ZOOM, MAX_ZOOM);
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const k = next / zoom;
    setOffset({ x: px - (px - offset.x) * k, y: py - (py - offset.y) * k });
    setZoom(next);
  };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* Panorering med tomt underlag */
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const zoomBy = (factor: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const next = clamp(zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const px = el.clientWidth / 2;
    const py = el.clientHeight / 2;
    const k = next / zoom;
    setOffset({ x: px - (px - offset.x) * k, y: py - (py - offset.y) * k });
    setZoom(next);
  };

  const snap = (v: number) => (plan.grid_size > 0 ? Math.round(v / plan.grid_size) * plan.grid_size : Math.round(v));

  const startDrag = (
    e: React.PointerEvent,
    kind: "zone" | "object",
    item: { id: string; x: number; y: number; width: number; height: number },
    mode: "move" | "resize",
  ) => {
    if (!editMode) return;
    e.stopPropagation();
    onSelect({ kind, id: item.id });
    setDrag({
      kind,
      id: item.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: item.x,
      origY: item.y,
      origW: item.width,
      origH: item.height,
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panRef.current) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.x),
        y: panRef.current.oy + (e.clientY - panRef.current.y),
      });
      return;
    }
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / zoom;
    const dy = (e.clientY - drag.startY) / zoom;
    const next =
      drag.mode === "move"
        ? { x: snap(drag.origX + dx), y: snap(drag.origY + dy), width: drag.origW, height: drag.origH }
        : {
            x: drag.origX,
            y: drag.origY,
            width: Math.max(16, snap(drag.origW + dx)),
            height: Math.max(16, snap(drag.origH + dy)),
          };
    setGhost((g) => ({ ...g, [drag.id]: next }));
  };

  const endPointer = () => {
    panRef.current = null;
    if (drag) {
      const g = ghost[drag.id];
      if (g && onCommit) onCommit({ kind: drag.kind, id: drag.id, ...g });
      setDrag(null);
    }
  };

  const geom = (id: string, base: { x: number; y: number; width: number; height: number }) => ghost[id] ?? base;

  return (
    <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
      <div
        ref={wrapRef}
        className="h-[62vh] min-h-[380px] w-full touch-none cursor-grab active:cursor-grabbing"
        onPointerDown={onBackgroundDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
            {/* Lager 1 — originalritningen */}
            <rect x={0} y={0} width={plan.width} height={plan.height} fill="hsl(var(--card))" />
            {showBackground && plan.background_url && (
              <image
                href={plan.background_url}
                x={plan.background_x}
                y={plan.background_y}
                width={plan.width * plan.background_scale}
                height={plan.height * plan.background_scale}
                opacity={plan.background_opacity}
                preserveAspectRatio="xMidYMid meet"
              />
            )}

            {showGrid && plan.grid_size > 0 && (
              <g opacity={0.25}>
                {Array.from({ length: Math.ceil(plan.width / plan.grid_size) + 1 }).map((_, i) => (
                  <line
                    key={`v${i}`}
                    x1={i * plan.grid_size}
                    y1={0}
                    x2={i * plan.grid_size}
                    y2={plan.height}
                    stroke="hsl(var(--border))"
                  />
                ))}
                {Array.from({ length: Math.ceil(plan.height / plan.grid_size) + 1 }).map((_, i) => (
                  <line
                    key={`h${i}`}
                    x1={0}
                    y1={i * plan.grid_size}
                    x2={plan.width}
                    y2={i * plan.grid_size}
                    stroke="hsl(var(--border))"
                  />
                ))}
              </g>
            )}

            {/* Lager 2 — väggar, dörrar, öppningar */}
            {walls.map((w) => (
              <line
                key={w.id}
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                strokeWidth={w.thickness}
                strokeLinecap="round"
                stroke={w.kind === "wall" ? "hsl(var(--foreground))" : "hsl(var(--primary))"}
                strokeDasharray={w.kind === "opening" ? "8 6" : undefined}
                opacity={w.kind === "wall" ? 0.8 : 0.6}
              />
            ))}

            {/* Lager 3 — zoner */}
            {zones.map((z) => {
              const g = geom(z.id, z);
              const p = zoneProgress[z.id];
              const isSel = selected?.kind === "zone" && selected.id === z.id;
              const stroke = p ? STATUS_COLOR[p.status] : (z.color ?? "hsl(var(--primary))");
              return (
                <g key={z.id} onPointerDown={(e) => startDrag(e, "zone", g as MapZone, "move")}>
                  <rect
                    x={g.x}
                    y={g.y}
                    width={g.width}
                    height={g.height}
                    rx={8}
                    fill={z.color ?? "hsl(var(--primary))"}
                    fillOpacity={isSel ? 0.2 : 0.09}
                    stroke={isSel ? "hsl(var(--primary))" : stroke}
                    strokeWidth={isSel ? 3 : 2}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ kind: "zone", id: z.id });
                    }}
                  />
                  <foreignObject x={g.x + 6} y={g.y + 4} width={Math.max(60, g.width - 12)} height={28} style={{ pointerEvents: "none" }}>
                    <div className="flex items-center gap-1.5 pointer-events-none">
                      <span className="text-[11px] font-semibold text-foreground truncate">{z.name}</span>
                      {p && p.total > 0 && (
                        <span
                          className="text-[10px] font-semibold tabular-nums px-1 rounded"
                          style={{ color: STATUS_COLOR[p.status] }}
                        >
                          {p.percent}%
                        </span>
                      )}
                      {p && p.openIssues > 0 && (
                        <span className="text-[10px] font-semibold text-destructive">{p.openIssues} anm.</span>
                      )}
                    </div>
                  </foreignObject>
                  {editMode && isSel && (
                    <rect
                      x={g.x + g.width - 7}
                      y={g.y + g.height - 7}
                      width={14}
                      height={14}
                      fill="hsl(var(--primary))"
                      className="cursor-nwse-resize"
                      onPointerDown={(e) => startDrag(e, "zone", g as MapZone, "resize")}
                    />
                  )}
                </g>
              );
            })}

            {/* Lager 4 och 5 — inventarier och utrustning */}
            {objects.map((o) => {
              const g = geom(o.id, o);
              const t = types[o.object_type_id];
              const p = objectProgress[o.id];
              const isSel = selected?.kind === "object" && selected.id === o.id;
              const color = p ? STATUS_COLOR[p.status] : (t?.color ?? "hsl(var(--primary))");
              return (
                <g
                  key={o.id}
                  transform={`rotate(${o.rotation} ${g.x + g.width / 2} ${g.y + g.height / 2})`}
                  onPointerDown={(e) => startDrag(e, "object", g as MapObject, "move")}
                >
                  <rect
                    x={g.x}
                    y={g.y}
                    width={g.width}
                    height={g.height}
                    rx={t?.shape === "point" ? Math.min(g.width, g.height) / 2 : 4}
                    fill="hsl(var(--card))"
                    stroke={color}
                    strokeWidth={isSel ? 3 : 2}
                    className="cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ kind: "object", id: o.id });
                    }}
                  />
                  <foreignObject x={g.x} y={g.y} width={g.width} height={g.height} style={{ pointerEvents: "none" }}>
                    <div className="h-full w-full flex flex-col items-center justify-center gap-0.5 pointer-events-none px-0.5">
                      <MapObjectIcon icon={t?.icon} size={Math.min(18, Math.max(11, g.height / 3))} />
                      {g.height > 34 && (
                        <span className="text-[8px] leading-tight text-center text-muted-foreground truncate w-full">
                          {o.name}
                        </span>
                      )}
                    </div>
                  </foreignObject>
                  {p && p.status === "red" && (
                    <circle cx={g.x + g.width - 3} cy={g.y + 3} r={4} fill="hsl(var(--destructive))" />
                  )}
                  {editMode && isSel && (
                    <rect
                      x={g.x + g.width - 6}
                      y={g.y + g.height - 6}
                      width={12}
                      height={12}
                      fill="hsl(var(--primary))"
                      className="cursor-nwse-resize"
                      onPointerDown={(e) => startDrag(e, "object", g as MapObject, "resize")}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md border border-border bg-card/95 p-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(1 / 1.25)}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[10px] tabular-nums w-9 text-center text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => zoomBy(1.25)}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fit}>
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
