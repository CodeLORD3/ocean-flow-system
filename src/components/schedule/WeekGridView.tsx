import type { WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatDecimalHours, formatHm, formatKrPrel, storeMonocode } from "@/lib/scheduleFormat";
import { Clock3, Plus, Wallet } from "lucide-react";

const DAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];
const COLS = "grid-cols-[196px_repeat(7,minmax(112px,1fr))_136px]";

interface Props {
  rows: WeekRow[];
  days: string[];
  today: string;
  /** Antal bemannade personer per dag; behov saknas i databasen. */
  coverage: { day: string; scheduled: number; target: number | null }[];
  selectedShiftId: string | null;
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  onSalaryClick: (staffId: string) => void;
  storeName: (id: string | null) => string;
}

/** Veckoschemat enligt ritningen: monokoder för enhet, status som kant på passet. */
export function WeekGridView({ rows, days, today, coverage, selectedShiftId, onShiftClick, onSalaryClick }: Props) {
  const totalMinutes = rows.reduce((total, row) => total + row.weekMinutes, 0);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1080px]">
        <div className={`grid ${COLS} border-b border-[var(--sl-line)] bg-[#fbfcfc]`}>
          <div className="sl-label px-4 py-2.5">Person</div>
          {days.map((day, index) => (
            <div key={day} className={`sl-grid-cell px-2 py-2.5 text-center ${day === today ? "sl-grid-today" : ""} ${index >= 5 ? "bg-[#f4f6f7]" : ""}`} style={{ minHeight: 0 }}>
              <span className="block text-[13px] font-semibold">{DAYS[index]}</span>
              <span className="sl-num mt-0.5 block text-[11px] sl-muted">{Number(day.slice(8))}/{Number(day.slice(5, 7))}</span>
            </div>
          ))}
          <div className="sl-label sl-grid-cell px-3 py-2.5 text-right" style={{ minHeight: 0 }}>Mot avtal</div>
        </div>

        {rows.map((row) => (
          <div key={row.staffId} className={`grid ${COLS} border-b border-[var(--sl-line)]`}>
            <div className="flex items-start gap-2 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{row.name}</div>
                <div className="mt-0.5 truncate text-[11.5px] sl-muted">{row.secondary || "Ingen anställningsinformation"}</div>
              </div>
              <button type="button" className="sl-btn sl-btn--icon" onClick={() => onSalaryClick(row.staffId)} aria-label={`Lön för ${row.name}`} title="Lön">
                <Wallet size={13} />
              </button>
            </div>

            {row.cells.map((cell, index) => (
              <div key={cell.day} className={`sl-grid-cell space-y-1 px-1.5 py-1.5 ${cell.day === today ? "sl-grid-today" : ""} ${index >= 5 ? "bg-[#fafbfb]" : ""}`}>
                {cell.absences.map((absence, absenceIndex) => (
                  <div className="sl-pill sl-pill--warn w-full justify-start" key={`${absence.label}-${absenceIndex}`}>
                    {absence.label}
                    {absence.status === "pending" ? " · väntar" : ""}
                  </div>
                ))}
                {cell.shifts.map((item) => (
                  <button
                    type="button"
                    key={item.shift.id}
                    onClick={() => onShiftClick(row.staffId, cell.day, item.shift.id)}
                    className={`sl-shift w-full sl-shift--${item.status} ${item.shift.id === selectedShiftId ? "sl-shift--selected" : ""}`}
                  >
                    <span className="sl-num block text-[11.5px] font-semibold">
                      {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)}
                    </span>
                    <span className="sl-num mt-0.5 block truncate text-[10.5px] sl-muted">{storeMonocode(item.storeName)}</span>
                    {item.violation ? <span className="mt-0.5 block text-[10.5px] font-semibold text-[var(--sl-red-ink)]">{item.violation}</span> : null}
                  </button>
                ))}
                {cell.actual ? (
                  <div className={`sl-pill w-full justify-start ${cell.actual.ongoing ? "sl-pill--warn" : "sl-pill--ok"}`}>
                    <Clock3 size={11} />
                    <span className="sl-num">{formatHm(cell.actual.minutes)}{cell.actual.ongoing ? " · nu" : ""}</span>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-[var(--sl-line)] py-1 text-[11px] sl-faint hover:border-[var(--sl-line-strong)] hover:text-[var(--sl-ink-soft)]"
                  onClick={() => onShiftClick(row.staffId, cell.day)}
                  aria-label={`Planera pass ${cell.day}`}
                >
                  <Plus size={11} /> pass
                </button>
              </div>
            ))}

            <div className="sl-grid-cell px-3 py-2.5 text-right">
              <strong className="sl-num block text-[14px]">
                {formatDecimalHours(row.weekMinutes)} / {row.capMinutes ? formatDecimalHours(row.capMinutes).replace(" h", "") : "—"}
              </strong>
              {row.extraMinutes > 0 ? (
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] sl-muted">
                  <span className="sl-status-dot" style={{ background: "var(--sl-yellow-ink)" }} /> {formatHm(row.extraMinutes)} mertid
                </span>
              ) : (
                <span className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] sl-muted">
                  <span className="sl-status-dot" style={{ background: "var(--sl-green-ink)" }} /> inom avtal
                </span>
              )}
              <span className="sl-num mt-1 block text-[11.5px] sl-faint">{row.costPrel === null ? "Lön saknas" : formatKrPrel(row.costPrel)}</span>
            </div>
          </div>
        ))}

        <div className={`grid ${COLS} bg-[#fbfcfc] text-[12.5px] sl-muted`}>
          <div className="px-4 py-2.5">
            <span className="block font-semibold text-[var(--sl-ink)]">Täckning</span>
            <span className="block text-[11.5px] sl-faint">bemannade personer · behov ej satt</span>
          </div>
          {coverage.map((entry) => (
            <div key={entry.day} className={`sl-grid-cell px-2 py-2.5 text-center sl-num ${entry.day === today ? "sl-grid-today" : ""}`} style={{ minHeight: 0 }}>
              {entry.scheduled > 0 ? entry.scheduled : "—"}
            </div>
          ))}
          <div className="sl-grid-cell px-3 py-2.5 text-right sl-num" style={{ minHeight: 0 }}>{formatDecimalHours(totalMinutes)}</div>
        </div>
      </div>
    </div>
  );
}
