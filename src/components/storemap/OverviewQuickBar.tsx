import { Check, ClipboardCheck, ClipboardList, Clock, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
export function OverviewQuickBar({
  tasks,
  storeId,
  day,
}: {
  tasks: MapTask[];
  storeId?: string | null;
  day?: string;
}) {
  const navigate = useNavigate();
  const date = day || new Date().toISOString().slice(0, 10);

  /** Är dagsrapporten skriven för dagen? Då lyser knappen grön. */
  const { data: dailyDone = false } = useQuery({
    queryKey: ["overview-daily-report-done", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("id")
        .eq("store_id", storeId!)
        .eq("report_date", date)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  /** Är inventeringen färdigställd för dagen? Låst tillfälle = klar rapport. */
  const { data: countDone = false } = useQuery({
    queryKey: ["overview-stock-count-done", storeId, date],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_count_sessions")
        .select("id")
        .eq("store_id", storeId!)
        .eq("count_date", date)
        .eq("status", "locked")
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  /** Grön ruta när rapporten är klar, annars vanlig ljus ruta. */
  const boxClass = (done: boolean) =>
    cn(
      "flex items-center gap-3 rounded-2xl border px-5 py-5 text-left shadow-sm transition",
      done
        ? "border-emerald-500/50 bg-emerald-50 ring-1 ring-emerald-500/40 hover:bg-emerald-100 dark:bg-emerald-500/10"
        : "border-border bg-card ring-1 ring-primary/30 hover:bg-muted",
    );

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
      {/* Dagsrapport och inventeringsrapport ligger allra högst upp i Översikt */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => navigate("/dagsrapport")}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-sm ring-1 ring-primary/30 transition hover:bg-muted"
        >
          <FileText className="h-7 w-7 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold leading-tight">Dagsrapport</span>
            <span className="block text-xs text-muted-foreground">Dagens siffror för butiken</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/inventory")}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-5 text-left shadow-sm ring-1 ring-primary/30 transition hover:bg-muted"
        >
          <ClipboardCheck className="h-7 w-7 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block font-heading text-lg font-semibold leading-tight">Inventeringsrapport</span>
            <span className="block text-xs text-muted-foreground">Räkna av lagret</span>
          </span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
