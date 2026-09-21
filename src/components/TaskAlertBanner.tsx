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
  if (!alerts.length) return null;

  return (
    <div className="sticky top-0 z-40 mb-3 space-y-2">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="animate-task-alert flex items-center gap-3 rounded-xl border-2 border-primary bg-primary/10 px-3 py-3 shadow-card"
        >
          <BellRing className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Ny uppgift till dig</p>
            <p className="truncate text-sm font-semibold">{a.task}</p>
          </div>
          <Button
            size="sm"
            className="h-9 text-xs"
            onClick={() => {
              dismiss(a.id);
              navigate(`/uppgifter?markera=${a.id}`);
            }}
          >
            Öppna uppgiften
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => dismiss(a.id)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {alerts.length > 1 && (
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={dismissAll}>
          Jag har sett alla
        </Button>
      )}
    </div>
  );
}
