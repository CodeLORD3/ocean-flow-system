/**
 * Gemensam markering för frånvaro och Ej tillgänglig i alla schemavyer.
 * Avsiktligt olik passkorten: randig bakgrund, streckad kant, ikon och
 * versal textetikett — status visas aldrig bara med färg.
 */
import { Ban, CalendarX } from "lucide-react";
import type { AbsenceRequest, AbsenceType } from "@/hooks/useAbsence";
import type { Availability } from "@/lib/schedule";

export type ScheduleMarkData =
  | {
      kind: "unavailable";
      wholeDay: boolean;
      from: string;
      to: string;
      recurring: boolean;
      note: string | null;
      periodLabel: string;
      createdBy: string | null;
      createdAt: string | null;
    }
  | {
      kind: "absence";
      typeName: string;
      colorToken: string | null;
      extentPct: number;
      pending: boolean;
      ongoing: boolean;
      note: string | null;
      periodLabel: string;
      createdBy: string | null;
      createdAt: string | null;
    };

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

/** absence_types.color_token → CSS-färg ur befintliga tokens. */
export function markColor(token: string | null | undefined): string {
  switch (token) {
    case "accent": return "hsl(var(--accent-foreground))";
    case "warning": return "hsl(var(--warning))";
    case "success": return "hsl(var(--success))";
    case "muted": return "hsl(var(--muted-foreground))";
    case "destructive": return "hsl(var(--destructive))";
    case "info": return "var(--color-accent-500)";
    default:
      return token && /-\d{3}$/.test(token) ? `var(--color-${token})` : "hsl(var(--muted-foreground))";
  }
}

const fmtStamp = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;

export function unavailableMarkData(row: Availability & { created_by?: string | null; created_at?: string | null }, nameOf?: (id?: string | null) => string | undefined): ScheduleMarkData {
  const wholeDay = row.from_time.slice(0, 5) <= "00:00" && row.to_time.slice(0, 5) >= "23:59";
  const recurring = !row.date && row.weekday != null;
  return {
    kind: "unavailable",
    wholeDay,
    from: row.from_time.slice(0, 5),
    to: row.to_time.slice(0, 5),
    recurring,
    note: row.note,
    periodLabel: recurring ? `Varje ${WEEKDAYS[row.weekday! % 7]}` : row.date ?? "",
    createdBy: nameOf?.(row.created_by) ?? null,
    createdAt: row.created_at ?? null,
  };
}

export function absenceMarkData(r: AbsenceRequest & { created_by?: string | null }, type: Pick<AbsenceType, "name" | "is_sick"> & { color_token?: string | null } | undefined, nameOf?: (id?: string | null) => string | undefined): ScheduleMarkData {
  const from = r.date_from ?? r.start_date;
  const to = r.date_to ?? r.end_date;
  const ongoing = Boolean(type?.is_sick) && !to;
  return {
    kind: "absence",
    typeName: type?.name ?? "Frånvaro",
    colorToken: type?.color_token ?? null,
    extentPct: Number(r.extent_pct ?? 100),
    pending: r.status === "pending",
    ongoing,
    note: r.note,
    periodLabel: ongoing ? `Från ${from}, pågår` : to && to !== from ? `${from} till ${to}` : from,
    createdBy: nameOf?.(r.created_by) ?? null,
    createdAt: r.created_at ?? null,
  };
}

function lines(m: ScheduleMarkData): [string, string, string | null] {
  if (m.kind === "unavailable") {
    const time = m.wholeDay ? "Hela dagen" : `${m.from} till ${m.to}`;
    return ["EJ TILLGÄNGLIG", m.recurring ? `${time}, varje vecka` : time, m.note || null];
  }
  const parts = [m.extentPct < 100 ? `${m.extentPct} %` : "Hela dagen"];
  if (m.ongoing) parts.push("Pågår");
  if (m.pending) parts.push("Väntar på beslut");
  return [m.typeName.toLocaleUpperCase("sv-SE"), parts.join(" · "), m.note || null];
}

/** Ren text — används för hjälptext, utskrift och kontroller. */
export function markText(m: ScheduleMarkData): string[] {
  return lines(m).filter(Boolean) as string[];
}

function tooltip(m: ScheduleMarkData): string {
  const out = [m.kind === "unavailable" ? "Ej tillgänglig" : m.typeName, `Period: ${m.periodLabel}`];
  if (m.kind === "unavailable") out.push(m.wholeDay ? "Hela dagen" : `${m.from} till ${m.to}`);
  else {
    out.push(`Omfattning: ${m.extentPct} %`);
    if (m.pending) out.push("Väntar på beslut");
  }
  if (m.note) out.push(`Notering: ${m.note}`);
  const stamp = fmtStamp(m.createdAt);
  if (m.createdBy || stamp) out.push(`Registrerad${m.createdBy ? ` av ${m.createdBy}` : ""}${stamp ? ` ${stamp}` : ""}`);
  return out.join("\n");
}

const styleFor = (color: string): React.CSSProperties => ({
  borderColor: color,
  backgroundImage: `repeating-linear-gradient(135deg, color-mix(in srgb, ${color} 16%, transparent) 0 5px, transparent 5px 10px)`,
});

export function ScheduleMark({ mark, onClick, disabled }: { mark: ScheduleMarkData; onClick?: () => void; disabled?: boolean }) {
  const color = mark.kind === "unavailable" ? "hsl(var(--muted-foreground))" : markColor(mark.colorToken);
  const [title, sub, note] = lines(mark);
  const Icon = mark.kind === "unavailable" ? Ban : CalendarX;
  const body = (
    <>
      <span className="flex items-center gap-1 font-bold uppercase leading-tight tracking-wide" style={{ color }}>
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{title}</span>
      </span>
      <span className="block leading-tight text-foreground">{sub}</span>
      {note ? <span className="block truncate leading-tight text-muted-foreground">{note}</span> : null}
    </>
  );
  const cls = "block w-full rounded-sm border border-dashed bg-background px-1.5 py-1 text-left text-[10px] lg:text-[11px]";
  const common = {
    className: cls,
    style: styleFor(color),
    title: tooltip(mark),
    draggable: false,
    onDragStart: (e: React.DragEvent) => e.preventDefault(),
    "data-schedule-mark": mark.kind,
  };
  if (!onClick) return <div {...common}>{body}</div>;
  return (
    <button type="button" {...common} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}>
      {body}
    </button>
  );
}

/** Litet exempel för förklaringsraden, i samma stil som markeringarna. */
export function ScheduleMarkLegend({ kind }: { kind: "absence" | "unavailable" }) {
  const color = kind === "unavailable" ? "hsl(var(--muted-foreground))" : "hsl(var(--warning))";
  const Icon = kind === "unavailable" ? Ban : CalendarX;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-3.5 w-5 items-center justify-center rounded-sm border border-dashed" style={styleFor(color)}>
        <Icon className="h-2.5 w-2.5" style={{ color }} aria-hidden="true" />
      </span>
      {kind === "unavailable" ? "Ej tillgänglig" : "Frånvaro"}
    </span>
  );
}
