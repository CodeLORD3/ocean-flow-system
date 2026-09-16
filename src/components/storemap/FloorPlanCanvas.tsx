import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { STATUS_COLOR, type MapProgress } from "@/lib/mapStatus";
import { areaOf, formatSqm } from "@/lib/mapScale";
import type { FloorPlan, MapObject, MapObjectType, MapPin, MapWall, MapZone } from "@/hooks/useStoreMap";

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
  pins = [],
  pinMode = false,
  pxPerMeter = null,
  onPinPlace,
  onPinSelect,
  focus = null,
  onExitFocus,
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
  pins?: MapPin[];
  pinMode?: boolean;
  pxPerMeter?: number | null;
  onPinPlace?: (point: { x: number; y: number; zoneId: string | null }) => void;
  onPinSelect?: (pin: MapPin) => void;
  focus?: { kind: "zone" | "object"; id: string } | null;
  onExitFocus?: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [hover, setHover] = useState<{ id: string; label: string; sub: string; sx: number; sy: number } | null>(null);

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

  /* Fokusläge: zooma mjukt in på den modul man tryckt på. */
  const focusBox = focus
    ? focus.kind === "zone"
      ? zones.find((z) => z.id === focus.id)
      : objects.find((o) => o.id === focus.id)
    : null;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !focusBox) return;
    const pad = 40;
    const z = clamp(
      Math.min(el.clientWidth / (focusBox.width + pad * 2), el.clientHeight / (focusBox.height + pad * 2)),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setZoom(z);
    setOffset({
      x: el.clientWidth / 2 - (focusBox.x + focusBox.width / 2) * z,
      y: el.clientHeight / 2 - (focusBox.y + focusBox.height / 2) * z,
    });
  }, [focusBox?.id, focusBox?.x, focusBox?.y, focusBox?.width, focusBox?.height]);

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

  /* Nålläge: tryck var som helst på ritningen och punkten hamnar exakt där. */
  const placePin = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || !pinMode || !onPinPlace) return;
    e.stopPropagation();
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    const hit = [...zones].reverse().find((z) => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height);
    onPinPlace({ x: Math.round(x), y: Math.round(y), zoneId: hit?.id ?? null });
  };

  const geom = (id: string, base: { x: number; y: number; width: number; height: number }) => ghost[id] ?? base;

  return (
    <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
      <div
        ref={wrapRef}
        className={`h-[62vh] min-h-[380px] w-full touch-none ${pinMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        onClickCapture={pinMode ? placePin : undefined}
        onPointerDown={onBackgroundDown}
        onPointerMove={(e) => {
          onPointerMove(e);
          if (hover) setHover((h) => (h ? { ...h, sx: e.clientX, sy: e.clientY } : h));
        }}
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
              const isHover = hover?.id === z.id;
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
                    strokeWidth={isSel || isHover ? 3 : 2}
                    className="cursor-pointer transition-all"
                    style={{ filter: isHover ? "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" : undefined }}
                    onPointerEnter={(e) =>
                      setHover({
                        id: z.id,
                        label: z.name,
                        sub: [
                          p && p.total > 0 ? `${p.done}/${p.total} uppgifter` : "Inga uppgifter idag",
                          formatSqm(areaOf({ width: g.width, height: g.height, area_sqm: z.area_sqm }, pxPerMeter).sqm),
                        ]
                          .filter(Boolean)
                          .join(" · "),
                        sx: e.clientX,
                        sy: e.clientY,
                      })
                    }
                    onPointerLeave={() => setHover((h) => (h?.id === z.id ? null : h))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHover(null);
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
                      {(() => {
                        const a = areaOf({ width: g.width, height: g.height, area_sqm: z.area_sqm }, pxPerMeter);
                        return a.sqm == null ? null : (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {a.exact ? "" : "≈ "}{formatSqm(a.sqm)}
                          </span>
                        );
                      })()}
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
              const isHover = hover?.id === o.id;
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
                    strokeWidth={isSel || isHover ? 3 : 2}
                    className="cursor-pointer transition-all"
                    style={{ filter: isHover ? "drop-shadow(0 3px 8px rgba(0,0,0,0.35))" : undefined }}
                    onPointerEnter={(e) =>
                      setHover({
                        id: o.id,
                        label: o.name,
                        sub: [
                          t?.name,
                          p && p.total > 0 ? `${p.done}/${p.total} uppgifter` : null,
                          o.area_sqm != null ? formatSqm(Number(o.area_sqm)) : null,
                        ]
                          .filter(Boolean)
                          .join(" · "),
                        sx: e.clientX,
                        sy: e.clientY,
                      })
                    }
                    onPointerLeave={() => setHover((h) => (h?.id === o.id ? null : h))}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHover(null);
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
                      {g.height > 52 && o.area_sqm != null && (
                        <span className="text-[8px] leading-tight text-muted-foreground tabular-nums">
                          {formatSqm(Number(o.area_sqm))}
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
            {/* Lager 6 — punkter: anteckningar och uppgifter på exakt plats */}
            {pins.map((pin) => {
              const done = pin.status === "done";
              const c = done ? "hsl(var(--muted-foreground))" : pin.kind === "note" ? "hsl(var(--primary))" : "hsl(var(--warning, var(--primary)))";
              const r = 9 / Math.max(zoom, 0.5);
              return (
                <g
                  key={pin.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPinSelect?.(pin);
                  }}
                >
                  <circle cx={pin.x} cy={pin.y} r={r} fill={c} fillOpacity={done ? 0.45 : 0.95} stroke="hsl(var(--card))" strokeWidth={r / 4} />
                  <text
                    x={pin.x}
                    y={pin.y + r / 3}
                    textAnchor="middle"
                    fontSize={r}
                    fill="hsl(var(--card))"
                    style={{ pointerEvents: "none" }}
                  >
                    {done ? "\u2713" : "!"}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Namnruta vid pekaren */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border border-border bg-card px-2 py-1 shadow-lg"
          style={{ left: hover.sx + 12, top: hover.sy + 12 }}
        >
          <p className="text-[11px] font-semibold leading-tight">{hover.label}</p>
          {hover.sub && <p className="text-[10px] text-muted-foreground leading-tight">{hover.sub}</p>}
        </div>
      )}

      {/* Hela ritningen i hörnet när man är inne i en modul — tryck för att gå tillbaka */}
      {focusBox && (
        <button
          onClick={() => onExitFocus?.()}
          className="absolute left-2 top-2 rounded-md border border-border bg-card/95 p-1 shadow-md hover:border-primary"
          title="Tillbaka till hela kartan"
        >
          <svg width={116} height={82} viewBox={`0 0 ${plan.width} ${plan.height}`} className="block">
            <rect x={0} y={0} width={plan.width} height={plan.height} fill="hsl(var(--muted))" />
            {zones.map((z) => (
              <rect
                key={z.id}
                x={z.x}
                y={z.y}
                width={z.width}
                height={z.height}
                fill={z.color ?? "hsl(var(--primary))"}
                fillOpacity={0.25}
                stroke="hsl(var(--border))"
                strokeWidth={4}
              />
            ))}
            <rect
              x={focusBox.x}
              y={focusBox.y}
              width={focusBox.width}
              height={focusBox.height}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={10}
            />
          </svg>
          <span className="block text-[9px] text-muted-foreground pt-0.5">Hela kartan</span>
        </button>
      )}

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
