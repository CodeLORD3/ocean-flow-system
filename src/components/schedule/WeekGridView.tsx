import type { WeekRow } from "@/components/schedule/scheduleViewTypes";
import { Avatar } from "@/components/staff/ui";
import { formatHm, formatKrPrel } from "@/lib/scheduleFormat";
import { Clock3, Plus, Wallet } from "lucide-react";

const DAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];
const COLS = "grid-cols-[210px_repeat(7,minmax(118px,1fr))_136px]";

interface Props {
  rows: WeekRow[];
  days: string[];
  today: string;
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  onSalaryClick: (staffId: string) => void;
  storeName: (id: string | null) => string;
}

/** Veckoschemat i den ljusa personaldesignen: rena kolumnlinjer och tonad idag-kolumn. */
export function WeekGridView({ rows, days, today, onShiftClick, onSalaryClick }: Props) {
  const totalMinutes = rows.reduce((total, row) => total + row.weekMinutes, 0);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1120px]">
        <div className={`grid ${COLS} border-b border-[var(--sl-line)] bg-[#fafbfc]`}>
          <div className="sl-grid-head px-4 py-3">Personal</div>
          {days.map((day, index) => (
            <div key={day} className={`sl-grid-head sl-grid-cell px-2 py-3 ${day === today ? "sl-grid-today" : ""} ${index === 6 ? "sl-grid-sunday" : ""}`}>
              <span className="block">{DAYS[index]}</span>
              <span className="sl-num mt-0.5 block text-[15px] font-semibold text-[color:inherit]">{day.slice(8)}/{day.slice(5, 7)}</span>
            </div>
          ))}
          <div className="sl-grid-head sl-grid-cell px-3 py-3 text-right">Vecka</div>
        </div>

        <div className={`sl-summary-row grid ${COLS}`}>
          <div className="px-4 py-2">{rows.length} personer</div>
          {days.map((day) => {
            const minutes = rows.reduce((total, row) => total + (row.cells.find((cell) => cell.day === day)?.plannedMinutes ?? 0), 0);
            return (
              <div key={day} className={`sl-grid-cell px-2 py-2 sl-num ${day === today ? "sl-grid-today" : ""}`}>
                {minutes > 0 ? formatHm(minutes) : "—"}
              </div>
            );
          })}
          <div className="sl-grid-cell px-3 py-2 text-right sl-num">{formatHm(totalMinutes)}</div>
        </div>

        {rows.map((row) => (
          <div key={row.staffId} className={`grid ${COLS} border-b border-[var(--sl-line)] last:border-b-0`}>
            <div className="flex items-start gap-3 px-4 py-3">
              <Avatar name={row.name} url={row.avatarUrl} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{row.name}</div>
                <div className="mt-0.5 truncate text-[12.5px] sl-muted">{row.secondary || "Ingen anställningsinformation"}</div>
                <div className="mt-1 text-[12px] sl-faint sl-num">{row.capMinutes ? `Avtal ${formatHm(row.capMinutes)}` : "Avtal saknas"}</div>
              </div>
              <button type="button" className="sl-btn sl-btn--icon" onClick={() => onSalaryClick(row.staffId)} aria-label={`Lön för ${row.name}`} title="Lön">
                <Wallet size={14} />
              </button>
            </div>

            {row.cells.map((cell, index) => (
              <div key={cell.day} className={`sl-grid-cell space-y-1 px-1.5 py-2 ${cell.day === today ? "sl-grid-today" : ""} ${index === 6 ? "bg-[#fffafa]" : ""}`}>
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
                    className={`sl-shift w-full ${item.status === "draft" ? "sl-shift--draft" : ""} ${item.violation ? "sl-shift--violation" : ""}`}
                  >
                    <span className="sl-num flex items-center">
                      <span className="sl-shift__dot" style={{ background: "var(--sl-blue-ink)" }} />
                      {item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)}
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] sl-muted">{item.storeName}</span>
                    {item.violation ? <span className="block text-[11.5px] text-[var(--sl-red-ink)]">{item.violation}</span> : null}
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
                  className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--sl-line)] py-1 text-[11.5px] sl-faint hover:border-[var(--sl-line-strong)] hover:text-[var(--sl-ink-soft)]"
                  onClick={() => onShiftClick(row.staffId, cell.day)}
                  aria-label={`Planera pass ${cell.day}`}
                >
                  <Plus size={11} /> pass
                </button>
              </div>
            ))}

            <div className="sl-grid-cell px-3 py-3 text-right">
              <strong className="sl-num block text-[15px]">{formatHm(row.weekMinutes)}</strong>
              <span className="block text-[12.5px] sl-muted">{row.extraMinutes > 0 ? `+${formatHm(row.extraMinutes)} mertid` : "inom avtal"}</span>
              <span className="mt-1 block text-[12.5px] sl-faint sl-num">{row.costPrel === null ? "Lön saknas" : formatKrPrel(row.costPrel)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
