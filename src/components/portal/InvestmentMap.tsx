import { useMemo, useState } from "react";
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
  rome: [12.5, 41.9],
  roma: [12.5, 41.9],
  milan: [9.19, 45.46],
  milano: [9.19, 45.46],
  barcelona: [2.17, 41.39],
  naples: [14.25, 40.85],
  napoli: [14.25, 40.85],
  valencia: [-0.38, 39.47],
  florence: [11.25, 43.77],
  firenze: [11.25, 43.77],
  geneva: [6.14, 46.2],
  genève: [6.14, 46.2],
  munich: [11.58, 48.14],
  münchen: [11.58, 48.14],
  vienna: [16.37, 48.21],
  wien: [16.37, 48.21],
  brussels: [4.35, 50.85],
  dublin: [-6.26, 53.35],
  warsaw: [21.01, 52.23],
  prague: [14.42, 50.08],
  budapest: [19.04, 47.5],
  porto: [-8.61, 41.15],
  seville: [-5.98, 37.39],
  sevilla: [-5.98, 37.39],
  bilbao: [-2.93, 43.26],
  turin: [7.69, 45.07],
  torino: [7.69, 45.07],
  genoa: [8.93, 44.41],
  genova: [8.93, 44.41],
};

// Map country names to approximate capital coords for fallback
const COUNTRY_COORDS: Record<string, [number, number]> = {
  sweden: [18.07, 59.33],
  norway: [10.75, 59.91],
  denmark: [12.57, 55.68],
  finland: [24.94, 60.17],
  iceland: [-21.9, 64.15],
  switzerland: [8.54, 47.38],
  "united kingdom": [-0.12, 51.51],
  germany: [13.4, 52.52],
  netherlands: [4.9, 52.37],
  france: [2.35, 48.86],
  spain: [-3.7, 40.42],
  italy: [12.5, 41.9],
  portugal: [-9.14, 38.74],
  austria: [16.37, 48.21],
  belgium: [4.35, 50.85],
  ireland: [-6.26, 53.35],
  poland: [21.01, 52.23],
};

interface Company {
  id: string;
  name: string;
  country: string;
  city?: string | null;
  address?: string | null;
  ticker?: string | null;
  status?: string;
}

interface Offer {
  id: string;
  title: string;
  company_id?: string | null;
  status: string;
  target_amount: number;
  funded_amount: number;
  interest_rate?: number;
}

interface Props {
  companies: Company[];
  offers: Offer[];
  onOfferClick?: (offerId: string) => void;
}

export default function InvestmentMap({ companies, offers, onOfferClick }: Props) {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const markers = useMemo(() => {
    const companyOffers: Record<string, Offer[]> = {};
    for (const o of offers) {
      if (!o.company_id) continue;
      if (!companyOffers[o.company_id]) companyOffers[o.company_id] = [];
      companyOffers[o.company_id].push(o);
    }

    return companies
      .map((c) => {
        // Try city first, then fall back to country capital
        const cityKey = (c.city || "").toLowerCase().trim();
        let coords = cityKey ? CITY_COORDS[cityKey] : undefined;
        if (!coords) {
          const countryKey = (c.country || "").toLowerCase().trim();
          coords = COUNTRY_COORDS[countryKey];
        }
        if (!coords) return null;
        const compOffers = companyOffers[c.id] || [];
        const totalValue = compOffers.reduce((s, o) => s + Number(o.target_amount), 0);
        return {
          id: c.id,
          name: c.name,
          ticker: c.ticker || c.name,
          city: c.city || c.country,
          country: c.country,
          coordinates: coords as [number, number],
          dealCount: compOffers.length,
          totalValue,
          offers: compOffers,
        };
      })
      .filter(Boolean) as any[];
  }, [companies, offers]);

  const activeMarkers = markers.filter((m: any) => m.dealCount > 0);
  const totalDeals = activeMarkers.reduce((s: number, m: any) => s + m.dealCount, 0);
  const totalValue = activeMarkers.reduce((s: number, m: any) => s + m.totalValue, 0);

  const selectedMarker = selectedCompanyId ? markers.find((m: any) => m.id === selectedCompanyId) : null;

  return (
    <div className="border border-border bg-white shadow-sm relative">
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
            <span className="h-2 w-2 rounded-full bg-mackerel inline-block" /> Active
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-border inline-block" /> No deals
          </span>
        </div>
      </div>
      <div style={{ maxHeight: 220 }} className="overflow-hidden">
        <ComposableMap
          projection="geoAzimuthalEqualArea"
          projectionConfig={{ rotate: [-10, -52, 0], scale: 600 }}
          width={900}
          height={450}
          style={{ width: "100%", height: "auto" }}
        >
          <ZoomableGroup center={[0, 0]} zoom={1} minZoom={1} maxZoom={1}>
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
                <circle r={6} fill="hsl(172, 62%, 32%)" fillOpacity={0.15} stroke="none" />
                <circle
                  r={3.5}
                  fill="hsl(172, 62%, 32%)"
                  stroke="#fff"
                  strokeWidth={1.5}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCompanyId(selectedCompanyId === m.id ? null : m.id);
                  }}
                />
                <text
                  textAnchor="start"
                  x={7}
                  y={1}
                  style={{
                    fontFamily: "system-ui, sans-serif",
                    fontSize: "8px",
                    fontWeight: 600,
                    fill: "#0f2e3d",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCompanyId(selectedCompanyId === m.id ? null : m.id);
                  }}
                >
                  {m.ticker}
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

      {/* Popup for selected company offers */}
      {selectedMarker && (
        <div
          className="absolute bottom-2 left-2 z-20 bg-white border border-border shadow-lg p-3 max-w-[280px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold text-foreground">{selectedMarker.name}</h3>
            <button
              onClick={() => setSelectedCompanyId(null)}
              className="text-muted-foreground hover:text-foreground text-xs leading-none"
            >
              ✕
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground mb-2">{selectedMarker.city}, {selectedMarker.country}</p>
          <div className="space-y-1.5">
            {selectedMarker.offers.map((o: Offer) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-2 px-2 py-1.5 border border-border hover:bg-mackerel/10 cursor-pointer transition-colors"
                onClick={() => onOfferClick?.(o.id)}
              >
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold text-foreground truncate">{o.title}</div>
                  <div className="text-[9px] text-muted-foreground">
                    {Number(o.target_amount).toLocaleString()} kr · {Number(o.interest_rate || 0).toFixed(1)}%
                  </div>
                </div>
                <span className={`shrink-0 px-1 py-0.5 text-[8px] font-bold border ${
                  o.status === "Open"
                    ? "text-mackerel bg-mackerel-light border-mackerel/30"
                    : "text-primary bg-primary/5 border-primary/20"
                }`}>
                  {o.status === "Open" ? "OPEN" : "FUNDED"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
