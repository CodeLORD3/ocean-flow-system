import { useMemo } from "react";
import { useStores } from "@/hooks/useStores";
import { useStoreOpeningHours } from "@/hooks/useStoreOpeningHours";
import { useSpecialDays } from "@/hooks/useStoreOrderSettings";
import { leadDaysForRegion, nextDeliveryDay, type DeliveryDay } from "@/lib/deliveryDay";

/**
 * Nästa leveransdag för butikens beställning, räknad ur butikens öppetdagar
 * och butikens framförhållning. Används av knappen i räkningen och av
 * dagens beställning.
 */
export function useNextDeliveryDay(storeId?: string | null): DeliveryDay {
  const stores = useStores();
  const hours = useStoreOpeningHours(storeId);
  const special = useSpecialDays(storeId);

  const store = (stores.data ?? []).find((s: any) => s.id === storeId) as any;
  const openWeekdays = (hours.data ?? [])
    .filter((h) => !h.closed)
    .map((h) => Number(h.weekday));
  const closedDates = (special.data ?? [])
    .filter((d: any) => d.closed)
    .map((d: any) => String(d.day));

  return useMemo(
    () =>
      nextDeliveryDay({
        openWeekdays,
        leadDays: leadDaysForRegion(store?.region),
        closedDates,
      }),
    [openWeekdays.join(","), closedDates.join(","), store?.region],
  );
}
