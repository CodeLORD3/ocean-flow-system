import LotTraceabilityView from "@/components/inventory/LotTraceabilityView";
import { Button } from "@/components/ui/button";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import { getStoreCurrency } from "@/lib/currency";
import { useTabs } from "@/contexts/TabsContext";
import { canSeeCosts } from "@/lib/pageAccess";
import { Printer, ShieldCheck } from "lucide-react";

/**
 * Spårbarhet som egen sida, så partihistoriken kan visas direkt vid en
 * myndighetskontroll utan att letas fram i en flik.
 */
export default function TraceabilityPage() {
  const { site, activeStoreId } = useSite();
  const { openTab } = useTabs();
  const { data: stores = [] } = useStores();
  const activeStore = (stores as any[]).find((s: any) => s.id === activeStoreId);
  const currency = getStoreCurrency(activeStore as any);

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

      <LotTraceabilityView
        currency={currency}
        showCosts={canSeeCosts(site)}
        onEmptyAction={canSeeCosts(site) ? () => openTab("/purchase-reporting") : undefined}
      />
    </div>
  );
}
