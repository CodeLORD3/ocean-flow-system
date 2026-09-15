import { useEffect, useMemo, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Route, Crosshair, Layers } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useStoreStockActivity } from "@/hooks/useStoreStockActivity";
import { activityLabel, activityTone, activityDotColor, isFresh, sinceLabel } from "@/lib/lastActivity";
import { stockQtyToKg } from "@/lib/units";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { cn } from "@/lib/utils";

interface Props {
  /** Rader från product_stock_locations med storage_locations + products. */
  stock: any[];
  showValue?: boolean;
  /** Vald enhet — styrs utifrån när kartan ersätter enhetsrutorna. */
  selectedStoreId?: string | null;
  onSelect?: (storeId: string | null) => void;
}

type Point = {
  storeId: string;
  name: string;
  city: string | null;
  address: string | null;

  /** [lat, lon] — Leaflet-ordning. */
  position: [number, number];
  kg: number;
  value: number;
  articles: number;
  byLevel: Record<string, number>;
  color: string;
  /** Senaste lagerhändelse och senaste inventering på enheten. */
  lastAnyAt: string | null;
  lastCountAt: string | null;
};

const kgFmt = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const moneyFmt = (v: number) => `${Number(v || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;
const kmFmt = (v: number) =>
  `${Number(v).toLocaleString("sv-SE", { maximumFractionDigits: v < 10 ? 1 : 0 })} km`;

/** Fågelvägen i km mellan två [lat, lon]-punkter. */
const distanceKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Ungefärlig körtid på väg: fågelvägen × 1,25 vid 80 km/h. */
const driveLabel = (km: number) => {
  const h = (km * 1.25) / 80;
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
};

/** Tydliga, distinkta enhetsfärger så varje ställe går att skilja på kartan. */
const PALETTE = [
  "#1f4d6b",
  "#c1502e",
  "#d9a13b",
  "#2f7d54",
  "#7b4b94",
  "#0f8fa8",
  "#b3365f",
  "#5c7a1e",
  "#e0762d",
  "#3a5fbf",
];

const TILES = {
  karta: {
    label: "Karta",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap",
    maxZoom: 19,
  },
  satellit: {
    label: "Satellit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar",
    maxZoom: 19,
  },
} as const;

/** Flyger till vald enhet — körs inuti kartan så vi når Leaflet-instansen. */
function FlyTo({ position, zoom }: { position: [number, number] | null; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!position) return;
    map.flyTo(position, Math.max(map.getZoom(), zoom), { duration: 0.8 });
  }, [map, position?.[0], position?.[1], zoom]);
  return null;
}

/** Ramar in alla enheter vid start så inget ställe hamnar utanför kartan. */
function FitAll({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length === 0) return;
    map.fitBounds(positions, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positions.length]);
  return null;
}

/**
 * Sidan ska kunna skrollas fritt: hjulzoom är av tills man klickar i kartan,
 * och stängs av igen när pekaren lämnar den.
 */
function WheelZoomOnClick({ onChange }: { onChange: (on: boolean) => void }) {
  const map = useMap();
  useEffect(() => {
    map.scrollWheelZoom.disable();
    onChange(false);
    const on = () => {
      map.scrollWheelZoom.enable();
      onChange(true);
    };
    const off = () => {
      map.scrollWheelZoom.disable();
      onChange(false);
    };
    map.on("click", on);
    map.on("mouseout", off);
    return () => {
      map.off("click", on);
      map.off("mouseout", off);
    };
  }, [map, onChange]);
  return null;
}

/** Håller reda på zoomnivån för visning i hörnet. */
function ZoomReadout({ onChange }: { onChange: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    const update = () => onChange(map.getZoom());
    update();
    map.on("zoomend", update);
    return () => {
      map.off("zoomend", update);
    };
  }, [map, onChange]);
  return null;
}

/**
 * Detaljerad karta över alla enheter med lager — går att zooma ända ner till
 * gatunivå. Klick på en enhet visar dess lager och avstånd till övriga.
 */
export default function StockMap({ stock, showValue = true, selectedStoreId, onSelect }: Props) {
  const { data: stores = [] } = useStores();
  const { data: activity } = useStoreStockActivity();
  const [internal, setInternal] = useState<string | null>(null);
  const selected = selectedStoreId !== undefined ? selectedStoreId : internal;
  const [showRoutes, setShowRoutes] = useState(true);
  const [layer, setLayer] = useState<keyof typeof TILES>("karta");
  const [zoom, setZoom] = useState(5);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [wheelZoom, setWheelZoom] = useState(false);

  const points = useMemo<Point[]>(() => {
    const agg = new Map<string, Point>();
    (stores as any[]).forEach((s, i) => {
      const lat = Number(s.latitude);
      const lon = Number(s.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      agg.set(s.id, {
        storeId: s.id,
        name: s.name,
        city: s.city ?? null,
        address: s.address ?? null,

        position: [lat, lon],
        kg: 0,
        value: 0,
        articles: 0,
        byLevel: {},
        color: PALETTE[i % PALETTE.length],
        lastAnyAt: activity?.get(s.id)?.lastAnyAt ?? null,
        lastCountAt: activity?.get(s.id)?.lastCountAt ?? null,
      });
    });

    (stock || []).forEach((row: any) => {
      const sid = row.storage_locations?.store_id;
      if (!sid) return;
      const point = agg.get(sid);
      if (!point) return;
      const qty = Number(row.quantity) || 0;
      if (qty <= 0) return;
      const level = (row.storage_locations?.location_type as LocationLevel) || "butik";
      const kg = stockQtyToKg(qty, row.products) ?? qty;
      point.kg += kg;
      point.value += qty * (Number(row.unit_cost) || 0);
      point.articles += 1;
      point.byLevel[level] = (point.byLevel[level] || 0) + kg;
    });

    return [...agg.values()].sort((a, b) => b.kg - a.kg);
  }, [stores, stock, activity]);

  const maxKg = Math.max(1, ...points.map((p) => p.kg));
  const active = points.find((p) => p.storeId === selected) ?? null;
  const withStock = points.filter((p) => p.kg > 0);

  const legs = useMemo(() => {
    if (!active) return [];
    return points
      .filter((p) => p.storeId !== active.storeId)
      .map((p) => ({ point: p, km: distanceKm(active.position, p.position) }))
      .sort((a, b) => a.km - b.km);
  }, [active, points]);

  const selectPoint = (p: Point | null, fly = false) => {
    setInternal(p?.storeId ?? null);
    onSelect?.(p?.storeId ?? null);
    if (p && fly) setFlyTarget([p.position[0] + Math.random() * 1e-9, p.position[1]]);
  };

  const resetView = () => {
    setFlyTarget(null);
    setResetKey((k) => k + 1);
  };

  if (points.length === 0) return null;

  const tile = TILES[layer];

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          Lagerkarta — var finns lagret just nu
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
          <span>Med lager ({withStock.length})</span>
          <button
            type="button"
            onClick={() => setShowRoutes((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 transition-colors",
              showRoutes ? "bg-accent text-foreground" : "hover:bg-accent",
            )}
          >
            <Route className="h-3 w-3" aria-hidden /> Avstånd
          </button>
          {(Object.keys(TILES) as (keyof typeof TILES)[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setLayer(k)}
              className={cn(
                "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 transition-colors",
                layer === k ? "bg-accent text-foreground" : "hover:bg-accent",
              )}
            >
              <Layers className="h-3 w-3" aria-hidden /> {TILES[k].label}
            </button>
          ))}
          <button
            type="button"
            onClick={resetView}
            className="flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 transition-colors hover:bg-accent"
          >
            <Crosshair className="h-3 w-3" aria-hidden /> Hela kartan
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <div className="relative isolate z-0 h-[420px] overflow-hidden rounded-lg border border-border lg:h-[520px]">
          <span className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded bg-card/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            zoom {zoom}
          </span>
          <span className="pointer-events-none absolute bottom-2 right-2 z-[500] rounded bg-card/85 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {wheelZoom ? "Hjulzoom aktiv — flytta pekaren ut för att skrolla sidan" : "Klicka i kartan för att zooma med hjulet"}
          </span>
          <MapContainer
            key={resetKey}
            center={[57, 13]}
            zoom={5}
            minZoom={3}
            maxZoom={tile.maxZoom}
            scrollWheelZoom={false}
            className="h-full w-full"
          >
            <TileLayer url={tile.url} attribution={tile.attribution} maxZoom={tile.maxZoom} />
            <ZoomReadout onChange={setZoom} />
            <WheelZoomOnClick onChange={setWheelZoom} />
            <FitAll positions={points.map((p) => p.position)} />
            <FlyTo position={flyTarget} zoom={13} />

            {showRoutes && active
              ? legs.slice(0, 8).map(({ point: p, km }) => (
                  <Polyline
                    key={`leg-${p.storeId}`}
                    positions={[active.position, p.position]}
                    pathOptions={{ color: p.color, weight: 2, dashArray: "6 5", opacity: 0.85 }}
                  >
                    <Tooltip sticky>
                      {active.name} → {p.name}: {kmFmt(km)} · ca {driveLabel(km)}
                    </Tooltip>
                  </Polyline>
                ))
              : null}

            {points.map((p) => {
              const has = p.kg > 0;
              const isActive = selected === p.storeId;
              const r = has ? 8 + Math.sqrt(p.kg / maxKg) * 14 : 6;
              return (
                <CircleMarker
                  key={p.storeId}
                  center={p.position}
                  radius={r}
                  pathOptions={{
                    color: isActive ? "#111111" : "#ffffff",
                    weight: isActive ? 3 : 2,
                    fillColor: has ? p.color : "#9aa8ad",
                    fillOpacity: has ? 0.95 : 0.5,
                  }}
                  eventHandlers={{
                    click: () => (isActive ? selectPoint(null) : selectPoint(p, true)),
                  }}
                >
                  <Tooltip
                    direction="bottom"
                    offset={[0, r + 2]}
                    permanent
                    interactive
                    opacity={1}
                    className="store-name-label"
                  >
                    <span
                      className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: activityDotColor(p.lastAnyAt) }}
                      aria-hidden
                    />
                    <span className="text-[11px] font-semibold">{p.name}</span>
                  </Tooltip>

                  <Tooltip direction="top" offset={[0, -r]} permanent={isActive}>
                    <span className="text-[11px] font-semibold">{p.name}</span>
                    {p.city ? <span className="text-[10px]"> · {p.city}</span> : null}
                    <br />
                    {p.address ? (
                      <>
                        <span className="text-[10px] text-muted-foreground">{p.address}</span>
                        <br />
                      </>
                    ) : null}

                    <span className="font-mono text-[10px] tabular-nums">
                      {has ? `${kgFmt(p.kg)} · ${p.articles} artiklar` : "tomt lager"}
                    </span>
                    <br />
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: activityDotColor(p.lastAnyAt) }}
                    >
                      Senast: {activityLabel(p.lastAnyAt)}
                    </span>
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>

        <div className="space-y-1.5">
          {active ? (
            <div
              className="rounded-lg border border-border bg-card p-2"
              style={{ borderLeft: `4px solid ${active.color}` }}
            >
              <p className="text-[11px] font-semibold">{active.name}</p>
              <p className="text-[10px] text-muted-foreground">{active.city ?? "—"}</p>
              <p className="mt-1 font-mono text-[11px] tabular-nums">
                {kgFmt(active.kg)}
                {showValue ? ` · ${moneyFmt(active.value)}` : ""} · {active.articles} artiklar
              </p>
              <div
                className={cn(
                  "mt-1.5 rounded-md border px-1.5 py-1 text-[10px]",
                  activityTone(active.lastAnyAt),
                )}
              >
                <p className="font-semibold">
                  {isFresh(active.lastAnyAt)
                    ? "Lagerhändelse inom 24 h"
                    : active.lastAnyAt
                      ? "Inget gjort på över 24 h"
                      : "Ingen lagerhändelse alls"}
                </p>
                <p className="font-mono tabular-nums">
                  Senast: {activityLabel(active.lastAnyAt)}
                  {sinceLabel(active.lastAnyAt) ? ` · ${sinceLabel(active.lastAnyAt)}` : ""}
                </p>
                <p className="font-mono tabular-nums">
                  Inventering: {activityLabel(active.lastCountAt)}
                </p>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {Object.entries(active.byLevel).length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">Inget lager på enheten just nu.</p>
                ) : (
                  Object.entries(active.byLevel).map(([lvl, v]) => (
                    <div key={lvl} className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        {LEVEL_LABEL[lvl as LocationLevel] ?? lvl}
                      </span>
                      <span className="font-mono tabular-nums">{kgFmt(v)}</span>
                    </div>
                  ))
                )}
              </div>

              {legs.length > 0 ? (
                <div className="mt-2 border-t border-border pt-1.5">
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold">
                    <Route className="h-3 w-3" aria-hidden /> Avstånd härifrån
                  </p>
                  <div className="max-h-[130px] space-y-0.5 overflow-y-auto pr-1">
                    {legs.map(({ point: p, km }) => (
                      <button
                        key={`d-${p.storeId}`}
                        type="button"
                        onClick={() => selectPoint(p, true)}
                        className="flex w-full items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-[10px] hover:bg-accent"
                      >
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{ background: p.color }}
                          />
                          <span className="truncate">{p.city ?? p.name}</span>
                        </span>
                        <span className="shrink-0 font-mono tabular-nums">
                          {kmFmt(km)}
                          <span className="text-muted-foreground"> · {driveLabel(km)}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-2 text-[10px] text-muted-foreground">
              Tryck på en enhet — kartan flyger dit och zoomar in på gatunivå. Rulla eller nyp för att
              zooma fritt.
            </p>
          )}

          <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {points.map((p) => (
              <button
                key={p.storeId}
                type="button"
                onClick={() => (selected === p.storeId ? selectPoint(null) : selectPoint(p, true))}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-left text-[10px] transition-colors hover:bg-accent",
                  selected === p.storeId && "bg-accent",
                )}
                style={{ borderLeft: `4px solid ${p.kg > 0 ? p.color : "#9aa8ad"}` }}
              >
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{p.name}</span>
                  {p.city ? <span className="text-muted-foreground"> · {p.city}</span> : null}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {p.kg > 0 ? kgFmt(p.kg) : "—"}
                  </span>
                  <span
                    className="font-mono text-[9px] tabular-nums"
                    style={{ color: activityDotColor(p.lastAnyAt) }}
                  >
                    {activityLabel(p.lastAnyAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
