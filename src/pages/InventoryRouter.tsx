import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Inventory from "@/pages/Inventory";
import StockCount from "@/pages/StockCount";
import Products from "@/pages/Products";
import Pricing from "@/pages/Pricing";
import Barcodes from "@/pages/Barcodes";
import StockTransfers from "@/pages/StockTransfers";
import WasteReports from "@/pages/WasteReports";
import TraceabilityPage from "@/pages/TraceabilityPage";
import StockTransformation from "@/pages/StockTransformation";
import { useSite } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";

type SubTab =
  | "lager"
  | "inventering"
  | "omvandling"
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
    { value: "inventering", label: "Inventering", shortLabel: "Invent." },
    { value: "omvandling", label: "Omvandling", shortLabel: "Omv." },
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
    <div className="w-full flex flex-col">
      <div className="sticky top-0 z-30 -mx-2 -mt-2 sm:-mx-4 sm:-mt-4 lg:-mx-6 lg:-mt-6 border-b bg-background px-2 pt-2 pb-1 sm:px-4 sm:pt-3">

        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="w-full">
          <TabsList
            className="grid w-full h-auto flex-nowrap gap-0.5 p-0.5 sm:h-12 sm:gap-1 sm:p-1"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="min-h-8 min-w-0 px-0.5 text-[10px] font-semibold leading-tight sm:h-full sm:px-2 sm:text-base data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                <span className="truncate sm:hidden">{t.shortLabel ?? t.label}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="pt-4">
        <div style={{ display: tab === "lager" ? "block" : "none" }}>
          <Inventory />
        </div>
        <div style={{ display: tab === "inventering" ? "block" : "none" }}>
          <StockCount />
        </div>
        <div style={{ display: tab === "omvandling" ? "block" : "none" }}>
          <StockTransformation />
        </div>
        {!isShopPortal && (
          <div style={{ display: tab === "overforingar" ? "block" : "none" }}>
            <StockTransfers />
          </div>
        )}
        <div style={{ display: tab === "produkter" ? "block" : "none" }}>
          <Products />
        </div>
        {!isShopPortal && (
          <div style={{ display: tab === "streckkoder" ? "block" : "none" }}>
            <Barcodes />
          </div>
        )}
        {showPricing && (
          <div style={{ display: tab === "priser" ? "block" : "none" }}>
            <Pricing />
          </div>
        )}
        {!isShopPortal && (
          <div style={{ display: tab === "svinn" ? "block" : "none" }}>
            <WasteReports />
          </div>
        )}
        <div style={{ display: tab === "sparbarhet" ? "block" : "none" }}>
          <TraceabilityPage />
        </div>
      </div>
    </div>
  );
}
