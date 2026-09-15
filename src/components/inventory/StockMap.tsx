import { useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Graticule,
  Line,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { MapPin, Plus, Minus, Crosshair, Route } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { stockQtyToKg } from "@/lib/units";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { cn } from "@/lib/utils";

/** 50m-upplösning ger tydligare kustlinjer och gränser än 110m. */
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

/** Fågelvägen i km mellan två punkter (lon, lat). */
const distanceKm = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const kmFmt = (v: number) =>
  `${Number(v).toLocaleString("sv-SE", { maximumFractionDigits: v < 10 ? 1 : 0 })} km`;

/** Ungefärlig körtid på väg: fågelvägen × 1,25 vid 80 km/h. */
const driveLabel = (km: number) => {
  const road = km * 1.25;
  const h = road / 80;
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
};

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
  coordinates: [number, number];
  kg: number;
  value: number;
  articles: number;
  byLevel: Record<string, number>;
  color: string;
};

const kgFmt = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const moneyFmt = (v: number) => `${Number(v || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;

/** Tydliga, distinkta enhetsfärger så varje ställe går att skilja på kartan. */
const PALETTE = [
  "#1f4d6b", // marin
  "#c1502e", // tegel
  "#d9a13b", // bärnsten
  "#2f7d54", // gran
  "#7b4b94", // plommon
  "#0f8fa8", // turkos
  "#b3365f", // hallon
  "#5c7a1e", // oliv
  "#e0762d", // orange
  "#3a5fbf", // blå
];

const MIN_ZOOM = 1;
const MAX_ZOOM = 24;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * Europakarta över alla enheter med lager. Visar var varje ställe ligger och
 * hur mycket som finns där just nu — klick på en prick zoomar in och visar
 * fördelningen per nivå.
 */
export default function StockMap({ stock, showValue = true, selectedStoreId, onSelect }: Props) {
  const { data: stores = [] } = useStores();
  const [internal, setInternal] = useState<string | null>(null);
  const selected = selectedStoreId !== undefined ? selectedStoreId : internal;
  const [view, setView] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [12, 54],
    zoom: 1,
  });
  const [showRoutes, setShowRoutes] = useState(true);

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
        coordinates: [lon, lat],
        kg: 0,
        value: 0,
        articles: 0,
        byLevel: {},
        color: PALETTE[i % PALETTE.length],
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
      point.kg += stockQtyToKg(qty, row.products) ?? qty;
      point.value += qty * (Number(row.unit_cost) || 0);
      point.articles += 1;
      point.byLevel[level] = (point.byLevel[level] || 0) + (stockQtyToKg(qty, row.products) ?? qty);
    });

    return [...agg.values()].sort((a, b) => b.kg - a.kg);
  }, [stores, stock]);

  const maxKg = Math.max(1, ...points.map((p) => p.kg));
  const active = points.find((p) => p.storeId === selected) ?? null;
  const withStock = points.filter((p) => p.kg > 0);

  /** Avstånd från vald enhet till övriga, närmast först. */
  const legs = useMemo(() => {
    if (!active) return [];
    return points
      .filter((p) => p.storeId !== active.storeId)
      .map((p) => ({ point: p, km: distanceKm(active.coordinates, p.coordinates) }))
      .sort((a, b) => a.km - b.km);
  }, [active, points]);

  const selectPoint = (p: Point | null, zoomIn = false) => {
    setInternal(p?.storeId ?? null);
    onSelect?.(p?.storeId ?? null);
    if (p && zoomIn) {
      setView({ coordinates: p.coordinates, zoom: clampZoom(Math.max(view.zoom, 8)) });
    }
  };

  const stepZoom = (factor: number) =>
    setView((v) => ({ ...v, zoom: clampZoom(v.zoom * factor) }));
  const resetView = () => setView({ coordinates: [12, 54], zoom: 1 });

  if (points.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          Lagerkarta — var finns lagret just nu
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Med lager ({withStock.length})</span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" /> Tomt lager
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <div className="relative overflow-hidden rounded-lg border border-border bg-[#dcecf3]">
          {/* Zoomkontroller */}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <button
              type="button"
              aria-label="Zooma in"
              onClick={() => stepZoom(1.6)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card shadow-sm active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Zooma ut"
              onClick={() => stepZoom(1 / 1.6)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card shadow-sm active:scale-95"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Återställ kartan"
              onClick={resetView}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card shadow-sm active:scale-95"
            >
              <Crosshair className="h-4 w-4" />
            </button>
          </div>
          <span className="absolute bottom-2 left-2 z-10 rounded bg-card/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {view.zoom.toFixed(1)}×
          </span>

          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [12, 54], scale: 620 }}
            width={900}
            height={520}
            style={{ width: "100%", height: "auto" }}
          >
            <ZoomableGroup
              center={view.coordinates}
              zoom={view.zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onMoveEnd={({ coordinates, zoom }) =>
                setView({ coordinates: coordinates as [number, number], zoom })
              }
            >
              <Geographies geography={GEO_URL}>
                {({ geographies }) =>
                  geographies.map((geo, i) => (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={
                        ["#eef4e6", "#f6efe2", "#e8f0f4", "#f2eaf0", "#eaf1ec"][i % 5]
                      }
                      stroke="#a9bcc4"
                      strokeWidth={0.5 / view.zoom}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", fill: "#e2eef2" },
                        pressed: { outline: "none" },
                      }}
                    />
                  ))
                }
              </Geographies>

              {points.map((p) => {
                const has = p.kg > 0;
                const k = 1 / view.zoom;
                const r = (has ? 6 + Math.sqrt(p.kg / maxKg) * 12 : 4) * k;
                const isActive = selected === p.storeId;
                return (
                  <Marker key={p.storeId} coordinates={p.coordinates}>
                    <g className="cursor-pointer" onClick={() => selectPoint(isActive ? null : p, true)}>
                      <title>{`${p.name}${p.city ? ` · ${p.city}` : ""}\n${kgFmt(p.kg)} · ${p.articles} artiklar`}</title>
                      {has ? <circle r={r * 2} fill={p.color} fillOpacity={0.18} /> : null}
                      <circle
                        r={r}
                        fill={has ? p.color : "#9aa8ad"}
                        fillOpacity={has ? 1 : 0.5}
                        stroke={isActive ? "#111111" : "#ffffff"}
                        strokeWidth={(isActive ? 3.5 : 2) * k}
                      />
                      <text
                        x={r + 6 * k}
                        y={4 * k}
                        style={{
                          fontSize: 13 * k,
                          fontWeight: 700,
                          fill: "#1b2b33",
                          paintOrder: "stroke",
                          stroke: "#ffffff",
                          strokeWidth: 3 * k,
                        }}
                      >
                        {p.name}
                      </text>
                      <text
                        x={r + 6 * k}
                        y={20 * k}
                        style={{
                          fontSize: 12 * k,
                          fill: has ? p.color : "#6b7a80",
                          fontWeight: 600,
                          paintOrder: "stroke",
                          stroke: "#ffffff",
                          strokeWidth: 3 * k,
                        }}
                      >
                        {has ? kgFmt(p.kg) : "tomt"}
                      </text>
                    </g>
                  </Marker>
                );
              })}
            </ZoomableGroup>
          </ComposableMap>
        </div>

        <div className="space-y-1.5">
          {active ? (
            <div className="rounded-lg border border-border bg-card p-2" style={{ borderLeft: `4px solid ${active.color}` }}>
              <p className="text-[11px] font-semibold">{active.name}</p>
              <p className="text-[10px] text-muted-foreground">{active.city ?? "—"}</p>
              <p className="mt-1 font-mono text-[11px] tabular-nums">
                {kgFmt(active.kg)}
                {showValue ? ` · ${moneyFmt(active.value)}` : ""} · {active.articles} artiklar
              </p>
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
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-2 text-[10px] text-muted-foreground">
              Tryck på en prick eller en enhet i listan — kartan zoomar dit. Rulla eller nyp för att zooma fritt.
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
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                  {p.kg > 0 ? kgFmt(p.kg) : "—"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
