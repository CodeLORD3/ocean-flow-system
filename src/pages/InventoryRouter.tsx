import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Pricing from "@/pages/Pricing";
import Barcodes from "@/pages/Barcodes";
import StockTransfers from "@/pages/StockTransfers";
import WasteReports from "@/pages/WasteReports";
import TraceabilityPage from "@/pages/TraceabilityPage";
import { useSite } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";

type SubTab =
  | "lager"
  | "overforingar"
  | "produkter"
  | "streckkoder"
  | "priser"
  | "svinn"
  | "sparbarhet";

/**
 * Samlad "Lager"-vy med flikar: Lager, Överföringar, Produkter, Streckkoder,
 * Priser, Svinn och Spårbarhet. Alla hålls monterade så state bevaras.
 */
export default function InventoryRouter() {
  const { site } = useSite();
  const showPricing = canAccessRoute(site, "/pricing");
  // Butiksportalen har inga egna flikar för Överföringar, Streckkoder eller Svinn.
  // Svinn rapporteras direkt på produktraden i lagret.
  const isShopPortal = !(site === "wholesale" || site === "production");
  const [tab, setTab] = useState<SubTab>("lager");

  const tabs: { value: SubTab; label: string; shortLabel?: string }[] = [
    { value: "lager", label: "Lager" },
    ...(isShopPortal
      ? []
      : ([{ value: "overforingar", label: "Överföringar", shortLabel: "Överför" }] as const)),
    { value: "produkter", label: "Produkter" },
    ...(isShopPortal ? [] : ([{ value: "streckkoder", label: "Streckkoder", shortLabel: "Koder" }] as const)),
    ...(showPricing ? ([{ value: "priser", label: "Priser" }] as const) : []),
    ...(isShopPortal ? [] : ([{ value: "svinn", label: "Svinn" }] as const)),
    { value: "sparbarhet", label: "Spårbarhet", shortLabel: "Spår" },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="w-full">
          <TabsList
            className="w-full h-10 sm:h-12 grid gap-1 p-1"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                {t.shortLabel ? (
                  <>
                    <span className="sm:hidden">{t.shortLabel}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ display: tab === "lager" ? "block" : "none" }}>
          <Inventory />
        </div>
        <div style={{ display: tab === "overforingar" ? "block" : "none" }}>
          <StockTransfers />
        </div>
        <div style={{ display: tab === "produkter" ? "block" : "none" }}>
          <Products />
        </div>
        <div style={{ display: tab === "streckkoder" ? "block" : "none" }}>
          <Barcodes />
        </div>
        {showPricing && (
          <div style={{ display: tab === "priser" ? "block" : "none" }}>
            <Pricing />
          </div>
        )}
        <div style={{ display: tab === "svinn" ? "block" : "none" }}>
          <WasteReports />
        </div>
        <div style={{ display: tab === "sparbarhet" ? "block" : "none" }}>
          <TraceabilityPage />
        </div>
      </div>
    </div>
  );
}
