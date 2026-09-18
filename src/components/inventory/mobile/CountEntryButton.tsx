import { ClipboardCheck, ChevronRight } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { useCountPlaces } from "@/hooks/useMobileStockCount";

export const COUNT_MOBILE_ROUTE = "/m/inventering";

/**
 * Ingången till räkningen på telefon. Visar "Starta inventering" — eller
 * "Fortsätt inventeringen (23 av 48 klara)" när någon redan börjat i butiken.
 * Används både som stort kort på startvyn och som fast knapp i lagervyn.
 */
export default function CountEntryButton({ variant }: { variant: "card" | "sticky" }) {
  const { activeStoreId } = useSite();
  const { switchTab } = useTabs();
  const places = useCountPlaces(activeStoreId);

  const ongoing = (places.data ?? []).find((p) => p.sessionId && p.countedRows > 0);
  const label = ongoing
    ? `Fortsätt inventeringen (${ongoing.countedRows} av ${Math.max(ongoing.productCount, ongoing.countedRows)} klara)`
    : "Starta inventering";

  const open = () => switchTab(COUNT_MOBILE_ROUTE);

  if (variant === "card") {
    return (
      <button
        type="button"
        onClick={open}
        className="flex min-h-[88px] w-full items-center gap-4 rounded-3xl border border-primary/30 bg-primary/10 px-4 py-4 text-left shadow-sm active:brightness-105"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ClipboardCheck className="h-8 w-8" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-[24px] font-semibold leading-tight">
            Inventera
          </span>
          <span className="block text-[18px] leading-snug text-muted-foreground">
            {ongoing ? label : "Räkna varorna i din butik"}
          </span>
        </span>
        <ChevronRight className="h-7 w-7 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div
      className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background/95 px-3 py-3 backdrop-blur md:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <button
        type="button"
        onClick={open}
        className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-center text-[19px] font-semibold text-primary-foreground shadow-lg active:brightness-110"
      >
        <ClipboardCheck className="h-6 w-6 shrink-0" />
        <span className="truncate">{label}</span>
      </button>
    </div>
  );
}
