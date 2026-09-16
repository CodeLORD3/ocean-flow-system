import { ClipboardCheck, AlertTriangle, ListTodo, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { OnDutyStaff } from "@/components/staff/OnDutyStaff";
import {
  templateAppliesOn,
  todayIso,
  useChecklistTemplates,
  useTodayChecklistStatus,
} from "@/hooks/useChecklist";

/** Färg på procenten — rött under 50 %, bärnsten under 100 %, grönt när allt är klart. */
function pctTone(pct: number) {
  if (pct >= 100) return { text: "text-emerald-600", bar: "bg-emerald-500" };
  if (pct >= 50) return { text: "text-amber-600", bar: "bg-amber-500" };
  return { text: "text-red-600", bar: "bg-red-500" };
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
  children,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-[130px] flex-1 rounded-xl border border-border bg-card px-3 py-2">
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </p>
      <p className={cn("mt-0.5 font-heading text-lg font-semibold tabular-nums", tone)}>{value}</p>
      {children}
    </div>
  );
}

/**
 * Viktig statistik högst upp i Översikt: vilka som arbetar just nu (med stämpling),
 * checklistor kvar att göra med färgsatt procent, öppna avvikelser och dagens uppgifter.
 */
export function OverviewStatsBar({
  storeId,
  openTasks,
  openDeviations,
  totalSqm,
}: {
  storeId: string | null;
  openTasks: number;
  openDeviations: number;
  totalSqm?: number | null;
}) {
  const { data: templates = [] } = useChecklistTemplates(storeId);
  const { data: status = {} } = useTodayChecklistStatus(storeId, todayIso());
  const todays = templates.filter((t) => templateAppliesOn(t, todayIso()));

  let total = 0;
  let done = 0;
  let listsLeft = 0;
  todays.forEach((t) => {
    const s = status[t.id];
    total += s?.total ?? 0;
    done += s?.done ?? 0;
    if (!s || s.status !== "klar") listsLeft += 1;
  });
  const pct = total > 0 ? Math.round((done / total) * 100) : todays.length === 0 ? 100 : 0;
  const tone = pctTone(pct);

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-border bg-card px-3 py-2">
        <OnDutyStaff storeId={storeId} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Stat
          icon={ClipboardCheck}
          label={`Checklistor kvar (${listsLeft} av ${todays.length})`}
          value={`${pct} %`}
          tone={tone.text}
        >
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {done} av {total} punkter klara idag
          </p>
        </Stat>
        <Stat
          icon={ListTodo}
          label="Uppgifter kvar idag"
          value={String(openTasks)}
          tone={openTasks > 0 ? "text-amber-600" : "text-emerald-600"}
        />
        <Stat
          icon={AlertTriangle}
          label="Öppna avvikelser"
          value={String(openDeviations)}
          tone={openDeviations > 0 ? "text-red-600" : "text-emerald-600"}
        />
        {totalSqm ? (
          <Stat icon={Ruler} label="Yta i butiken" value={`${totalSqm.toFixed(1)} m²`} />
        ) : null}
      </div>
    </div>
  );
}
