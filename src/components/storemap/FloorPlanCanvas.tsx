import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Maximize2 } from "lucide-react";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { STATUS_COLOR, type MapProgress } from "@/lib/mapStatus";
import { areaOf, formatSqm } from "@/lib/mapScale";
import {
  bbox,
  centroid,
  fromNormalized,
  pointInPolygon,
  toNormalized,
  toPath,
  translatePoints,
  zonePoints,
  type Pt,
} from "@/lib/mapGeometry";
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
  zoneNumbers = {},
  photoSpots = [],
  showPhotos = true,
  placeZoneId = null,
  onPlacePhoto,
  onPhotoSpotSelect,
  onZonePointsCommit,
  showObjects = true,
  showPins = true,
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
  /** Nummerbricka per zon, som i legendraden under kartan. */
  zoneNumbers?: Record<string, number>;
  /** Bilder som ligger på en exakt plats inom en yta. */
  photoSpots?: { id: string; zoneId: string; norm: { x: number; y: number }; count: number; url: string }[];
  showPhotos?: boolean;
  /** Placeringsläge: rutnätet tänds bara inuti den valda ytan. */
  placeZoneId?: string | null;
  onPlacePhoto?: (zoneId: string, norm: { x: number; y: number }) => void;
  onPhotoSpotSelect?: (zoneId: string) => void;
  onZonePointsCommit?: (id: string, points: { x: number; y: number }[]) => void;
  /** Inventarier ritas bara i redigeringsläget — normalvyn ska vara ren. */
  showObjects?: boolean;
  showPins?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});
  const [hover, setHover] = useState<{ id: string; label: string; sub: string; sx: number; sy: number } | null>(null);
  /** Dragning av en enskild polygonpunkt i redigeringsläget. */
  const [vDrag, setVDrag] = useState<{ zoneId: string; index: number; base: Pt[]; startX: number; startY: number } | null>(
    null,
  );
  const [ghostPts, setGhostPts] = useState<Record<string, Pt[]>>({});

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

  /* Tillbaka till hela kartan när fokus släpps. */
  const hadFocus = useRef(false);
  useEffect(() => {
    if (focusBox) hadFocus.current = true;
    else if (hadFocus.current) {
      hadFocus.current = false;
      fit();
    }
  }, [focusBox, fit]);

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
    if (vDrag) {
      const dx = (e.clientX - vDrag.startX) / zoom;
      const dy = (e.clientY - vDrag.startY) / zoom;
      const next = vDrag.base.map((p, i) =>
        i === vDrag.index ? { x: snap(p.x + dx), y: snap(p.y + dy) } : p,
      );
      if (vDrag.index < 0) {
        setGhostPts((g) => ({ ...g, [vDrag.zoneId]: translatePoints(vDrag.base, snap(dx), snap(dy)) }));
        return;
      }
      setGhostPts((g) => ({ ...g, [vDrag.zoneId]: next }));
      return;
    }
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
    if (vDrag) {
      const pts = ghostPts[vDrag.zoneId];
      if (pts && onZonePointsCommit) onZonePointsCommit(vDrag.zoneId, pts);
      setVDrag(null);
      return;
    }
    if (drag) {
      const g = ghost[drag.id];
      if (g && onCommit) onCommit({ kind: drag.kind, id: drag.id, ...g });
      setDrag(null);
    }
  };

  /** Bildpunkt i planens koordinater ur en pekarhändelse. */
  const planPoint = (e: React.MouseEvent): Pt | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: (e.clientX - rect.left - offset.x) / zoom, y: (e.clientY - rect.top - offset.y) / zoom };
  };

  const ptsOf = (z: MapZone) => ghostPts[z.id] ?? zonePoints(z);

  /* Nålläge: tryck var som helst på ritningen och punkten hamnar exakt där. */
  const placePin = (e: React.MouseEvent) => {
    if (!pinMode || !onPinPlace) return;
    const pt = planPoint(e);
    if (!pt) return;
    e.stopPropagation();
    const hit = [...zones].reverse().find((z) => pointInPolygon(pt, ptsOf(z)));
    onPinPlace({ x: Math.round(pt.x), y: Math.round(pt.y), zoneId: hit?.id ?? null });
  };

  /* Placeringsläge: klicket blir en relativ plats (0–1) inom den valda ytan. */
  const placePhoto = (e: React.MouseEvent) => {
    const zone = zones.find((z) => z.id === placeZoneId);
    if (!zone || !onPlacePhoto) return;
    const pt = planPoint(e);
    if (!pt) return;
    const pts = ptsOf(zone);
    if (!pointInPolygon(pt, pts)) return;
    e.stopPropagation();
    onPlacePhoto(zone.id, toNormalized(pt, pts));
  };

  const geom = (id: string, base: { x: number; y: number; width: number; height: number }) => ghost[id] ?? base;

  return (
    <div className="relative rounded-md border border-border bg-muted/20 overflow-hidden">
      <div
        ref={wrapRef}
        className={`h-[62vh] min-h-[380px] w-full touch-none ${pinMode || placeZoneId ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
        onClickCapture={pinMode ? placePin : placeZoneId ? placePhoto : undefined}
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

            {/* Lager 3 — zoner som riktiga polygoner efter planritningen */}
            {zones.map((z) => {
              const pts = ptsOf(z);
              const b = bbox(pts);
              const c = centroid(pts);
              const p = zoneProgress[z.id];
              const isSel = selected?.kind === "zone" && selected.id === z.id;
              const isHover = hover?.id === z.id;
              const dim = (hover && !isHover) || (selected && !isSel) || (placeZoneId && placeZoneId !== z.id);
              const identity = z.color ?? "hsl(var(--primary))";
              const status = p ? STATUS_COLOR[p.status] : identity;
              const area = areaOf({ width: b.width, height: b.height, area_sqm: z.area_sqm }, pxPerMeter);
              const num = zoneNumbers[z.id];
              return (
                <g
                  key={z.id}
                  opacity={dim ? 0.45 : 1}
                  style={{ transition: "opacity 180ms ease" }}
                  onPointerDown={(e) => {
                    if (!editMode) return;
                    e.stopPropagation();
                    onSelect({ kind: "zone", id: z.id });
                    setVDrag({ zoneId: z.id, index: -1, base: pts, startX: e.clientX, startY: e.clientY });
                  }}
                >
                  <polygon
                    points={toPath(pts)}
                    fill={identity}
                    fillOpacity={isSel ? 0.5 : isHover ? 0.42 : 0.3}
                    stroke={isSel || isHover ? identity : status}
                    strokeWidth={isSel ? 4 : isHover ? 3.5 : 2.5}
                    strokeLinejoin="round"
                    className="cursor-pointer"
                    style={{
                      transition: "fill-opacity 180ms ease, stroke-width 180ms ease, filter 180ms ease",
                      filter: isHover || isSel ? "drop-shadow(0 3px 10px rgba(15,35,50,0.28))" : undefined,
                    }}
                    onPointerEnter={(e) =>
                      setHover({
                        id: z.id,
                        label: z.name,
                        sub: [
                          p && p.total > 0
                            ? p.done >= p.total
                              ? "Allt klart ✓"
                              : `${p.total - p.done} uppgifter kvar`
                            : "Inga uppgifter idag",
                          formatSqm(area.sqm),
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

                  {/* Svagt rutnät bara inuti den yta man placerar en bild i */}
                  {placeZoneId === z.id && plan.grid_size > 0 && (
                    <g clipPath={`url(#zone-clip-${z.id})`} opacity={0.5} style={{ pointerEvents: "none" }}>
                      <clipPath id={`zone-clip-${z.id}`}>
                        <polygon points={toPath(pts)} />
                      </clipPath>
                      {Array.from({ length: Math.ceil(b.width / plan.grid_size) + 1 }).map((_, i) => (
                        <line
                          key={`pv${i}`}
                          x1={b.x + i * plan.grid_size}
                          y1={b.y}
                          x2={b.x + i * plan.grid_size}
                          y2={b.y + b.height}
                          stroke="hsl(var(--foreground))"
                          strokeWidth={0.5}
                        />
                      ))}
                      {Array.from({ length: Math.ceil(b.height / plan.grid_size) + 1 }).map((_, i) => (
                        <line
                          key={`ph${i}`}
                          x1={b.x}
                          y1={b.y + i * plan.grid_size}
                          x2={b.x + b.width}
                          y2={b.y + i * plan.grid_size}
                          stroke="hsl(var(--foreground))"
                          strokeWidth={0.5}
                        />
                      ))}
                    </g>
                  )}

                  {/* Nummerbricka, namn och yta i zonens tyngdpunkt */}
                  <g style={{ pointerEvents: "none" }}>
                    {num != null && (
                      <>
                        <circle cx={c.x} cy={c.y - 22} r={14} fill={identity} stroke="hsl(var(--card))" strokeWidth={2.5} />
                        <text
                          x={c.x}
                          y={c.y - 17}
                          textAnchor="middle"
                          fontSize={14}
                          fontWeight={700}
                          fill="#ffffff"
                        >
                          {num}
                        </text>
                      </>
                    )}
                    <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="hsl(var(--foreground))">
                      {z.name}
                    </text>
                    {area.sqm != null && (
                      <text x={c.x} y={c.y + 20} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
                        {area.exact ? "" : "≈ "}
                        {formatSqm(area.sqm)}
                      </text>
                    )}
                    {p && p.total > 0 && (
                      <circle cx={c.x + 34} cy={c.y - 22} r={5} fill={STATUS_COLOR[p.status]} />
                    )}
                  </g>

                  {/* Polygonpunkter: bara i redigeringsläget för vald zon */}
                  {editMode &&
                    isSel &&
                    pts.map((pt, i) => (
                      <circle
                        key={`v${i}`}
                        cx={pt.x}
                        cy={pt.y}
                        r={6}
                        fill="hsl(var(--card))"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2.5}
                        className="cursor-move"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setVDrag({ zoneId: z.id, index: i, base: pts, startX: e.clientX, startY: e.clientY });
                        }}
                      />
                    ))}
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

            {/* Lager 7 — bilder på exakt plats: små markörer, aldrig miniatyrer */}
            {showPhotos &&
              photoSpots.map((spot) => {
                const zone = zones.find((z) => z.id === spot.zoneId);
                if (!zone) return null;
                const pt = fromNormalized(spot.norm, ptsOf(zone));
                const r = 9 / Math.max(zoom, 0.5);
                return (
                  <g
                    key={spot.id}
                    className="cursor-pointer"
                    onPointerEnter={(e) =>
                      setHover({
                        id: spot.id,
                        label: spot.count > 1 ? `${spot.count} bilder här` : "1 bild här",
                        sub: zone.name,
                        sx: e.clientX,
                        sy: e.clientY,
                      })
                    }
                    onPointerLeave={() => setHover((h) => (h?.id === spot.id ? null : h))}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPhotoSpotSelect?.(zone.id);
                    }}
                  >
                    <rect
                      x={pt.x - r}
                      y={pt.y - r}
                      width={r * 2}
                      height={r * 2}
                      rx={r / 2.5}
                      fill="hsl(var(--card))"
                      stroke="hsl(var(--primary))"
                      strokeWidth={r / 4.5}
                    />
                    <circle cx={pt.x} cy={pt.y} r={r / 2.6} fill="hsl(var(--primary))" />
                    {spot.count > 1 && (
                      <text
                        x={pt.x + r}
                        y={pt.y - r}
                        fontSize={r}
                        fontWeight={700}
                        fill="hsl(var(--primary))"
                        style={{ pointerEvents: "none" }}
                      >
                        {spot.count}
                      </text>
                    )}
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
              <polygon
                key={z.id}
                points={toPath(ptsOf(z))}
                fill={z.color ?? "hsl(var(--primary))"}
                fillOpacity={0.3}
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

      {/* Zoomreglage som i ritningsvyn: plus, minus, procent och passa in */}
      <div className="absolute right-3 top-3 flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card/95 p-1 shadow-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1.25)} title="Zooma in">
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomBy(1 / 1.25)} title="Zooma ut">
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-9 text-center text-[10px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fit} title="Passa in hela ritningen">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
