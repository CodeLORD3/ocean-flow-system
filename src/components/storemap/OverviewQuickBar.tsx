import { ClipboardList, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { MapTask } from "@/hooks/useStoreMap";

/** Alltid grönt — stapeln visar hur mycket som är klart. */
function tone(_pct: number) {
  return { text: "text-emerald-600", bar: "bg-emerald-500" };
}

/**
 * Två stora knappar högst upp i Översikt — dagens uppgifter och stämpla in —
 * med en bred stapel där varje uppgift är en stolpe som tänds när den är klar.
 */
export function OverviewQuickBar({ tasks }: { tasks: MapTask[] }) {
  const navigate = useNavigate();
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  const t = tone(pct);

  /** Översikten är bara en översikt — knappen leder vidare till uppgiftssidan. */
  const openTasks = () => navigate("/uppgifter");

  /** Max 60 stolpar så stapeln håller sig läsbar även med många uppgifter. */
  const bars = total > 0 && total <= 60 ? tasks : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={openTasks}
          className="flex items-center gap-3 rounded-2xl border border-border bg-primary px-5 py-5 text-left text-primary-foreground shadow-sm transition hover:brightness-110"
        >
          <ClipboardList className="h-7 w-7 shrink-0" />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold leading-tight">Dagens uppgifter</span>
            <span className="block text-xs tabular-nums opacity-80">
              {total - done} kvar av {total}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/clock")}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-sm transition hover:bg-muted"
        >
          <Clock className="h-7 w-7 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold leading-tight">Stämpla in</span>
            <span className="block text-xs text-muted-foreground">Stämpelklockan för butiken</span>
          </span>
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex items-end justify-between">
          <p className="text-xs text-muted-foreground">Klart idag</p>
          <p className={cn("font-heading text-3xl font-semibold tabular-nums leading-none", t.text)}>{pct} %</p>
        </div>
        {bars.length > 0 ? (
          <div className="mt-2 flex h-10 items-end gap-[3px]">
            {bars.map((task) => (
              <div
                key={task.id}
                title={task.task}
                className={cn(
                  "flex-1 rounded-sm transition-all",
                  task.done ? cn(t.bar, "h-full") : "h-1/3 bg-muted",
                )}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", t.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
        <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
          {done} av {total} uppgifter avbockade
        </p>
      </div>
    </div>
  );
}
