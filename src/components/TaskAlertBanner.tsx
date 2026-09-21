import { useLocation, useNavigate } from "react-router-dom";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyTaskAlerts } from "@/hooks/useMyTaskAlerts";
import { withReturn } from "@/lib/navHistory";
import { getTitleForPath } from "@/contexts/TabsContext";

/**
 * Blinkande rad högst upp på sidan när jag får en ny uppgift. Ljudet spelas av
 * useMyTaskAlerts — här visas bara vad som hänt och en väg direkt till uppgiften.
 */
export function TaskAlertBanner() {
  const { alerts, dismiss, dismissAll } = useMyTaskAlerts();
  const navigate = useNavigate();
  const location = useLocation();
  if (!alerts.length) return null;

  return (
    <div className="sticky top-0 z-40 mb-3 space-y-2 rounded-xl bg-background p-1">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="animate-task-alert flex items-center gap-3 rounded-xl border-2 border-destructive bg-card px-3 py-3 shadow-card"
        >

          <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
            <span className="animate-alert-dot absolute inset-0 rounded-full bg-destructive/30" />
            <BellRing className="relative h-5 w-5 text-destructive" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-destructive">Ny uppgift till dig</p>
            <p className="truncate text-sm font-semibold">{a.task}</p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-10 text-xs font-semibold"
            onClick={() => {
              dismiss(a.id);
              navigate(
                withReturn(
                  `/uppgifter?markera=${a.id}`,
                  `${location.pathname}${location.search}`,
                  getTitleForPath(location.pathname),
                ),
              );
            }}
          >
            Öppna uppgiften
          </Button>
          <Button size="icon" variant="ghost" className="h-10 w-10 text-destructive" onClick={() => dismiss(a.id)}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      ))}

      {alerts.length > 1 && (
        <Button size="sm" variant="outline" className="h-9 bg-card text-xs font-semibold" onClick={dismissAll}>
          Jag har sett alla
        </Button>
      )}

    </div>
  );
}
