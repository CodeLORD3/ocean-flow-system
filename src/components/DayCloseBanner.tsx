import { useLocation, useNavigate } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDagsavslut } from "@/hooks/useDagsavslut";
import { withReturn } from "@/lib/navHistory";
import { getTitleForPath } from "@/contexts/TabsContext";

/**
 * Raden högst upp: vad som är kvar att göra i dag per butik. Syns för alla
 * hela dagen och försvinner när dagsrapport, inventering, beställning till
 * grossisten och inköp är klara.
 */
export function DayCloseBanner() {
  const { butiker } = useDagsavslut();
  const navigate = useNavigate();
  const location = useLocation();

  const kvar = butiker.filter((b) => b.saknas.length > 0);
  if (kvar.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {kvar.map((b) => (
        <div
          key={b.storeId}
          className="rounded-xl border border-l-4 border-border border-l-destructive bg-card px-3 py-2.5 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-destructive">
              <ClipboardList className="h-4 w-4" />
              Kvar i dag
            </p>
            <p className="truncate text-xs font-semibold text-foreground">{b.storeName}</p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {b.saknas.map((p) => (
              <Button
                key={p.nyckel}
                size="sm"
                variant="outline"
                className="h-9 rounded-full text-xs font-semibold"
                onClick={() =>
                  navigate(
                    withReturn(
                      p.sida,
                      `${location.pathname}${location.search}`,
                      getTitleForPath(location.pathname),
                    ),
                  )
                }
              >
                {p.etikett}
              </Button>
            ))}
            <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
              {b.poster.length - b.saknas.length} av {b.poster.length} klara
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
