import type { WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatHm, formatKrPrel, storeMonocode } from "@/lib/scheduleFormat";
import { Clock3, Plus, Wallet } from "lucide-react";

const DAYS = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

interface Props {
  rows: WeekRow[];
  days: string[];
  today: string;
  onShiftClick: (staffId: string, day: string, shiftId?: string) => void;
  onSalaryClick: (staffId: string) => void;
  storeName: (id: string | null) => string;
}

export function WeekGridView({ rows, days, today, onShiftClick, onSalaryClick, storeName }: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1080px]">
        <div className="grid grid-cols-[176px_repeat(7,minmax(112px,1fr))_132px] border-b border-[var(--color-divider)] px-3 py-3 text-[var(--color-text)]">
          <div className="ind-label">Personal</div>
          {days.map((day, index) => (
            <div key={day} className={`px-2 ${day === today ? "ind-grid-today" : ""} ${index > 4 ? "ind-grid-weekend" : ""}`}>
              <span className="ind-grid-head block uppercase">{DAYS[index]}</span>
              <span className="ind-num font-heading text-lg">{day.slice(8)}/{day.slice(5, 7)}</span>
            </div>
          ))}
          <div className="ind-label text-right">Vecka</div>
        </div>
        {rows.map((row) => (
          <div key={row.staffId} className="ind-grid-row grid grid-cols-[176px_repeat(7,minmax(112px,1fr))_132px] px-3 py-3">
            <div className="ind-grid-sticky pr-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-heading text-base font-semibold">{row.name}</div>
                  <div className="mt-0.5 truncate text-xs ind-muted">{row.secondary || "Ingen anställningsinformation"}</div>
                  <div className="mt-2 flex items-center gap-1 text-[10px] ind-muted">
                    <span className="ind-monocode">{storeMonocode(row.secondary)}</span>
                    <span>{row.capMinutes ? `Avtal ${formatHm(row.capMinutes)}` : "Avtal saknas"}</span>
                  </div>
                  {row.capMinutes ? (
                    <div className="mt-2 ind-cap-bar" aria-label={`${formatHm(row.weekMinutes)} av ${formatHm(row.capMinutes)}`}>
                      <span className="ind-cap-bar__base" style={{ width: `${Math.min(100, (Math.min(row.weekMinutes, row.capMinutes) / row.capMinutes) * 100)}%` }} />
                      <span className="ind-cap-bar__extra" style={{ width: `${Math.min(100, (row.extraMinutes / row.capMinutes) * 100)}%` }} />
                    </div>
                  ) : null}
                </div>
                <button type="button" className="ind-icon-action" onClick={() => onSalaryClick(row.staffId)} aria-label={`Lön för ${row.name}`} title="Lön">
                  <Wallet size={14} />
                </button>
              </div>
            </div>
            {row.cells.map((cell, index) => (
              <div key={cell.day} className={`min-h-[96px] px-1.5 ${index > 4 ? "ind-grid-weekend" : ""} ${cell.day === today ? "ind-grid-today" : ""}`}>
                <div className="space-y-1">
                  {cell.absences.map((absence, absenceIndex) => (
                    <div className="ind-absence-badge text-[10px]" key={`${absence.label}-${absenceIndex}`}>
                      <strong className="block">{absence.label}</strong>
                      <span>{absence.status === "pending" ? "Väntar på beslut" : "Frånvarande"}</span>
                    </div>
                  ))}
                  {cell.shifts.map((item) => (
                    <button type="button" key={item.shift.id} onClick={() => onShiftClick(row.staffId, cell.day, item.shift.id)} className={`ind-shift ind-shift--${item.status}`}>
                      <span className="ind-shift__time block">{item.shift.start_time.slice(0, 5)}–{item.shift.end_time.slice(0, 5)}</span>
                      <span className="ind-shift__code block">{item.code} · {storeMonocode(item.storeName)}</span>
                      {item.violation ? <span className="ind-shift__violation block">{item.violation}</span> : null}
                    </button>
                  ))}
                  {cell.actual ? (
                    <div className={`ind-note--${cell.actual.ongoing ? "warn" : "ok"}`}>
                      <span className="flex items-center gap-1 font-heading text-xs font-semibold"><Clock3 size={12} />{formatHm(cell.actual.minutes)}{cell.actual.ongoing ? " · nu" : ""}</span>
                      <span className="block text-[10px]">{cell.actual.firstIn}–{cell.actual.lastOut ?? "pågår"}</span>
                    </div>
                  ) : null}
                  <button type="button" className="ind-add-shift" onClick={() => onShiftClick(row.staffId, cell.day)} aria-label={`Planera pass ${cell.day}`}><Plus size={12} /> pass</button>
                </div>
              </div>
            ))}
            <div className="pl-3 text-right ind-num">
              <strong className="block font-heading text-base">{formatHm(row.weekMinutes)}</strong>
              <span className="block text-xs ind-muted">{row.extraMinutes > 0 ? `+${formatHm(row.extraMinutes)}` : "inom avtal"}</span>
              <span className="mt-2 block text-xs ind-muted">{row.costPrel === null ? "Lön saknas" : formatKrPrel(row.costPrel)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
