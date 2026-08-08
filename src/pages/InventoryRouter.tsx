import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Pricing from "@/pages/Pricing";
import Barcodes from "@/pages/Barcodes";
import { useSite } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";

type SubTab = "lager" | "produkter" | "streckkoder" | "priser";

/**
 * Combined "Lager" view with three sub-tabs: Lager, Produkter, Priser.
 * All three stay mounted so state is preserved when switching.
 */
export default function InventoryRouter() {
  const { site } = useSite();
  const showPricing = canAccessRoute(site, "/pricing");
  const [tab, setTab] = useState<SubTab>("lager");

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="w-full">
          <TabsList className="w-full h-10 sm:h-12 grid gap-1 p-1" style={{ gridTemplateColumns: `repeat(${showPricing ? 4 : 3}, minmax(0, 1fr))` }}>
            <TabsTrigger
              value="lager"
              className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Lager
            </TabsTrigger>
            <TabsTrigger
              value="produkter"
              className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Produkter
            </TabsTrigger>
            <TabsTrigger
              value="streckkoder"
              className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              <span className="sm:hidden">Koder</span>
              <span className="hidden sm:inline">Streckkoder</span>
            </TabsTrigger>
            {showPricing && (
              <TabsTrigger
                value="priser"
                className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                Priser
              </TabsTrigger>
            )}
          </TabsList>

        </Tabs>
      </div>


      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ display: tab === "lager" ? "block" : "none" }}>
          <Inventory />
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
      </div>
    </div>
  );
}
