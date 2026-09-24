import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useStores } from "@/hooks/useStores";
import { dagsavslutPoster, dagsavslutStatus, type DagsavslutPost } from "@/lib/dagsavslut";

export interface DagsavslutButik {
  storeId: string;
  storeName: string;
  poster: DagsavslutPost[];
  saknas: DagsavslutPost[];
}

function idag() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

/**
 * Dagens avslut för de butiker användaren ser: i butiksvyn den aktiva butiken,
 * i grossist-/kontorsvyn alla aktiva butiker. Uppdateras löpande så raden
 * högst upp försvinner så snart allt är klart.
 */
export function useDagsavslut() {
  const { site, activeStoreId } = useSite();
  const { data: stores = [] } = useStores(true);

  const butiker = useMemo(() => {
    const aktiva = stores.filter(
      (s) =>
        s.active &&
        !/^Administration/i.test(s.name ?? "") &&
        !/^Testbutik/i.test(s.name ?? ""),
    );
    if (site === "shop" && activeStoreId) {
      return aktiva.filter((s) => s.id === activeStoreId);
    }
    if (site === "production") {
      return aktiva.filter((s) => /grossist/i.test(s.name ?? ""));
    }
    return aktiva;
  }, [stores, site, activeStoreId]);

  const ids = butiker.map((s) => s.id).sort();
  const dag = idag();

  const query = useQuery({
    queryKey: ["dagsavslut", dag, ids],
    enabled: ids.length > 0,
    refetchInterval: 120_000,
    queryFn: async (): Promise<DagsavslutButik[]> => {
      const res = await Promise.all(
        butiker.map(async (s) => {
          const status = await dagsavslutStatus(s.id, dag);
          const poster = dagsavslutPoster(status);
          return {
            storeId: s.id,
            storeName: s.name ?? "",
            poster,
            saknas: poster.filter((p) => !p.klar),
          };
        }),
      );
      return res.filter((r) => r.poster.length > 0);
    },
  });

  return { butiker: query.data ?? [], isLoading: query.isLoading };
}

/** Räkna om dagens avslut direkt när något blivit klart. */
export function useRefreshDagsavslut() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["dagsavslut"] });
}
