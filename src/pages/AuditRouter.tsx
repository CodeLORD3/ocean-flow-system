import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AuditLog from "@/pages/AuditLog";
import StockMovementsPage from "@/pages/StockMovementsPage";

type SubTab = "logg" | "lagerrorelser";

/**
 * Revision & Logg med två flikar: aktivitetslogg och lagerrörelser.
 * Båda hålls monterade så filter och scrollposition bevaras.
 */
export default function AuditRouter() {
  const [tab, setTab] = useState<SubTab>("logg");

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b bg-background px-4 pt-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)} className="w-full">
          <TabsList className="w-full h-10 sm:h-12 grid grid-cols-2 gap-1 p-1">
            <TabsTrigger
              value="logg"
              className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Aktivitetslogg
            </TabsTrigger>
            <TabsTrigger
              value="lagerrorelser"
              className="h-full text-xs sm:text-base font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
            >
              Lagerrörelser
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <div style={{ display: tab === "logg" ? "block" : "none" }}>
          <AuditLog />
        </div>
        <div style={{ display: tab === "lagerrorelser" ? "block" : "none" }}>
          <StockMovementsPage />
        </div>
      </div>
    </div>
  );
}
