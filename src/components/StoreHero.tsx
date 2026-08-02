import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import { useStoreCoverImages } from "@/hooks/useStoreCoverImages";
import { MapPin, Store as StoreIcon } from "lucide-react";

/**
 * Hero/cover image shown at the top of every page inside a shop portal.
 */
export function StoreHero() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const { data: stores = [] } = useStores();
  const covers = useStoreCoverImages();

  if (site !== "shop" || !activeStoreId) return null;

  const store = stores.find((s) => s.id === activeStoreId);
  const url = covers[activeStoreId] || store?.logo_url || null;

  return (
    <div className="relative mb-4 h-28 sm:h-36 lg:h-44 w-full overflow-hidden rounded-lg border border-border bg-muted">
      {url ? (
        <img
          src={url}
          alt={`Omslagsbild för ${activeStoreName ?? "butiken"}`}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <StoreIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base sm:text-xl font-semibold text-foreground">
            {activeStoreName ?? store?.name ?? "Butik"}
          </h2>
          {(store?.city || store?.address) && (
            <p className="flex items-center gap-1 truncate text-[11px] sm:text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {[store?.address, store?.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
