import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ProductionReporting from "@/pages/ProductionReporting";
import Production from "@/pages/Production";

type SubTab = "rapportering" | "tillverkning";

/**
 * Samlad "Produktion"-vy med flikar: Produktionsrapportering och
 * Filé/Tillverkning. Båda hålls monterade så state bevaras vid flikbyte.
 */
export default function ProductionRouter() {
  const [tab, setTab] = useState<SubTab>("rapportering");

  const tabs: { value: SubTab; label: string; shortLabel?: string }[] = [
    { value: "rapportering", label: "Produktionsrapportering", shortLabel: "Rapport" },
    { value: "tillverkning", label: "Filé/Tillverkning", shortLabel: "Filé" },
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
        <div style={{ display: tab === "rapportering" ? "block" : "none" }}>
          <ProductionReporting />
        </div>
        <div style={{ display: tab === "tillverkning" ? "block" : "none" }}>
          <Production />
        </div>
      </div>
    </div>
  );
}
