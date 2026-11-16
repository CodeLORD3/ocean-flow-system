import type { DayCell, ShiftCellItem, WeekRow } from "@/components/schedule/scheduleViewTypes";
import { formatDecimalHours, formatHm, minutesOfTime } from "@/lib/scheduleFormat";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarCheck2, ChevronLeft, ChevronRight, Clock3, MapPin, Plus, Sun } from "lucide-react";
import { useState } from "react";

/**
 * Telefonvyn av schemat, skriven för den som jobbar: först mitt eget pass och
 * min vecka, sedan vilka som jobbar en vald dag med en tidslinje per person.
 * Allt ryms i skärmens bredd — inget sidledsskroll.
 */

const DAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

interface StoreOption {
  id: string;
  name: string;
}

interface Props {
  rows: WeekRow[];
  days: string[];
  today: string;
  weekNumber: number;
  /** Inloggad persons personal-id; markerar "Du" och styr Mitt schema. */
  meId: string | null;
  nowMinutes: number;
  loading: boolean;
  stores: StoreOption[];
  storeFilter: string;
  onStoreFilter: (value: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  /** Bara chefsnivå: öppna passets detaljer. */
  onShiftClick?: (staffId: string, day: string, shiftId: string) => void;
  /** Bara chefsnivå: planera nytt pass. */
  onAdd?: (day: string) => void;
}

const dateOf = (day: string) => new Date(`${day}T12:00:00`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const longDay = (day: string) => capitalize(dateOf(day).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" }));
const monthName = (day: string) => dateOf(day).toLocaleDateString("sv-SE", { month: "long" });
const t5 = (time: string) => time.slice(0, 5);

function endMinutes(item: ShiftCellItem): number {
  const start = minutesOfTime(item.shift.start_time);
  const end = minutesOfTime(item.shift.end_time);
  return end <= start ? end + 24 * 60 : end;
}

function weekRangeLabel(days: string[]): string {
  const first = dateOf(days[0]);
  const last = dateOf(days[6]);
  if (first.getMonth() === last.getMonth()) return `${first.getDate()}–${last.getDate()} ${monthName(days[6])}`;
  return `${first.getDate()} ${monthName(days[0]).slice(0, 3)} – ${last.getDate()} ${monthName(days[6]).slice(0, 3)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Tidslinje för en person en dag: grå bana, passet som fält, nu-linje idag. */
function DayBar({ shifts, from, to, now, mine }: { shifts: ShiftCellItem[]; from: number; to: number; now: number | null; mine: boolean }) {
  const span = Math.max(60, to - from);
  const pct = (minutes: number) => `${Math.min(100, Math.max(0, ((minutes - from) / span) * 100))}%`;
  return (
    <div className="relative mt-2 h-2.5 w-full rounded-full bg-[var(--sl-neutral-bg)]" aria-hidden="true">
      {shifts.map((item) => {
        const start = minutesOfTime(item.shift.start_time);
        const end = endMinutes(item);
        return (
          <span
            key={item.shift.id}
            className="absolute inset-y-0 rounded-full"
            style={{
              left: pct(start),
              width: `calc(${pct(end)} - ${pct(start)})`,
              background: item.status === "violation" ? "var(--sl-red-ink)" : mine ? "var(--sl-ink)" : "var(--sl-blue-ink)",
            }}
          />
        );
      })}
      {now !== null && now >= from && now <= to ? (
        <span className="absolute -inset-y-1 w-0.5 rounded-full bg-[var(--sl-red-ink)]" style={{ left: pct(now) }} />
      ) : null}
    </div>
  );
}

function Avatar({ name, url, mine }: { name: string; url: string | null; mine: boolean }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-[13px] font-bold ${mine ? "bg-[var(--sl-ink)] text-background" : "bg-[var(--sl-blue-bg)] text-[var(--sl-blue-ink)]"}`}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials(name)}
    </span>
  );
}

interface Entry {
  row: WeekRow;
  cell: DayCell;
}

export function MobileScheduleView({
  rows,
  days,
  today,
  weekNumber,
  meId,
  nowMinutes,
  loading,
  stores,
  storeFilter,
  onStoreFilter,
  onPrevWeek,
  onNextWeek,
  onToday,
  onShiftClick,
  onAdd,
}: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const activeDay = picked && days.includes(picked) ? picked : days.includes(today) ? today : days[0];
  const isCurrentWeek = days.includes(today);
  const me = meId ? rows.find((row) => row.staffId === meId) ?? null : null;

  /* ---------------------------------------------------------- mitt nästa pass */
  const myShifts = me
    ? me.cells.flatMap((cell) => cell.shifts.map((item) => ({ day: cell.day, item })))
    : [];
  const nextShift = myShifts.find(({ day, item }) => day > today || (day === today && endMinutes(item) > nowMinutes)) ?? null;
  let nextLabel = "";
  if (nextShift) {
    const start = minutesOfTime(nextShift.item.shift.start_time);
    if (nextShift.day === today) {
      nextLabel = start <= nowMinutes ? `Pågår · slutar om ${formatHm(endMinutes(nextShift.item) - nowMinutes)}` : `Idag · börjar om ${formatHm(start - nowMinutes)}`;
    } else {
      const diff = Math.round((dateOf(nextShift.day).getTime() - dateOf(today).getTime()) / 86_400_000);
      nextLabel = diff === 1 ? "I morgon" : `Om ${diff} dagar`;
    }
  }
  const nextIsNow = !!nextShift && nextShift.day === today && minutesOfTime(nextShift.item.shift.start_time) <= nowMinutes;

  /* ------------------------------------------------------------- vem jobbar */
  const entries: Entry[] = rows
    .map((row) => ({ row, cell: row.cells.find((cell) => cell.day === activeDay)! }))
    .filter(({ cell }) => !!cell && (cell.shifts.length > 0 || cell.absences.length > 0 || !!cell.actual));
  const working = entries
    .filter(({ cell }) => cell.shifts.length > 0)
    .sort((a, b) => {
      const first = (entry: Entry) => Math.min(...entry.cell.shifts.map((item) => minutesOfTime(item.shift.start_time)));
      return first(a) - first(b) || a.row.name.localeCompare(b.row.name, "sv");
    });
  const unscheduled = entries.filter(({ cell }) => cell.shifts.length === 0 && !!cell.actual && cell.absences.length === 0);
  const away = entries.filter(({ cell }) => cell.shifts.length === 0 && cell.absences.length > 0);
  const onSite = entries.filter(({ cell }) => cell.actual?.ongoing).length;

  const allStarts = working.flatMap(({ cell }) => cell.shifts.map((item) => minutesOfTime(item.shift.start_time)));
  const allEnds = working.flatMap(({ cell }) => cell.shifts.map(endMinutes));
  const from = allStarts.length ? Math.floor(Math.min(...allStarts) / 60) * 60 : 7 * 60;
  const to = allEnds.length ? Math.max(from + 4 * 60, Math.ceil(Math.max(...allEnds) / 60) * 60) : 20 * 60;
  const mid = Math.round((from + to) / 2 / 60) * 60;
  const barNow = activeDay === today ? nowMinutes : null;

  // Flera enheter samma dag: gruppera per enhet så det syns var var och en är.
  const storeOf = (entry: Entry) => entry.cell.shifts[0]?.storeName ?? "Ingen enhet";
  const myStore = me?.cells.find((cell) => cell.day === activeDay)?.shifts[0]?.storeName ?? null;
  const storeNames = Array.from(new Set(working.map(storeOf))).sort((a, b) =>
    a === myStore ? -1 : b === myStore ? 1 : a.localeCompare(b, "sv"),
  );
  const groups = storeNames.length > 1
    ? storeNames.map((name) => ({ name, items: working.filter((entry) => storeOf(entry) === name) }))
    : [{ name: null as string | null, items: working }];

  const weekNav = (
    <section className="rounded-2xl border border-[var(--sl-line)] bg-[var(--sl-surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="sl-label">Schema</p>
          <h1 className="text-[26px] font-bold leading-tight tracking-tight">Vecka {weekNumber}</h1>
          <p className="text-[14px] sl-muted">{weekRangeLabel(days)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--sl-line-strong)] bg-[var(--sl-surface)]" onClick={onPrevWeek} aria-label="Föregående vecka">
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--sl-line-strong)] bg-[var(--sl-surface)]" onClick={onNextWeek} aria-label="Nästa vecka">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      {!isCurrentWeek ? (
        <button type="button" className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--sl-blue-bg)] text-[14px] font-semibold text-[var(--sl-blue-ink)]" onClick={onToday}>
          <CalendarCheck2 size={16} /> Till denna vecka
        </button>
      ) : null}
    </section>
  );

  const nextCard = nextShift ? (
    <section
      className={`rounded-2xl p-4 shadow-sm ${nextIsNow ? "bg-[var(--sl-green-bg)] text-[var(--sl-green-ink)]" : "bg-[var(--sl-ink)] text-background"}`}
      aria-label="Mitt nästa pass"
    >
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] opacity-80">{nextIsNow ? "Du jobbar nu" : "Ditt nästa pass"}</p>
      <p className="mt-1 text-[17px] font-semibold">{longDay(nextShift.day)}</p>
      <p className="sl-num mt-0.5 text-[34px] font-bold leading-none tracking-tight">
        {t5(nextShift.item.shift.start_time)}–{t5(nextShift.item.shift.end_time)}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] opacity-90">
        <span className="flex items-center gap-1.5"><MapPin size={15} /> {nextShift.item.storeName}</span>
        <span className="flex items-center gap-1.5"><Clock3 size={15} /> {nextLabel}</span>
      </div>
    </section>
  ) : null;

  const myWeek = me ? (
    <section className="overflow-hidden rounded-2xl border border-[var(--sl-line)] bg-[var(--sl-surface)] shadow-sm" aria-label="Min vecka">
      <header className="flex items-baseline justify-between gap-2 border-b border-[var(--sl-line)] px-4 py-3">
        <h2 className="text-[17px] font-bold">Min vecka</h2>
        <span className="sl-num text-[13px] sl-muted">{me.weekMinutes > 0 ? `${formatDecimalHours(me.weekMinutes)} schemalagt` : "Inga pass"}</span>
      </header>
      <ul>
        {me.cells.map((cell, index) => {
          const isToday = cell.day === today;
          const past = cell.day < today;
          return (
            <li
              key={cell.day}
              className={`flex items-center gap-3 border-b border-[var(--sl-line)] px-4 py-2.5 last:border-b-0 ${isToday ? "bg-[var(--sl-blue-bg)]" : ""} ${past ? "opacity-55" : ""}`}
            >
              <div className="w-11 shrink-0 text-center">
                <p className={`text-[11px] font-bold uppercase ${isToday ? "text-[var(--sl-blue-ink)]" : "sl-muted"}`}>{DAY_SHORT[index]}</p>
                <p className="sl-num text-[19px] font-bold leading-tight">{dateOf(cell.day).getDate()}</p>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {cell.shifts.map((item) => (
                  <div key={item.shift.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="sl-num text-[16px] font-semibold">{t5(item.shift.start_time)}–{t5(item.shift.end_time)}</span>
                    <span className="min-w-0 break-words text-[13px] sl-muted">{item.storeName}</span>
                  </div>
                ))}
                {cell.absences.map((absence, absenceIndex) => (
                  <span key={`${absence.label}-${absenceIndex}`} className="sl-pill sl-pill--warn">
                    {absence.label}{absence.status === "pending" ? " · väntar" : ""}
                  </span>
                ))}
                {cell.shifts.length === 0 && cell.absences.length === 0 ? (
                  <span className="flex items-center gap-1.5 text-[14px] sl-faint"><Sun size={14} /> Ledig</span>
                ) : null}
              </div>
              {isToday ? <span className="sl-pill sl-pill--info shrink-0">Idag</span> : null}
            </li>
          );
        })}
      </ul>
    </section>
  ) : null;

  const dayPicker = (
    <div className="grid grid-cols-7 gap-1" role="tablist" aria-label="Välj dag">
      {days.map((day, index) => {
        const active = day === activeDay;
        const count = rows.reduce((total, row) => total + (row.cells.find((cell) => cell.day === day)?.shifts.length ? 1 : 0), 0);
        const iWork = !!me?.cells.find((cell) => cell.day === day)?.shifts.length;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${longDay(day)}, ${count} schemalagda`}
            onClick={() => setPicked(day)}
            className={`flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition-colors ${
              active
                ? "border-[var(--sl-ink)] bg-[var(--sl-ink)] text-background"
                : day === today
                  ? "border-[var(--sl-blue-ink)] bg-[var(--sl-blue-bg)]"
                  : "border-[var(--sl-line)] bg-[var(--sl-surface)]"
            }`}
          >
            <span className={`text-[11px] font-bold uppercase ${active ? "" : "sl-muted"}`}>{DAY_SHORT[index]}</span>
            <span className="sl-num text-[17px] font-bold leading-none">{dateOf(day).getDate()}</span>
            <span className={`sl-num text-[10.5px] ${active ? "opacity-80" : "sl-faint"}`}>{count > 0 ? `${count} st` : "–"}</span>
            {iWork ? <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-background" : "bg-[var(--sl-blue-ink)]"}`} aria-hidden="true" /> : <span className="h-1.5" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );

  const personRow = (entry: Entry) => {
    const mine = entry.row.staffId === meId;
    const { cell, row } = entry;
    const clickable = !!onShiftClick && cell.shifts.length > 0 && !cell.shifts[0].shift.id.startsWith("imp:");
    const body = (
      <>
        <div className="flex items-center gap-3">
          <Avatar name={row.name} url={row.avatarUrl} mine={mine} />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-semibold leading-tight">
              <span className="break-words">{row.name}</span>
              {mine ? <span className="rounded-full bg-[var(--sl-ink)] px-2 py-0.5 text-[11px] font-bold text-background">Du</span> : null}
            </p>
            <p className="sl-num mt-0.5 text-[15px] font-semibold text-[var(--sl-ink)]">
              {cell.shifts.map((item) => `${t5(item.shift.start_time)}–${t5(item.shift.end_time)}`).join(" · ")}
            </p>
          </div>
          {cell.actual ? (
            <span className={`sl-pill shrink-0 ${cell.actual.ongoing ? "sl-pill--ok" : "sl-pill--neutral"}`}>
              {cell.actual.ongoing ? <><span className="h-1.5 w-1.5 rounded-full bg-[var(--sl-green-ink)]" /> På plats</> : <><Clock3 size={11} /> {formatHm(cell.actual.minutes)}</>}
            </span>
          ) : null}
        </div>
        <DayBar shifts={cell.shifts} from={from} to={to} now={barNow} mine={mine} />
        {cell.shifts.some((item) => item.violation) ? (
          <p className="mt-1.5 text-[12px] font-semibold text-[var(--sl-red-ink)]">{cell.shifts.find((item) => item.violation)?.violation}</p>
        ) : null}
        {cell.absences.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {cell.absences.map((absence, index) => (
              <span key={`${absence.label}-${index}`} className="sl-pill sl-pill--warn">{absence.label}</span>
            ))}
          </div>
        ) : null}
      </>
    );
    const base = `block w-full px-4 py-3 text-left ${mine ? "bg-[var(--sl-blue-bg)]" : ""}`;
    return (
      <li key={row.staffId} className="border-b border-[var(--sl-line)] last:border-b-0">
        {clickable ? (
          <button type="button" className={base} onClick={() => onShiftClick!(row.staffId, activeDay, cell.shifts[0].shift.id)}>{body}</button>
        ) : (
          <div className={base}>{body}</div>
        )}
      </li>
    );
  };

  const whoWorks = (
    <section className="overflow-hidden rounded-2xl border border-[var(--sl-line)] bg-[var(--sl-surface)] shadow-sm" aria-label={`Vem jobbar ${longDay(activeDay)}`}>
      <header className="space-y-3 border-b border-[var(--sl-line)] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[17px] font-bold">Vem jobbar</h2>
          <span className="text-[13px] sl-muted">
            <strong className="sl-num text-[var(--sl-ink)]">{working.length}</strong> schemalagda
            {onSite > 0 ? <> · <strong className="sl-num text-[var(--sl-green-ink)]">{onSite}</strong> på plats</> : null}
          </span>
        </div>
        {dayPicker}
        <p className="text-[15px] font-semibold">{longDay(activeDay)}</p>
        {stores.length > 1 ? (
          <Select value={storeFilter} onValueChange={onStoreFilter}>
            <SelectTrigger className="h-11 w-full rounded-xl border-[var(--sl-line-strong)] bg-[var(--sl-surface)] text-[16px]" aria-label="Välj enhet">
              <SelectValue placeholder="Alla enheter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla enheter</SelectItem>
              {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : null}
      </header>

      {loading ? (
        <p className="px-4 py-8 text-center text-[14px] sl-muted">Hämtar schemat…</p>
      ) : working.length === 0 && unscheduled.length === 0 && away.length === 0 ? (
        <p className="px-4 py-10 text-center text-[15px] sl-muted">Ingen är schemalagd den här dagen.</p>
      ) : (
        <>
          {working.length > 0 ? (
            <div className="sl-num flex justify-between px-4 pt-3 text-[11px] sl-faint" aria-hidden="true">
              <span>{String(from / 60).padStart(2, "0")}:00</span>
              <span>{String((mid / 60) % 24).padStart(2, "0")}:00</span>
              <span>{String((to / 60) % 24).padStart(2, "0")}:00</span>
            </div>
          ) : null}
          {groups.map((group) => (
            <div key={group.name ?? "alla"}>
              {group.name ? (
                <p className="flex items-center gap-1.5 border-b border-[var(--sl-line)] bg-[var(--sl-bg)] px-4 py-2 text-[13px] font-bold">
                  <MapPin size={13} className="sl-muted" /> {group.name}
                  <span className="sl-num font-normal sl-muted">· {group.items.length}</span>
                </p>
              ) : null}
              <ul>{group.items.map(personRow)}</ul>
            </div>
          ))}
          {unscheduled.length > 0 ? (
            <div>
              <p className="border-y border-[var(--sl-line)] bg-[var(--sl-bg)] px-4 py-2 text-[13px] font-bold">Stämplat utan pass</p>
              <ul>
                {unscheduled.map(({ row, cell }) => (
                  <li key={row.staffId} className="flex items-center gap-3 border-b border-[var(--sl-line)] px-4 py-3 last:border-b-0">
                    <Avatar name={row.name} url={row.avatarUrl} mine={row.staffId === meId} />
                    <p className="min-w-0 flex-1 break-words text-[15px] font-semibold">{row.name}</p>
                    <span className={`sl-pill shrink-0 ${cell.actual?.ongoing ? "sl-pill--ok" : "sl-pill--neutral"}`}>
                      {cell.actual?.ongoing ? "På plats" : formatHm(cell.actual?.minutes ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {away.length > 0 ? (
            <div>
              <p className="border-y border-[var(--sl-line)] bg-[var(--sl-bg)] px-4 py-2 text-[13px] font-bold">Ledig eller frånvarande</p>
              <ul>
                {away.map(({ row, cell }) => (
                  <li key={row.staffId} className="flex items-center gap-3 border-b border-[var(--sl-line)] px-4 py-2.5 last:border-b-0">
                    <p className="min-w-0 flex-1 break-words text-[14px]">{row.name}</p>
                    <span className="sl-pill sl-pill--warn shrink-0">{cell.absences[0].label}{cell.absences[0].status === "pending" ? " · väntar" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

      {onAdd ? (
        <div className="border-t border-[var(--sl-line)] p-3">
          <button
            type="button"
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--sl-line-strong)] text-[14px] font-semibold sl-muted"
            onClick={() => onAdd(activeDay)}
          >
            <Plus size={15} /> Planera pass {DAY_SHORT[days.indexOf(activeDay)]?.toLowerCase()}
          </button>
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="space-y-3 p-3 pb-8">
      {weekNav}
      {nextCard}
      {myWeek}
      {whoWorks}
    </div>
  );
}
