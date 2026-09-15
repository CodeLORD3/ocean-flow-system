import type { ComingGoingEvent, WeekRow } from "@/components/schedule/scheduleViewTypes";
import { minutesOfTime, storeMonocode, timeOfMinutes } from "@/lib/scheduleFormat";
import { Plus } from "lucide-react";

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
  /** Minuter sedan midnatt just nu. Null när dagen inte är idag. */
  nowMinutes?: number | null;
  /** Behövda personer under dagen. Null när underlag saknas. */
  need?: number | null;
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

/** Dagvyn: timaxel per person, bemanningsrad mot behov och kronologisk kommer-och-går. */
export function DayLaneView({ day, rows, events, coverage, gap, selectedShiftId, onShiftClick, onAdd, nowMinutes = null, need = null }: Props) {
  const cellFor = (row: WeekRow) => row.cells.find((cell) => cell.day === day);
  const dayRows = rows.filter((row) => (cellFor(row)?.shifts.length ?? 0) > 0 || !!cellFor(row)?.actual);
  const shown = dayRows.length > 0 ? dayRows : rows;

  const onSiteNow = shown.filter((row) => cellFor(row)?.actual?.ongoing).length;
  const loneHours = coverage.filter((entry) => entry.scheduled === 1).length;
  const insideAxis = nowMinutes !== null && nowMinutes >= START && nowMinutes <= END;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
      <section className="min-w-0" aria-label={`Dagvy ${day}`}>
        <div className="mb-3 flex flex-wrap items-end justify-end gap-6 border-b border-[var(--sl-line)] pb-2">
          <div className="text-right">
            <span className="sl-label">På plats nu</span>
            <p className="sl-num text-[19px] font-semibold leading-tight">
              {onSiteNow}
              {need ? <span className="sl-muted"> av {need}</span> : null}
            </p>
          </div>
          <div className="text-right">
            <span className="sl-label">Ensambemannat</span>
            <p className={`sl-num text-[19px] font-semibold leading-tight ${loneHours > 0 ? "text-[var(--sl-red-ink)]" : ""}`}>{loneHours} h</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[152px_minmax(480px,1fr)] items-end gap-3 border-b border-[var(--sl-line)] pb-2">
              <span className="sl-label">Personal</span>
              <div className="relative h-8">
                {insideAxis ? (
                  <span
                    className="sl-num absolute top-0 -translate-x-1/2 rounded-md bg-[var(--sl-red-bg)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--sl-red-ink)]"
                    style={{ left: percent(nowMinutes!) }}
                  >
                    NU {timeOfMinutes(nowMinutes!)}
                  </span>
                ) : null}
                {TICKS.map((tick) => (
                  <span key={tick} className="sl-num absolute bottom-0 -translate-x-1/2 text-[10.5px] sl-muted" style={{ left: percent(tick) }}>
                    {timeOfMinutes(tick).slice(0, 2)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative divide-y divide-[var(--sl-line)]">
              {insideAxis ? (
                <span
                  className="pointer-events-none absolute inset-y-0 z-10 w-px bg-[var(--sl-red-ink)]"
                  style={{ left: `calc(152px + 0.75rem + (100% - 152px - 0.75rem) * ${((nowMinutes! - START) / (END - START)).toFixed(4)})` }}
                  aria-hidden="true"
                />
              ) : null}
              {shown.map((row) => {
                const cell = cellFor(row);
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
                            className={`sl-shift absolute top-1 h-9 overflow-hidden text-left sl-shift--${item.status} ${item.shift.id === selectedShiftId ? "sl-shift--selected" : ""}`}
                            style={{ left: percent(from), width: width(from, to) }}
                            title={`${item.shift.start_time.slice(0, 5)}–${item.shift.end_time.slice(0, 5)} ${item.storeName}`}
                          >
                            <span className="block truncate text-[11.5px] font-semibold">{item.storeName}</span>
                            <span className="sl-num block truncate text-[10.5px] sl-muted">
                              {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)} · {storeMonocode(item.storeName)}
                              {item.violation ? ` · ${item.violation}` : ""}
                            </span>
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

              <div className="grid grid-cols-[152px_minmax(480px,1fr)] items-center gap-3 py-2">
                <span className="text-[13.5px] italic sl-muted">Ej tilldelat</span>
                <button
                  type="button"
                  onClick={() => onAdd("", day)}
                  className="sl-shift sl-shift--open h-11 w-full text-left"
                  style={{ position: "relative" }}
                >
                  <span className="block truncate text-[11.5px] font-semibold">Öppet pass</span>
                  <span className="block truncate text-[10.5px] sl-muted">klicka för att lägga upp ett pass ingen är tilldelad</span>
                </button>
              </div>
            </div>


            <div className="mt-3 grid grid-cols-[152px_minmax(480px,1fr)] items-center gap-3 border-t border-[var(--sl-line)] pt-3">
              <div>
                <span className="block text-[13px] font-semibold">Bemanning</span>
                <span className="block text-[11.5px] sl-faint">{need ? "mot behov" : "personer per timme"}</span>
              </div>
              <div>
                {need ? (
                  <p className="sl-num mb-1 border-b border-dashed border-[var(--sl-red-ink)] pb-1 text-right text-[11.5px] font-semibold text-[var(--sl-red-ink)]">
                    {Math.max(...coverage.map((entry) => entry.scheduled), 0)} av {need} behövda
                  </p>
                ) : null}
                <div className="sl-coverage-track">
                  {coverage.map((entry) => {
                    const inGap = gap ? entry.hour >= gap.fromHour && entry.hour < gap.toHour : false;
                    const short = need ? entry.scheduled > 0 && entry.scheduled < need : false;
                    return (
                      <span
                        key={entry.hour}
                        className={`sl-coverage-cell ${inGap || short ? "sl-coverage-cell--gap" : ""}`}
                        style={{
                          left: percent(entry.hour * 60),
                          width: width(entry.hour * 60, entry.hour * 60 + 60),
                          background: inGap || short ? undefined : entry.scheduled > 0 ? "var(--sl-blue-bg)" : undefined,
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
        </div>
      </section>

      <aside className="sl-inspector" aria-label="Kommer och går">
        <header className="border-b border-[var(--sl-line)] px-4 py-3">
          <span className="sl-label">Kommer och går</span>
          <p className="mt-1 text-[13px] sl-muted">Det schemat inte visar av sig självt</p>
        </header>
        {events.length === 0 ? (
          <p className="px-4 py-6 text-[13px] sl-muted">Inga stämplingar registrerade för dagen.</p>
        ) : (
          <div className="max-h-[540px] overflow-y-auto">
            {events.map((event, index) => (
              <div
                key={`${event.name}-${event.minutes}-${index}`}
                className={`flex items-start gap-3 border-b border-[var(--sl-line)] px-4 py-3 last:border-0 ${event.consequence ? "bg-[var(--sl-yellow-bg)]" : ""}`}
                style={{ borderLeft: `3px solid ${event.consequence ? "var(--sl-yellow-ink)" : event.kind === "in" ? "var(--sl-green-ink)" : "var(--sl-line)"}` }}
              >
                <span className="sl-num w-11 text-[13px] font-semibold">{timeOfMinutes(event.minutes)}</span>
                <div className="min-w-0">
                  <p className="truncate text-[13px]">
                    <strong className="font-semibold">{event.name.split(" ")[0]}</strong>{" "}
                    <span className="sl-muted">{event.kind === "in" ? "börjar" : "slutar"}</span>
                  </p>
                  <span className="sl-num mt-0.5 block text-[11px] sl-faint">{event.storeCode}</span>
                  {event.consequence ? (
                    <span className="mt-1 block text-[11.5px] font-medium text-[var(--sl-yellow-ink)]">{event.consequence}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {gap ? (
          <footer className="border-t border-[var(--sl-line)] px-4 py-4">
            <p className="text-[13px] sl-muted">
              Luckan ligger kring bemanningen, inte kring tiderna. Ett rutnät visar att passen ligger rätt, inte att butiken står ensam.
            </p>
            <button type="button" className="sl-btn sl-btn--primary mt-3 w-full justify-center" onClick={() => onAdd("", day)}>
              Öppna passet för anmälan
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
