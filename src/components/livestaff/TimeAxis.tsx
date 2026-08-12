import { minutesToTime } from "@/lib/liveStaff";
import { cn } from "@/lib/utils";

export interface Axis {
  from: number;
  to: number;
  /** Timmarnas etiketter. */
  ticks: number[];
}

/** Tidsaxel som täcker dagens öppettider, avrundad till hela timmar. */
export function buildAxis(spans: { open: number | null; close: number | null }[]): Axis {
  const opens = spans.map((s) => s.open).filter((v): v is number => v !== null);
  const closes = spans.map((s) => s.close).filter((v): v is number => v !== null);
  const rawFrom = opens.length ? Math.min(...opens) : 6 * 60;
  const rawTo = closes.length ? Math.max(...closes) : 20 * 60;
  const from = Math.max(0, Math.floor(rawFrom / 60) * 60 - 60);
  const to = Math.min(24 * 60, Math.ceil(rawTo / 60) * 60 + 60);
  const ticks: number[] = [];
  for (let m = from; m <= to; m += 60) ticks.push(m);
  return { from, to: Math.max(to, from + 120), ticks };
}

export function pct(axis: Axis, minutes: number): number {
  const span = axis.to - axis.from;
  return ((Math.min(Math.max(minutes, axis.from), axis.to) - axis.from) / span) * 100;
}

/** Sticky tidshuvud. */
export function TimeAxisHeader({ axis, labelWidth }: { axis: Axis; labelWidth: string }) {
  return (
    <div className="sticky top-0 z-20 flex border-b border-border bg-card">
      <div className={cn("sticky left-0 z-30 shrink-0 border-r border-border bg-card px-2 py-1.5", labelWidth)}>
        <span className="text-[10px] font-medium text-muted-foreground">Enhet</span>
      </div>
      <div className="relative h-7 flex-1">
        {axis.ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full border-l border-border/60"
            style={{ left: `${pct(axis, t)}%` }}
          >
            <span className="absolute left-1 top-1 text-[10px] tabular-nums text-muted-foreground">
              {minutesToTime(t)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Lodrät NU-linje. */
export function NowLine({ axis, nowMinutes }: { axis: Axis; nowMinutes: number }) {
  if (nowMinutes < axis.from || nowMinutes > axis.to) return null;
  return (
    <div
      className="pointer-events-none absolute inset-y-0 z-10 w-px bg-destructive"
      style={{ left: `${pct(axis, nowMinutes)}%` }}
    >
      <span className="absolute -top-0.5 left-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-destructive" />
    </div>
  );
}
