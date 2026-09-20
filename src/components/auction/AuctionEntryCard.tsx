import { ChevronRight, Gavel } from "lucide-react";
import { useTabs } from "@/contexts/TabsContext";
import { auctionDaySummary, useAuctionDay } from "@/hooks/useAuctionPurchases";

export const AUCTION_ROUTE = "/auktion";

/**
 * Ingången till auktionsinköpen. Stort kort på startvyn för den som köper
 * vid ringen — visar dagens antal partier så man ser att köpen landat.
 */
export default function AuctionEntryCard() {
  const { switchTab } = useTabs();
  const purchases = useAuctionDay();
  const summary = auctionDaySummary(purchases.data ?? []);

  return (
    <button
      type="button"
      onClick={() => switchTab(AUCTION_ROUTE)}
      className="flex min-h-[88px] w-full items-center gap-4 rounded-3xl border border-primary/30 bg-primary/10 px-4 py-4 text-left shadow-sm active:brightness-105"
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Gavel className="h-8 w-8" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-[24px] font-semibold leading-tight">
          Auktionsinköp
        </span>
        <span className="block text-[18px] leading-snug text-muted-foreground">
          {summary.count > 0
            ? `${summary.count} ${summary.count === 1 ? "parti" : "partier"} köpta i dag`
            : "Registrera vunna bud vid ringen"}
        </span>
      </span>
      <ChevronRight className="h-7 w-7 shrink-0 text-muted-foreground" />
    </button>
  );
}
