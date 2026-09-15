/**
 * Panelen till höger i schemat: valt pass, enheter och avtal, konsekvens i
 * kronor och veckotimmar, samt vilotidsregler. Panelen räknar inget själv —
 * sidan skickar in färdiga värden.
 */
import { AlertTriangle, Check, Pencil, Trash2, X } from "lucide-react";
import { formatDecimalHours, formatKrPrel, storeMonocode } from "@/lib/scheduleFormat";
import { DAILY_REST_HOURS, WEEKLY_REST_HOURS, type ShiftRuleResult } from "@/lib/scheduleRules";

export interface InspectorSegment {
  id: string;
  storeName: string;
  costCentre: string | null;
  from: string;
  to: string;
  isHome: boolean;
}

export interface ShiftInspectorData {
  shiftId: string;
  staffName: string;
  dayLabel: string;
  timeLabel: string;
  segments: InspectorSegment[];
  costPrel: number | null;
  obPrel: number | null;
  weekMinutes: number;
  capMinutes: number | null;
  agreementArea: string | null;
  rule: ShiftRuleResult | null;
  weeklyRest: number | null;
}

interface Props {
  data: ShiftInspectorData;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ShiftInspector({ data, onClose, onEdit, onDelete }: Props) {
  const weekLabel = `${formatDecimalHours(data.weekMinutes)} / ${data.capMinutes ? formatDecimalHours(data.capMinutes) : "—"}`;

  return (
    <aside className="sl-inspector" aria-label="Valt pass">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--sl-line)] px-4 py-3">
        <div className="min-w-0">
          <span className="sl-label">Valt pass</span>
          <h3 className="sl-h3 mt-1 truncate">{data.staffName}</h3>
          <p className="mt-0.5 text-[12.5px] sl-muted sl-num">
            {data.dayLabel} · {data.timeLabel}
          </p>
        </div>
        <button type="button" className="sl-btn sl-btn--icon" onClick={onClose} aria-label="Stäng panelen">
          <X size={15} />
        </button>
      </header>

      <section className="border-b border-[var(--sl-line)] px-4 py-3">
        <span className="sl-label">Enheter och avtal</span>
        <ul className="mt-2 space-y-2">
          {data.segments.map((segment) => (
            <li key={segment.id} className="flex items-start gap-2">
              <span className="sl-monocode mt-0.5">{storeMonocode(segment.storeName)}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-semibold">
                  {segment.storeName}
                  {segment.costCentre ? <span className="sl-muted font-normal"> · KST {segment.costCentre}</span> : null}
                </div>
                <div className="text-[12px] sl-faint">{segment.isHome ? "Hemmaenhet" : "Annan enhet, samma avtal"}</div>
              </div>
              <span className="sl-num text-[12.5px] sl-muted">
                {segment.from}–{segment.to}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-b border-[var(--sl-line)] px-4 py-3">
        <span className="sl-label">Konsekvens</span>
        <dl className="mt-2 space-y-1.5 text-[13px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="sl-muted">Lönekostnad</dt>
            <dd className="sl-num font-semibold">{data.costPrel === null ? "Lön saknas" : formatKrPrel(data.costPrel)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="sl-muted">Varav OB</dt>
            <dd className="sl-num">{data.obPrel === null ? "—" : formatKrPrel(data.obPrel)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="sl-muted">
              Veckans timmar
              <span className="block text-[11.5px] sl-faint">per person, över alla enheter</span>
            </dt>
            <dd className="sl-num font-semibold">{weekLabel}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="sl-muted">
              Avtal
              <span className="block text-[11.5px] sl-faint">från anställningen, ej från enheten</span>
            </dt>
            <dd className="text-right text-[13px] font-semibold">{data.agreementArea ?? "Ej satt"}</dd>
          </div>
        </dl>
      </section>

      <section className="border-b border-[var(--sl-line)] px-4 py-3">
        <span className="sl-label">Regler</span>
        <div className="mt-2 space-y-2">
          {data.rule ? (
            <div className="flex items-start gap-2 rounded-[var(--sl-radius-sm)] border border-[var(--sl-red-ink)] bg-[var(--sl-red-bg)] p-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--sl-red-ink)]" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[var(--sl-red-ink)]">
                  Dygnsvila {data.rule.restHours.toLocaleString("sv-SE")} h — bryter 13 § ATL
                </p>
                <p className="mt-1 text-[12.5px] sl-muted">{data.rule.detail}</p>
                <button type="button" className="sl-btn mt-2 h-8 px-3 py-1 text-[13px]" onClick={onEdit}>
                  <Pencil size={13} /> Flytta passet
                </button>
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-[13px] sl-muted">
              <Check size={14} className="text-[var(--sl-green-ink)]" /> Dygnsvila uppfylld · kravet är {DAILY_REST_HOURS} h
            </p>
          )}
          <p className="flex items-center gap-2 text-[13px] sl-muted">
            <span className="sl-status-dot" style={{ background: (data.weeklyRest ?? 0) >= WEEKLY_REST_HOURS ? "var(--sl-green-ink)" : "var(--sl-red-ink)" }} />
            Veckovila {data.weeklyRest === null ? "—" : `${data.weeklyRest.toLocaleString("sv-SE")} h`}
            <span className="sl-faint">· kravet är {WEEKLY_REST_HOURS} h</span>
          </p>
        </div>
      </section>

      <footer className="flex items-center gap-2 px-4 py-3">
        <button type="button" className="sl-btn sl-btn--primary" onClick={onEdit}>
          <Pencil size={14} /> Ändra pass
        </button>
        <button type="button" className="sl-btn" onClick={onDelete}>
          <Trash2 size={14} /> Ta bort
        </button>
      </footer>
    </aside>
  );
}
