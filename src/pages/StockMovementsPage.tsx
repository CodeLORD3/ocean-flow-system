import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import StockMovementsView from "@/components/inventory/StockMovementsView";
import { useSite } from "@/contexts/SiteContext";
import { useStorageLocations } from "@/hooks/useStorageLocations";
import { useStores } from "@/hooks/useStores";
import { getStoreCurrency } from "@/lib/currency";
import { useNavigate } from "react-router-dom";
import { canSeeCosts } from "@/lib/pageAccess";
import { ArrowRight, History } from "lucide-react";

/**
 * Lagerrörelser som egen sida. Butik ser bara sin egen enhets lagerplatser.
 */
export default function StockMovementsPage() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const navigate = useNavigate();
  const { data: stores = [] } = useStores();
  const { data: locations = [] } = useStorageLocations(activeStoreId || "all");

  const activeStore = (stores as any[]).find((s: any) => s.id === activeStoreId);
  const currency = getStoreCurrency(activeStore as any);

  const locationIds = useMemo(
    () => (activeStoreId ? (locations as any[]).map((l: any) => l.id).filter(Boolean) : undefined),
    [locations, activeStoreId],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
            <History className="h-5 w-5 text-primary" /> Lagerrörelser
          </h1>
          <p className="text-xs text-muted-foreground">
            Varje förändring av lagersaldot, i tidsordning
            {activeStoreName ? ` — ${activeStoreName}` : ""}.
          </p>
        </div>
        {canSeeCosts(site) && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => navigate("/purchase-reporting")}
          >
            Till inköpsrapportering <ArrowRight className="h-3 w-3" />
          </Button>
        )}
      </div>

      <StockMovementsView
        locationIds={locationIds}
        currency={currency}
        showCosts={canSeeCosts(site)}
        onEmptyAction={canSeeCosts(site) ? () => navigate("/purchase-reporting") : undefined}
      />
    </div>
  );
}
