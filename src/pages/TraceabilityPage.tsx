import { useState } from "react";
import LotTraceabilityView from "@/components/inventory/LotTraceabilityView";
import TraceabilityCheck from "@/components/inventory/TraceabilityCheck";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import { getStoreCurrency } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { canSeeCosts } from "@/lib/pageAccess";
import { Printer, ShieldCheck } from "lucide-react";

/**
 * Spårbarhet som egen sida, så partihistoriken kan visas direkt vid en
 * myndighetskontroll utan att letas fram i en flik.
 */
export default function TraceabilityPage() {
  const { site, activeStoreId } = useSite();
  const navigate = useNavigate();
  const { data: stores = [] } = useStores();
  const activeStore = (stores as any[]).find((s: any) => s.id === activeStoreId);
  const currency = getStoreCurrency(activeStore as any);
  const [view, setView] = useState<"partier" | "kontroll">("partier");
  const { staff } = useStaffAuth();
  // Grossist och admin ser all spårbarhet. Butiken ser bara sina egna partier.
  const traceStoreId = site === "shop" && !staff?.is_platform_admin ? activeStoreId : null;
  // Spårbarhetskontrollen är tillfälligt dold — sätt till true för att visa fliken igen.
  const SHOW_TRACEABILITY_CHECK = false;

  return (
    <div className="space-y-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" /> Spårbarhet — partier
          </h1>
          <p className="text-xs text-muted-foreground">
            Partinummer, art, fångstområde, redskap, fartyg och rörelsehistorik.
          </p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => window.print()}
          >
            <Printer className="h-3 w-3" /> Skriv ut
          </Button>
        </div>
      </div>

      {SHOW_TRACEABILITY_CHECK && (
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="print:hidden">
          <TabsList className="h-9">
            <TabsTrigger value="partier" className="text-xs">
              Partier
            </TabsTrigger>
            <TabsTrigger value="kontroll" className="text-xs">
              Spårbarhetskontroll
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}


      <div style={{ display: !SHOW_TRACEABILITY_CHECK || view === "partier" ? "block" : "none" }}>
        <LotTraceabilityView
          currency={currency}
          storeId={traceStoreId}
          showCosts={canSeeCosts(site)}
          onEmptyAction={canSeeCosts(site) ? () => navigate("/purchase-reporting") : undefined}
        />
      </div>
      {SHOW_TRACEABILITY_CHECK && view === "kontroll" && <TraceabilityCheck />}
    </div>
  );
}
