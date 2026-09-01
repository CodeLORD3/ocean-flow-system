import type { ComingGoingEvent, WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatHm, minutesOfTime, timeOfMinutes } from "@/lib/scheduleFormat";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";

const START = 4 * 60;
const END = 18 * 60;
const TICKS = Array.from({ length: 15 }, (_, index) => START + index * 60);

interface Props {
  day: string;
  rows: WeekRow[];
  events: ComingGoingEvent[];
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  onAdd: (staffId: string, day: string) => void;
}

const percent = (minutes: number) => `${Math.max(0, Math.min(100, ((minutes - START) / (END - START)) * 100))}%`;
const width = (from: number, to: number) => `${Math.max(3, Math.min(100, ((to - from) / (END - START)) * 100))}%`;

export function DayLaneView({ day, rows, events, onShiftClick, onAdd }: Props) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_328px]">
      <section className="min-w-[720px]" aria-label={`Dagvy ${day}`}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="ind-label">Dagvy</p>
            <h2 className="ind-h2">{new Date(`${day}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}</h2>
          </div>
          <span className="ind-num text-sm ind-muted">{rows.length} personer</span>
        </div>
        <div className="grid grid-cols-[176px_minmax(520px,1fr)] gap-3 border-b border-[var(--color-divider)] pb-2">
          <span className="ind-label">Personal</span>
          <div className="relative h-5">
            {TICKS.map((tick) => <span key={tick} className="absolute top-0 -translate-x-1/2 ind-grid-head ind-num text-[10px]" style={{ left: percent(tick) }}>{timeOfMinutes(tick)}</span>)}
          </div>
        </div>
        <div className="space-y-2 pt-3">
          {rows.map((row) => {
            const cell = row.cells.find((item) => item.day === day);
            return (
              <div key={row.staffId} className="grid grid-cols-[176px_minmax(520px,1fr)] items-center gap-3">
                <div className="min-w-0">
                  <span className="block truncate font-heading text-base font-semibold">{row.name}</span>
                  <span className="block truncate text-xs ind-muted">{row.secondary}</span>
                </div>
                <div className="ind-lane">
                  {TICKS.map((tick) => <span key={tick} className="ind-axis-tick absolute inset-y-0" style={{ left: percent(tick) }} />)}
                  {cell?.shifts.map((item) => {
                    const from = minutesOfTime(item.shift.start_time);
                    const to = minutesOfTime(item.shift.end_time);
                    return <button type="button" key={item.shift.id} onClick={() => onShiftClick(row.staffId, day, item.shift.id)} className={`ind-lane__block ind-lane__block--${item.status}`} style={{ left: percent(from), width: width(from, to) }} title={`${item.shift.start_time.slice(0, 5)}–${item.shift.end_time.slice(0, 5)}`}><span>{item.code} {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)}</span></button>;
                  })}
                  {cell?.actual ? <span className="absolute bottom-0 left-0 h-1 rounded-full bg-[var(--color-ok-600)]" style={{ width: percent(START + cell.actual.minutes) }} aria-label={`Arbetad tid ${formatHm(cell.actual.minutes)}`} /> : null}
                  <button type="button" className="absolute right-1 top-1/2 hidden -translate-y-1/2 text-[var(--color-accent-700)] hover:block focus:block" onClick={() => onAdd(row.staffId, day)} aria-label={`Planera pass för ${row.name}`}><Plus size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <aside className="ind-side-panel p-4" aria-label="Kommer och går">
        <div className="mb-3 flex items-end justify-between border-b border-[var(--color-divider)] pb-3">
          <div><p className="ind-label">Livebemanning</p><h2 className="ind-h3">Kommer och går</h2></div>
          <span className="ind-num text-xs ind-muted">{events.length} händelser</span>
        </div>
        {events.length === 0 ? <p className="text-sm ind-muted">Inga stämplingar registrerade för dagen.</p> : (
          <div className="space-y-1">
            {events.map((event, index) => <div key={`${event.name}-${event.minutes}-${index}`} className="flex items-start gap-3 border-b border-[var(--color-divider)] py-3 last:border-0">
              <span className="ind-num w-10 text-sm font-semibold">{timeOfMinutes(event.minutes)}</span>
              <span className={`mt-0.5 rounded-sm p-1 ${event.kind === "in" ? "bg-[var(--color-ok-100)] text-[var(--color-ok-800)]" : "bg-[var(--color-warn-100)] text-[var(--color-warn-800)]"}`} aria-hidden="true">{event.kind === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}</span>
              <div className="min-w-0"><strong className="block truncate text-sm">{event.name}</strong><span className="ind-monocode">{event.storeCode}</span>{event.consequence ? <span className="mt-1 block text-xs ind-muted">{event.consequence}</span> : null}</div>
            </div>)}
          </div>
        )}
      </aside>
    </div>
  );
}
