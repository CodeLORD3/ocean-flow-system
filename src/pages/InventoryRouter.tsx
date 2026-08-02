import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Inventory from "@/pages/Inventory";
import Products from "@/pages/Products";
import Pricing from "@/pages/Pricing";

type SubTab = "lager" | "produkter" | "priser";

/**
 * Combined "Lager" view with three sub-tabs: Lager, Produkter, Priser.
 * All three stay mounted so state is preserved when switching.
 */
export default function InventoryRouter() {
  const [tab, setTab] = useState<SubTab>("lager");

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)}>
          <TabsList>
            <TabsTrigger value="lager">Lager</TabsTrigger>
            <TabsTrigger value="produkter">Produkter</TabsTrigger>
            <TabsTrigger value="priser">Priser</TabsTrigger>
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
        <div style={{ display: tab === "priser" ? "block" : "none" }}>
          <Pricing />
        </div>
      </div>
    </div>
  );
}
