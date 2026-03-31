import { useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const CITY_COORDS: Record<string, [number, number]> = {
  gothenburg: [11.97, 57.71],
  göteborg: [11.97, 57.71],
  stockholm: [18.07, 59.33],
  oslo: [10.75, 59.91],
  copenhagen: [12.57, 55.68],
  köpenhamn: [12.57, 55.68],
  helsinki: [24.94, 60.17],
  zurich: [8.54, 47.38],
  zürich: [8.54, 47.38],
  london: [-0.12, 51.51],
  amsterdam: [4.9, 52.37],
  hamburg: [9.99, 53.55],
  bergen: [5.32, 60.39],
  malmö: [13.0, 55.6],
  reykjavik: [-21.9, 64.15],
  paris: [2.35, 48.86],
  berlin: [13.4, 52.52],
  madrid: [-3.7, 40.42],
  lisbon: [-9.14, 38.74],
};

interface Company {
  id: string;
  name: string;
  country: string;
  city?: string | null;
  status?: string;
}

interface Offer {
  id: string;
  company_id?: string | null;
  status: string;
  target_amount: number;
  funded_amount: number;
}

interface Props {
  companies: Company[];
  offers: Offer[];
}

export default function InvestmentMap({ companies, offers }: Props) {
  const markers = useMemo(() => {
    const companyOfferCount: Record<string, number> = {};
    const companyTotalValue: Record<string, number> = {};
    for (const o of offers) {
      if (!o.company_id) continue;
      companyOfferCount[o.company_id] = (companyOfferCount[o.company_id] || 0) + 1;
      companyTotalValue[o.company_id] = (companyTotalValue[o.company_id] || 0) + Number(o.target_amount);
    }

    return companies
      .filter((c) => c.city)
      .map((c) => {
        const key = (c.city || "").toLowerCase().trim();
        const coords = CITY_COORDS[key];
        if (!coords) return null;
        return {
          id: c.id,
          name: c.name,
          city: c.city!,
          country: c.country,
          coordinates: coords as [number, number],
          dealCount: companyOfferCount[c.id] || 0,
          totalValue: companyTotalValue[c.id] || 0,
        };
      })
      .filter(Boolean) as NonNullable<ReturnType<typeof Array.prototype.map>[number]>[];
  }, [companies, offers]);

  const activeMarkers = markers.filter((m: any) => m.dealCount > 0);
  const totalDeals = activeMarkers.reduce((s: number, m: any) => s + m.dealCount, 0);
  const totalValue = activeMarkers.reduce((s: number, m: any) => s + m.totalValue, 0);

  return (
    <div className="border border-border bg-white shadow-sm">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold text-foreground tracking-wide uppercase">
            Active Deals — Where Your Money Works
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {activeMarkers.length} {activeMarkers.length === 1 ? "location" : "locations"} · {totalDeals} active {totalDeals === 1 ? "deal" : "deals"} · {totalValue.toLocaleString()} kr total
          </p>
        </div>
        <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500 inline-block" /> Active
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-border inline-block" /> No deals
          </span>
        </div>
      </div>
      <div style={{ maxHeight: 380 }} className="overflow-hidden">
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ center: [13, 50], scale: 420 }}
          width={800}
          height={380}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup center={[13, 50]} zoom={1} minZoom={1} maxZoom={1}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#e8eef4"
                    stroke="#c8d4e0"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "#dce5ef" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {/* Inactive company markers (no deals) */}
            {markers
              .filter((m: any) => m.dealCount === 0)
              .map((m: any) => (
                <Marker key={m.id} coordinates={m.coordinates}>
                  <circle r={3} fill="#c8d4e0" stroke="#fff" strokeWidth={1} />
                </Marker>
              ))}

            {/* Active company markers */}
            {activeMarkers.map((m: any) => (
              <Marker key={m.id} coordinates={m.coordinates}>
                <circle r={6} fill="#0f2e3d" fillOpacity={0.15} stroke="none" />
                <circle r={3.5} fill="#22c55e" stroke="#fff" strokeWidth={1.5} />
                <text
                  textAnchor="start"
                  x={7}
                  y={1}
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: "8px",
                    fontWeight: 600,
                    fill: "#0f2e3d",
                  }}
                >
                  {m.name}
                </text>
                <text
                  textAnchor="start"
                  x={7}
                  y={9}
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: "6.5px",
                    fill: "#64748b",
                  }}
                >
                  {m.dealCount} {m.dealCount === 1 ? "deal" : "deals"} · {m.totalValue.toLocaleString()} kr
                </text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>
    </div>
  );
}
