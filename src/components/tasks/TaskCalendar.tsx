import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useTaskCalendar } from "@/hooks/useTaskCalendar";
import {
  addDays,
  addMonths,
  dayNumber,
  iso,
  monthGrid,
  monthLabel,
  sameMonth,
  startOfWeek,
  weekDays,
  weekNumber,
} from "@/lib/taskCalendarDates";
import type { TaskRowArea } from "@/components/tasks/TaskRow";

const WEEKDAYS = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

type Props = {
  storeId: string | null;
  selected: string;
  onSelect: (date: string) => void;
  /** Öppnar dagens lista när man dubbelklickar eller trycker på knappen. */
  onOpenDay?: (date: string) => void;
  areas: Map<string, TaskRowArea>;
};

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

export function TaskCalendar({ storeId, selected, onSelect, onOpenDay, areas }: Props) {
  const [mode, setMode] = useState<"vecka" | "manad">("vecka");
  const [anchor, setAnchor] = useState(selected);
  const today = iso(new Date());

  const days = useMemo(() => (mode === "vecka" ? weekDays(anchor) : monthGrid(anchor)), [mode, anchor]);
  const from = days[0];
  const to = days[days.length - 1];
  const { data: summary } = useTaskCalendar(storeId, from, to);

  const step = (dir: number) => setAnchor(mode === "vecka" ? addDays(anchor, dir * 7) : addMonths(anchor, dir));

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    days.forEach((d) => {
      const s = summary?.get(d);
      if (!s) return;
      total += s.total;
      done += s.done;
    });
    return { total, done };
  }, [days, summary]);

  const heading =
    mode === "vecka" ? `Vecka ${weekNumber(anchor)} · ${monthLabel(startOfWeek(anchor))}` : monthLabel(anchor);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(-1)} aria-label="Föregående">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => step(1)} aria-label="Nästa">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-semibold capitalize">{heading}</span>
          <Button variant="ghost" size="sm" className="ml-1 h-8" onClick={() => setAnchor(today)}>
            Idag
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {totals.done} av {totals.total} klara · {pct(totals.done, totals.total)}%
          </span>
          <div className="flex overflow-hidden rounded-md border">
            {(["vecka", "manad"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-1 text-xs",
                  mode === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground",
                )}
              >
                {m === "vecka" ? "Vecka" : "Månad"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const s = summary?.get(d);
          const total = s?.total ?? 0;
          const done = s?.done ?? 0;
          const p = pct(done, total);
          const isSelected = d === selected;
          const dim = mode === "manad" && !sameMonth(d, anchor);
          return (
            <button
              key={d}
              onClick={() => onSelect(d)}
              onDoubleClick={() => onOpenDay?.(d)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-2 text-left transition-colors",
                mode === "vecka" ? "min-h-[140px]" : "min-h-[92px]",
                isSelected ? "border-primary ring-1 ring-primary" : "hover:bg-muted/50",
                dim && "opacity-45",
                d === today && !isSelected && "border-emerald-500/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    d === today && "rounded bg-emerald-500 px-1.5 text-white",
                  )}
                >
                  {dayNumber(d)}
                </span>
                {total > 0 && (
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {done}/{total}
                  </span>
                )}
              </div>

              {total > 0 ? (
                <>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p}%` }} />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(s?.zoneIds ?? []).slice(0, 6).map((z) => (
                      <span
                        key={z}
                        title={areas.get(z)?.name ?? "Område"}
                        className="h-2 w-2 rounded-full"
                        style={{ background: areas.get(z)?.color ?? "hsl(var(--muted-foreground))" }}
                      />
                    ))}
                  </div>
                  {mode === "vecka" && (
                    <ul className="space-y-0.5">
                      {(s?.preview ?? []).map((t, i) => (
                        <li
                          key={i}
                          className={cn(
                            "truncate text-[11px]",
                            t.done ? "text-emerald-600 line-through" : "text-foreground",
                          )}
                        >
                          {t.task}
                        </li>
                      ))}
                      {total > (s?.preview.length ?? 0) && (
                        <li className="text-[11px] text-muted-foreground">
                          +{total - (s?.preview.length ?? 0)} fler
                        </li>
                      )}
                    </ul>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">–</span>
              )}
            </button>
          );
        })}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-sm">
          Valt datum: <span className="font-medium">{selected}</span>
          {summary?.get(selected) ? ` · ${summary.get(selected)!.done} av ${summary.get(selected)!.total} klara` : " · inga uppgifter"}
        </span>
        <Button size="sm" onClick={() => onOpenDay?.(selected)}>
          Öppna dagens uppgifter
        </Button>
      </Card>
    </div>
  );
}
