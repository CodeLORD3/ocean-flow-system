import { Info } from "lucide-react";
import { CountryFlag } from "./CountryBadge";
import type { CartLineOrigin } from "../store/cart";

interface OriginChipProps {
  origin?: CartLineOrigin | null;
  onClick?: () => void;
}

function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])}/${Number(m[2])}`;
}

/**
 * Tiny chip on a cart line showing origin country + caught date.
 * Tap to open TraceabilityModal.
 */
export default function OriginChip({ origin, onClick }: OriginChipProps) {
  if (!origin || (!origin.country && !origin.caught_at)) {
    return (
      <button
        onClick={onClick}
        className="text-[10px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1"
        title="Visa spårbarhet"
      >
        <Info className="h-2.5 w-2.5" /> Spårbarhet
      </button>
    );
  }
  const date = shortDate(origin.caught_at);
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground transition"
      title="Visa full spårbarhet"
    >
      {origin.country && <CountryFlag iso={origin.country} />}
      {origin.vessel && <span className="hidden sm:inline">· {origin.vessel}</span>}
      {date && <span>· {date}</span>}
      {origin.msc && (
        <span className="ml-0.5 rounded-sm bg-primary/10 text-primary px-1 text-[9px] font-medium">
          MSC
        </span>
      )}
    </button>
  );
}
