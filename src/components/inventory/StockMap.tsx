import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { MapPin } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { stockQtyToKg } from "@/lib/units";
import { LEVEL_LABEL, type LocationLevel } from "@/lib/locations";
import { cn } from "@/lib/utils";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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
};

const kgFmt = (v: number) =>
  `${Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
const moneyFmt = (v: number) => `${Number(v || 0).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;

/**
 * Europakarta över alla enheter med lager. Visar var varje ställe ligger och
 * hur mycket som finns där just nu — klick på en prick visar fördelningen per nivå.
 */
export default function StockMap({ stock, showValue = true }: Props) {
  const { data: stores = [] } = useStores();
  const [selected, setSelected] = useState<string | null>(null);

  const points = useMemo<Point[]>(() => {
    const agg = new Map<string, Point>();
    (stores as any[]).forEach((s) => {
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

  if (points.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
          Lagerkarta — var finns lagret just nu
        </p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" /> Med lager ({withStock.length})
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/40" /> Tomt lager
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
        <div className="relative overflow-hidden rounded-lg border border-border bg-secondary/30">
          <ComposableMap
            projection="geoMercator"
            projectionConfig={{ center: [12, 54], scale: 620 }}
            width={900}
            height={520}
            style={{ width: "100%", height: "auto" }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="hsl(var(--muted))"
                    stroke="hsl(var(--border))"
                    strokeWidth={0.6}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "hsl(var(--muted))" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {points.map((p) => {
              const has = p.kg > 0;
              const r = has ? 6 + Math.sqrt(p.kg / maxKg) * 12 : 4;
              const isActive = selected === p.storeId;
              return (
                <Marker key={p.storeId} coordinates={p.coordinates}>
                  <g
                    className="cursor-pointer"
                    onClick={() => setSelected(isActive ? null : p.storeId)}
                  >
                    <title>{`${p.name}${p.city ? ` · ${p.city}` : ""}\n${kgFmt(p.kg)} · ${p.articles} artiklar`}</title>
                    {has ? (
                      <circle r={r * 2} fill="hsl(var(--primary))" fillOpacity={0.14} />
                    ) : null}
                    <circle
                      r={r}
                      fill={has ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                      fillOpacity={has ? 1 : 0.45}
                      stroke="hsl(var(--card))"
                      strokeWidth={isActive ? 4 : 2}
                    />
                    <text
                      x={r + 6}
                      y={4}
                      style={{ fontSize: 13, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                    >
                      {p.name}
                    </text>
                    <text x={r + 6} y={20} style={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}>
                      {has ? kgFmt(p.kg) : "tomt"}
                    </text>
                  </g>
                </Marker>
              );
            })}
          </ComposableMap>
        </div>

        <div className="space-y-1.5">
          {active ? (
            <div className="rounded-lg border border-border bg-card p-2">
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
              Tryck på en prick på kartan för att se enhetens lager.
            </p>
          )}

          <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {points.map((p) => (
              <button
                key={p.storeId}
                type="button"
                onClick={() => setSelected(selected === p.storeId ? null : p.storeId)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border border-border px-2 py-1 text-left text-[10px] transition-colors hover:bg-accent",
                  selected === p.storeId && "border-primary bg-accent",
                )}
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
