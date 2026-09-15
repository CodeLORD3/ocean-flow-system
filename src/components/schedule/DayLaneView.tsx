import type { ComingGoingEvent, WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatHm, minutesOfTime, storeMonocode, timeOfMinutes } from "@/lib/scheduleFormat";
import { ArrowDownLeft, ArrowUpRight, Plus } from "lucide-react";

const START = 4 * 60;
const END = 20 * 60;
const TICKS = Array.from({ length: (END - START) / 120 + 1 }, (_, index) => START + index * 120);

interface Props {
  day: string;
  rows: WeekRow[];
  events: ComingGoingEvent[];
  coverage: { hour: number; scheduled: number }[];
  gap: { label: string; fromHour: number; toHour: number } | null;
  selectedShiftId: string | null;
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  onAdd: (staffId: string, day: string) => void;
}

const percent = (minutes: number) => `${Math.max(0, Math.min(100, ((minutes - START) / (END - START)) * 100))}%`;
const width = (from: number, to: number) => `${Math.max(3, Math.min(100, ((to - from) / (END - START)) * 100))}%`;
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Dagvyn: timaxel per person, bemanningsrad och kronologisk kommer-och-går. */
export function DayLaneView({ day, rows, events, coverage, gap, selectedShiftId, onShiftClick, onAdd }: Props) {
  const dayRows = rows.filter((row) => (row.cells.find((cell) => cell.day === day)?.shifts.length ?? 0) > 0 || (row.cells.find((cell) => cell.day === day)?.actual ?? null));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
      <section className="min-w-0 overflow-x-auto" aria-label={`Dagvy ${day}`}>
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[152px_minmax(480px,1fr)] items-end gap-3 border-b border-[var(--sl-line)] pb-2">
            <span className="sl-label">Personal</span>
            <div className="relative h-4">
              {TICKS.map((tick) => (
                <span key={tick} className="sl-num absolute top-0 -translate-x-1/2 text-[10.5px] sl-muted" style={{ left: percent(tick) }}>
                  {timeOfMinutes(tick).slice(0, 2)}
                </span>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[var(--sl-line)]">
            {(dayRows.length > 0 ? dayRows : rows).map((row) => {
              const cell = row.cells.find((item) => item.day === day);
              return (
                <div key={row.staffId} className="grid grid-cols-[152px_minmax(480px,1fr)] items-center gap-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="sl-monocode">{initials(row.name)}</span>
                    <div className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold">{row.name}</span>
                      <span className="block truncate text-[11.5px] sl-muted">{row.secondary}</span>
                    </div>
                  </div>
                  <div className="relative h-11 rounded-md bg-[#fbfcfc]">
                    {TICKS.map((tick) => (
                      <span key={tick} className="absolute inset-y-0 border-l border-[var(--sl-line)]" style={{ left: percent(tick) }} aria-hidden="true" />
                    ))}
                    {cell?.shifts.map((item) => {
                      const from = minutesOfTime(item.shift.start_time);
                      const to = minutesOfTime(item.shift.end_time);
                      return (
                        <button
                          type="button"
                          key={item.shift.id}
                          onClick={() => onShiftClick(row.staffId, day, item.shift.id)}
                          className={`sl-shift absolute top-1 h-9 overflow-hidden sl-shift--${item.status} ${item.shift.id === selectedShiftId ? "sl-shift--selected" : ""}`}
                          style={{ left: percent(from), width: width(from, to) }}
                          title={`${item.shift.start_time.slice(0, 5)}–${item.shift.end_time.slice(0, 5)} ${item.storeName}`}
                        >
                          <span className="sl-num block truncate text-[11.5px] font-semibold">
                            {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)} {storeMonocode(item.storeName)}
                          </span>
                          {item.shift.note ? <span className="block truncate text-[10.5px] sl-muted">{item.shift.note}</span> : null}
                        </button>
                      );
                    })}
                    {cell?.shifts.length ? null : (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] sl-faint hover:text-[var(--sl-ink)]"
                        onClick={() => onAdd(row.staffId, day)}
                        aria-label={`Planera pass för ${row.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 grid grid-cols-[152px_minmax(480px,1fr)] items-center gap-3 border-t border-[var(--sl-line)] pt-3">
            <div>
              <span className="block text-[13px] font-semibold">Bemanning</span>
              <span className="block text-[11.5px] sl-faint">personer per timme</span>
            </div>
            <div>
              <div className="sl-coverage-track">
                {coverage.map((entry) => {
                  const inGap = gap ? entry.hour >= gap.fromHour && entry.hour < gap.toHour : false;
                  return (
                    <span
                      key={entry.hour}
                      className={`sl-coverage-cell ${inGap ? "sl-coverage-cell--gap" : ""}`}
                      style={{
                        left: percent(entry.hour * 60),
                        width: width(entry.hour * 60, entry.hour * 60 + 60),
                        background: inGap ? undefined : entry.scheduled > 0 ? "var(--sl-blue-bg)" : undefined,
                      }}
                      title={`${String(entry.hour).padStart(2, "0")}:00 · ${entry.scheduled} personer`}
                    />
                  );
                })}
              </div>
              {gap ? (
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--sl-red-ink)]">
                  <span className="sl-status-dot" style={{ background: "var(--sl-red-ink)" }} /> {gap.label} · ingen bemannad
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] sl-muted">Ingen lucka i bemanningen</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <aside className="sl-inspector" aria-label="Kommer och går">
        <header className="flex items-end justify-between gap-3 border-b border-[var(--sl-line)] px-4 py-3">
          <div>
            <span className="sl-label">Kronologiskt</span>
            <h3 className="sl-h3 mt-1">Kommer och går</h3>
          </div>
          <span className="sl-num text-[12px] sl-muted">{events.length} händelser</span>
        </header>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-[13px] sl-muted">Inga stämplingar registrerade för dagen.</p>
        ) : (
          <div className="max-h-[540px] overflow-y-auto">
            {events.map((event, index) => (
              <div key={`${event.name}-${event.minutes}-${index}`} className="flex items-start gap-3 border-b border-[var(--sl-line)] px-4 py-2.5 last:border-0">
                <span className="sl-num w-11 text-[13px] font-semibold">{timeOfMinutes(event.minutes)}</span>
                <span className={`mt-0.5 rounded-md p-1 ${event.kind === "in" ? "bg-[var(--sl-green-bg)] text-[var(--sl-green-ink)]" : "bg-[var(--sl-yellow-bg)] text-[var(--sl-yellow-ink)]"}`} aria-hidden="true">
                  {event.kind === "in" ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px]">
                    <strong className="font-semibold">{event.name}</strong> <span className="sl-muted">{event.kind === "in" ? "kommer" : "går"}</span>
                  </p>
                  <span className="sl-monocode mt-0.5">{event.storeCode}</span>
                  {event.consequence ? <span className="mt-1 block text-[11.5px] sl-muted">{event.consequence}</span> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
