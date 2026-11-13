import type { WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatHm, minutesOfTime } from "@/lib/scheduleFormat";
import { ScheduleMark } from "@/components/schedule/ScheduleMark";
import { Clock3, Plus } from "lucide-react";

interface Props {
  day: string;
  rows: WeekRow[];
  selectedShiftId: string | null;
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  /** Saknas för läsbehörighet: då visas inga planeringsknappar. */
  onAdd?: (staffId: string, day: string) => void;
}

/**
 * Telefonvyn av en schemadag: en lista över vem som jobbar, med tider och
 * enhet på egen rad i stället för ett brett rutnät — inget sidledsskroll.
 */
export function MobileDayList({ day, rows, selectedShiftId, onShiftClick, onAdd }: Props) {
  const entries = rows
    .map((row) => ({ row, cell: row.cells.find((cell) => cell.day === day) }))
    .filter(({ cell }) => !!cell && (cell.shifts.length > 0 || cell.absences.length > 0 || !!cell.actual))
    .sort((a, b) => {
      const start = (entry: typeof a) =>
        entry.cell!.shifts.length ? Math.min(...entry.cell!.shifts.map((item) => minutesOfTime(item.shift.start_time))) : 24 * 60;
      return start(a) - start(b) || a.row.name.localeCompare(b.row.name, "sv");
    });
  const scheduled = entries.filter(({ cell }) => cell!.shifts.length > 0).length;
  const onSite = entries.filter(({ cell }) => cell!.actual?.ongoing).length;

  return (
    <section aria-label={`Personal ${day}`} className="space-y-2 p-3">
      <p className="text-[13px] sl-muted">
        <strong className="sl-num text-[var(--sl-ink)]">{scheduled}</strong> schemalagda
        {onSite > 0 ? (
          <>
            {" · "}
            <strong className="sl-num text-[var(--sl-ink)]">{onSite}</strong> på plats nu
          </>
        ) : null}
      </p>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--sl-line)] px-4 py-6 text-center text-[14px] sl-muted">
          Ingen är schemalagd den här dagen.
        </p>
      ) : (
        <ul className="space-y-2">
          {entries.map(({ row, cell }) => (
            <li key={row.staffId} className="rounded-lg border border-[var(--sl-line)] bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-[15px] font-semibold leading-tight">{row.name}</p>
                  {row.secondary ? <p className="mt-0.5 break-words text-[12.5px] sl-muted">{row.secondary}</p> : null}
                </div>
                {cell!.actual ? (
                  <span className={`sl-pill shrink-0 ${cell!.actual.ongoing ? "sl-pill--warn" : "sl-pill--ok"}`}>
                    <Clock3 size={11} />
                    <span className="sl-num">{cell!.actual.ongoing ? "på plats" : formatHm(cell!.actual.minutes)}</span>
                  </span>
                ) : null}
              </div>
              <div className="mt-2 space-y-1.5">
                {cell!.absences.map((absence, index) =>
                  absence.mark ? (
                    <ScheduleMark key={`${absence.label}-${index}`} mark={absence.mark} />
                  ) : (
                    <div key={`${absence.label}-${index}`} className="sl-pill sl-pill--warn w-full justify-start">
                      {absence.label}
                      {absence.status === "pending" ? " · väntar" : ""}
                    </div>
                  ),
                )}
                {cell!.shifts.map((item) => (
                  <button
                    type="button"
                    key={item.shift.id}
                    onClick={() => onShiftClick(row.staffId, day, item.shift.id)}
                    className={`sl-shift flex min-h-[44px] w-full flex-wrap items-center justify-between gap-x-3 text-left sl-shift--${item.status} ${item.shift.id === selectedShiftId ? "sl-shift--selected" : ""}`}
                  >
                    <span className="sl-num text-[14px] font-semibold">
                      {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)}
                    </span>
                    <span className="min-w-0 break-words text-[12.5px] sl-muted">{item.storeName}</span>
                    {item.violation ? <span className="w-full text-[12px] font-semibold text-[var(--sl-red-ink)]">{item.violation}</span> : null}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {onAdd ? (
        <button
          type="button"
          className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--sl-line)] text-[14px] sl-muted"
          onClick={() => onAdd("", day)}
        >
          <Plus size={15} /> Planera pass
        </button>
      ) : null}
    </section>
  );
}
