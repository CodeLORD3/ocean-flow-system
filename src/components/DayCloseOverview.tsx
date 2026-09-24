import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDagsavslut } from "@/hooks/useDagsavslut";
import { withReturn } from "@/lib/navHistory";
import { getTitleForPath } from "@/contexts/TabsContext";

/** Admin: dagens avslut för alla butiker och grossisten, samlat på Översikt. */
export function DayCloseOverview() {
  const { butiker } = useDagsavslut();
  const navigate = useNavigate();
  const location = useLocation();
  if (!butiker.length) return null;
  const kvar = butiker.filter((b) => b.saknas.length > 0).length;

  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" /> Dagens avslut
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {kvar} av {butiker.length} har något kvar
        </span>
      </div>
      <div className="divide-y divide-border">
        {butiker.map((b) => {
          const klar = b.saknas.length === 0;
          return (
            <div key={b.storeId} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="w-48 truncate text-xs font-semibold">{b.storeName}</span>
              {klar ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Klart
                </span>
              ) : (
                b.saknas.map((p) => (
                  <Button
                    key={p.nyckel}
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    onClick={() =>
                      navigate(withReturn(p.sida, `${location.pathname}${location.search}`, getTitleForPath(location.pathname)))
                    }
                  >
                    {p.etikett}
                  </Button>
                ))
              )}
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                {b.poster.length - b.saknas.length} av {b.poster.length}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
