import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Pricing from "@/pages/Pricing";
import Barcodes from "@/pages/Barcodes";

type SubTab = "lager" | "produkter" | "streckkoder" | "priser";

/**
 * Combined "Lager" view with three sub-tabs: Lager, Produkter, Priser.
 * All three stay mounted so state is preserved when switching.
 */
export default function InventoryRouter() {
  const [tab, setTab] = useState<SubTab>("lager");

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="w-full">
          <TabsList className="w-full h-12 grid grid-cols-4 gap-1 p-1">
            <TabsTrigger
              value="lager"
              className="h-full text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Lager
            </TabsTrigger>
            <TabsTrigger
              value="produkter"
              className="h-full text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Produkter
            </TabsTrigger>
            <TabsTrigger
              value="streckkoder"
              className="h-full text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Streckkoder
            </TabsTrigger>
            <TabsTrigger
              value="priser"
              className="h-full text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Priser
            </TabsTrigger>
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
        <div style={{ display: tab === "priser" ? "block" : "none" }}>
          <Pricing />
        </div>
      </div>
    </div>
  );
}
