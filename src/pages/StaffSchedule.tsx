import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Table2, CalendarDays, Upload, Copy, FilePlus2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";
import { usePlannedShiftsRange } from "@/hooks/usePlannedShifts";
import { useShiftsRange } from "@/hooks/useStaffShifts";
import { useAbsenceRequests, useAbsenceTypes } from "@/hooks/useAbsence";
import { PlannedShiftDialog } from "@/components/livestaff/PlannedShiftDialog";
import { StaffAccessDialog } from "@/components/staff/StaffAccessDialog";
import { StaffSalaryDialog } from "@/components/staff/StaffSalaryDialog";
import { useEffectiveRates } from "@/hooks/useSalaryHistory";
import { usePayrollOverhead, useStoreRevenueRange } from "@/hooks/useStaffKpi";
import { useMinuteTick } from "@/hooks/useLiveStaff";
import { buildActualMap, localDay, hhmm } from "@/lib/scheduleCompare";
import { dateKey, type PlannedShiftRow } from "@/lib/liveStaff";
import { formatHm, formatKrPrel, storeMonocode, minutesOfTime } from "@/lib/scheduleFormat";
import { DayLaneView } from "@/components/schedule/DayLaneView";
import { WeekGridView } from "@/components/schedule/WeekGridView";
import { IndustryButton, SectionLabel } from "@/components/industry";
import type { AbsenceMark, ActualMark, ComingGoingEvent, DayCell, ShiftCellItem, WeekRow } from "@/components/schedule/scheduleViewTypes";

const DAY_NAMES = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

function mondayOf(day: string): Date {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return date;
}

function shiftMinutes(shift: PlannedShiftRow): number {
  return Math.max(0, minutesOfTime(shift.end_time) - minutesOfTime(shift.start_time));
}

function isoWeek(date: Date): number {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(value.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((value.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

function dateRange(anchor: string): string[] {
  const monday = mondayOf(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return dateKey(date);
  });
}

function capForStaff(staff: any): number | null {
  const explicitHours = Number(staff.weekly_hours ?? staff.hours_per_week ?? staff.contracted_hours);
  if (Number.isFinite(explicitHours) && explicitHours > 0) return Math.round(explicitHours * 60);
  const rate = Number(staff.employment_rate ?? staff.employment_percentage);
  if (Number.isFinite(rate) && rate > 0) return Math.round(40 * 60 * (rate > 1 ? rate / 100 : rate));
  return null;
}

export default function StaffSchedule() {
  const [anchor, setAnchor] = useState(() => dateKey());
  const [storeFilter, setStoreFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [view, setView] = useState<"week" | "day">("week");
  const [dayViewDate, setDayViewDate] = useState(() => dateKey());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDay, setDialogDay] = useState(() => dateKey());
  const [dialogStore, setDialogStore] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlannedShiftRow | null>(null);
  const [salaryStaff, setSalaryStaff] = useState<any | null>(null);
  const [accessStaff, setAccessStaff] = useState<any | null>(null);

  const { data: stores = [] } = useStores(true);
  const { data: staff = [], isLoading: staffLoading } = useStaff();
  const days = useMemo(() => dateRange(anchor), [anchor]);
  const selectedDay = view === "day" ? dayViewDate : days[0];
  const { data: planned = [], isLoading: plannedLoading } = usePlannedShiftsRange(days[0], days[6], storeFilter === "all" ? null : storeFilter);
  const { data: actualShifts = [] } = useShiftsRange(days[0], days[6], storeFilter === "all" ? null : storeFilter);
  const { data: absenceRequests = [] } = useAbsenceRequests(undefined, storeFilter === "all" ? null : storeFilter);
  const { data: absenceTypes = [] } = useAbsenceTypes();
  const now = useMinuteTick();
  const actualMap = useMemo(() => buildActualMap(actualShifts, now.getTime()), [actualShifts, now]);
  const rates = useEffectiveRates(days[0]);
  const overhead = usePayrollOverhead();
  const revenue = useStoreRevenueRange(days[0], days[6]);
  const rateMap = rates.data ?? new Map<string, number | null>();
  const costFactor = 1 + Math.max(0, overhead.data ?? 0) / 100;

  const storeById = useMemo(() => new Map(stores.map((store: any) => [store.id, store])), [stores]);
  const storeName = (id: string | null) => (id ? (storeById.get(id) as any)?.name ?? "Ingen enhet" : "Ingen enhet");
  const cities = useMemo(() => Array.from(new Set(stores.map((store: any) => store.city).filter(Boolean))).sort() as string[], [stores]);
  const scopeStoreIds = useMemo(() => {
    if (storeFilter !== "all") return [storeFilter];
    return stores.filter((store: any) => cityFilter === "all" || store.city === cityFilter).map((store: any) => store.id as string);
  }, [stores, storeFilter, cityFilter]);

  const filteredStaff = useMemo(() => {
    const plannedIds = new Set(planned.map((shift) => shift.staff_id));
    return staff.filter((person: any) => {
      if (plannedIds.has(person.id)) return true;
      if (storeFilter !== "all") return person.store_id === storeFilter || (person.allowed_store_ids ?? []).includes(storeFilter);
      if (cityFilter === "all") return true;
      const ids: string[] = [...(person.store_id ? [person.store_id] : []), ...(person.allowed_store_ids ?? [])];
      return ids.some((id) => (storeById.get(id) as any)?.city === cityFilter);
    });
  }, [staff, planned, storeFilter, cityFilter, storeById]);

  const visibleStaffIds = useMemo(() => new Set(filteredStaff.map((person: any) => person.id)), [filteredStaff]);
  const visibleShifts = useMemo(() => planned.filter((shift) => visibleStaffIds.has(shift.staff_id)), [planned, visibleStaffIds]);
  const absenceMap = useMemo(() => {
    const map = new Map<string, AbsenceMark[]>();
    const names = new Map(absenceTypes.map((type) => [type.id, type.name]));
    absenceRequests
      .filter((request) => ["pending", "approved", "auto_approved"].includes(request.status))
      .filter((request) => visibleStaffIds.has(request.employee_id))
      .forEach((request) => {
        const from = request.date_from ?? request.start_date;
        const to = request.date_to ?? request.end_date ?? from;
        const cursor = new Date(`${from}T12:00:00`);
        const end = new Date(`${to}T12:00:00`);
        while (cursor <= end) {
          const day = dateKey(cursor);
          if (days.includes(day)) {
            const key = `${request.employee_id}|${day}`;
            const mark = { label: names.get(request.absence_type_id) ?? "Frånvaro", status: request.status };
            map.set(key, [...(map.get(key) ?? []), mark]);
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      });
    return map;
  }, [absenceRequests, absenceTypes, visibleStaffIds, days]);

  const costForShift = (shift: PlannedShiftRow): number | null => {
    const rate = rateMap.get(shift.staff_id);
    if (rate === null || rate === undefined || !Number.isFinite(rate)) return null;
    return (shiftMinutes(shift) / 60) * rate * costFactor;
  };

  const rows = useMemo<WeekRow[]>(() => {
    const shiftsByCell = new Map<string, PlannedShiftRow[]>();
    visibleShifts.forEach((shift) => {
      const key = `${shift.staff_id}|${shift.shift_date}`;
      shiftsByCell.set(key, [...(shiftsByCell.get(key) ?? []), shift]);
    });
    return filteredStaff.map((person: any) => {
      const personShifts = visibleShifts.filter((shift) => shift.staff_id === person.id);
      const weekMinutes = personShifts.reduce((total, shift) => total + shiftMinutes(shift), 0);
      const capMinutes = capForStaff(person);
      const costValues = personShifts.map(costForShift);
      const costPrel = costValues.some((cost) => cost !== null) ? costValues.reduce((total, cost) => total + (cost ?? 0), 0) : null;
      const cells: DayCell[] = days.map((day) => {
        const cellShifts = shiftsByCell.get(`${person.id}|${day}`) ?? [];
        const actual = actualMap.get(`${person.id}|${day}`) ?? null;
        const shifts: ShiftCellItem[] = cellShifts.map((shift) => ({
          shift,
          code: "PASS",
          storeName: storeName(shift.store_id),
          status: "published",
          violation: null,
          costPrel: costForShift(shift),
        }));
        return {
          day,
          shifts,
          absences: absenceMap.get(`${person.id}|${day}`) ?? [],
          actual: actual as ActualMark | null,
          plannedMinutes: cellShifts.reduce((total, shift) => total + shiftMinutes(shift), 0),
        };
      });
      const homeName = person.store_id ? storeName(person.store_id) : person.workplace ?? "Ingen hemmaenhet";
      return {
        staffId: person.id,
        name: `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Namnlös personal",
        secondary: `${homeName}${person.workplace ? ` · ${person.workplace}` : ""}`,
        avatarUrl: person.profile_image_url ?? null,
        weekMinutes,
        capMinutes,
        extraMinutes: capMinutes ? Math.max(0, weekMinutes - capMinutes) : 0,
        costPrel,
        cells,
      };
    });
  }, [filteredStaff, visibleShifts, days, actualMap, absenceMap, rateMap, costFactor, storeById]);

  const weekMinutes = rows.reduce((total, row) => total + row.weekMinutes, 0);
  const weekCost = rows.reduce((total, row) => total + (row.costPrel ?? 0), 0);
  const actualMinutes = Array.from(actualMap.values()).reduce((total, value) => total + value.minutes, 0);
  const missingRates = rows.filter((row) => row.costPrel === null && row.weekMinutes > 0).length;
  const totalRevenue = revenue.data ? scopeStoreIds.reduce((total, id) => total + days.reduce((sum, day) => sum + (revenue.data?.get(`${id}|${day}`)?.amount ?? 0), 0), 0) : null;
  const laborRatio = totalRevenue && totalRevenue > 0 && weekCost > 0 ? (weekCost / totalRevenue) * 100 : null;
  const extraCount = rows.filter((row) => row.extraMinutes > 0).length;

  const openDialog = (staffId: string | null, day: string, shiftId?: string) => {
    const shift = shiftId ? visibleShifts.find((item) => item.id === shiftId) ?? null : null;
    setDialogDay(day);
    setDialogStore(shift?.store_id ?? (storeFilter === "all" ? stores[0]?.id ?? null : storeFilter));
    setEditing(shift);
    setDialogOpen(true);
  };

  const shiftPeriod = (delta: number) => {
    const next = new Date(`${anchor}T12:00:00`);
    next.setDate(next.getDate() + delta * 7);
    const nextKey = dateKey(next);
    setAnchor(nextKey);
    setDayViewDate(nextKey);
  };

  const dayEvents = useMemo<ComingGoingEvent[]>(() => {
    return actualShifts
      .filter((shift) => localDay(shift.clocked_in_at) === selectedDay || (shift.clocked_out_at && localDay(shift.clocked_out_at) === selectedDay))
      .flatMap((shift) => {
        const person = staff.find((item: any) => item.id === shift.staff_id) as any;
        const name = person ? `${person.first_name} ${person.last_name}` : "Okänd personal";
        const events: ComingGoingEvent[] = [];
        if (localDay(shift.clocked_in_at) === selectedDay) events.push({ minutes: minutesOfTime(hhmm(shift.clocked_in_at)), kind: "in", name, storeCode: storeMonocode(storeName(shift.store_id)), consequence: null });
        if (shift.clocked_out_at && localDay(shift.clocked_out_at) === selectedDay) events.push({ minutes: minutesOfTime(hhmm(shift.clocked_out_at)), kind: "out", name, storeCode: storeMonocode(storeName(shift.store_id)), consequence: null });
        return events;
      })
      .sort((a, b) => a.minutes - b.minutes);
  }, [actualShifts, selectedDay, staff, storeById]);

  const emptyState = visibleShifts.length === 0 && !plannedLoading && !staffLoading;

  return (
    <motion.main initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="ind min-h-full p-3 sm:p-5">
      <div className="mx-auto max-w-[1600px]">
        <header className="ind-workspace-header ind-corners px-4 py-4 sm:px-6">
          <span className="ind-corner-b" aria-hidden="true" />
          <div className="ind-schedule-topline">
            <div>
              <SectionLabel className="text-[var(--color-accent-200)]">Makrill Trade · Personal & schema</SectionLabel>
              <h1 className="ind-h1 mt-1 text-[var(--color-neutral-100)]">Schemaöversikt</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="ind-view-switch" role="group" aria-label="Välj schemavy">
                <IndustryButton className={view === "week" ? "ind-view-switch__item--active" : "ind-view-switch__item"} variant="ghost" aria-pressed={view === "week"} onClick={() => setView("week")}><Table2 size={15} /> Vecka</IndustryButton>
                <IndustryButton className={view === "day" ? "ind-view-switch__item--active" : "ind-view-switch__item"} variant="ghost" aria-pressed={view === "day"} onClick={() => { setView("day"); setDayViewDate(days[0]); }}><CalendarDays size={15} /> Dag</IndustryButton>
              </div>
              <IndustryButton variant="primary" corners onClick={() => openDialog(null, selectedDay)}><Plus size={15} /> Planera pass</IndustryButton>
            </div>
          </div>
          <div className="ind-schedule-controls">
            <div className="ind-period-control" aria-label="Period">
              <IndustryButton variant="ghost" onClick={() => shiftPeriod(-1)} aria-label="Föregående vecka"><ChevronLeft size={17} /></IndustryButton>
              <Input type="date" aria-label="Välj datum" className="ind-input ind-date-control" value={view === "day" ? dayViewDate : anchor} onChange={(event) => { const value = event.target.value || dateKey(); setAnchor(value); setDayViewDate(value); }} />
              <IndustryButton variant="ghost" onClick={() => shiftPeriod(1)} aria-label="Nästa vecka"><ChevronRight size={17} /></IndustryButton>
            </div>
            <div className="ind-period-label"><span className="ind-num">V{isoWeek(mondayOf(anchor))}</span><span>{days[0]} – {days[6]}</span></div>
            <IndustryButton variant="secondary" onClick={() => { const today = dateKey(); setAnchor(today); setDayViewDate(today); }}>Idag</IndustryButton>
            <span className="ind-control-divider" aria-hidden="true" />
            <div className="ind-filter-group">
              <span className="ind-filter-label">Visa</span>
              <Select value={cityFilter} onValueChange={(value) => { setCityFilter(value); setStoreFilter("all"); }}>
                <SelectTrigger className="ind-select w-40"><SelectValue placeholder="Alla städer" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Alla städer</SelectItem>{cities.map((city) => <SelectItem key={city} value={city}>{city}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={storeFilter} onValueChange={setStoreFilter}>
                <SelectTrigger className="ind-select w-48"><SelectValue placeholder="Alla enheter" /></SelectTrigger>
                <SelectContent><SelectItem value="all">Alla enheter</SelectItem>{stores.filter((store: any) => cityFilter === "all" || store.city === cityFilter).map((store: any) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <section className="ind-decision mt-4" aria-label="Beslutsrad">
          <div className="ind-metric"><SectionLabel>Planerad tid</SectionLabel><p className="ind-decision__value ind-num">{formatHm(weekMinutes)}</p></div>
          <div className="ind-metric"><SectionLabel>Arbetad tid</SectionLabel><p className="ind-decision__value ind-num">{formatHm(actualMinutes)}</p></div>
          <div className="ind-metric"><SectionLabel>Personalkostnad</SectionLabel><p className="ind-decision__value ind-num">{weekCost > 0 ? formatKrPrel(weekCost) : "—"}</p></div>
          <div className="ind-metric"><SectionLabel>Arbete / omsättning</SectionLabel><p className={`ind-decision__value ind-num ${laborRatio === null ? "ind-muted" : laborRatio <= 20 ? "ind-status--ok" : "ind-status--alert"}`}>{laborRatio === null ? "—" : `${laborRatio.toFixed(1)} %`}</p></div>
          <div className="ind-decision__action"><SectionLabel>Åtgärd krävs</SectionLabel><p className={`ind-decision__value ind-num ${extraCount > 0 || missingRates > 0 ? "ind-status--alert" : "ind-status--ok"}`}>{extraCount + missingRates || "0"}</p><span className="text-xs ind-muted">{extraCount ? `${extraCount} över avtal` : missingRates ? `${missingRates} utan lön` : "Inget akut"}</span></div>
        </section>

        <div className="ind-section-heading mt-5">
          <div><SectionLabel>{view === "week" ? "Veckoplan" : "Dagens bemanning"}</SectionLabel><h2 className="ind-h3 mt-1">{view === "week" ? "Bemanning per dag" : "Bemanning över dagen"}</h2></div>
          {overhead.data ? <span className="ind-meta-chip ind-num">Påslag {overhead.data} %</span> : null}
        </div>

        <section className="ind-workspace mt-3" aria-label="Schema">
          {emptyState ? (
            <div className="ind-empty-state">
              <CalendarRange size={28} />
              <h2 className="ind-h3 mt-3">Ingen planering för vecka {isoWeek(mondayOf(anchor))}</h2>
              <p className="mt-1 max-w-md text-sm ind-muted">Lägg till ett pass eller importera ett schema för att komma igång.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <IndustryButton variant="primary" onClick={() => openDialog(null, days[0])}><Plus size={15} /> Börja tomt</IndustryButton>
                <IndustryButton variant="secondary" onClick={() => window.location.assign("/schedule-planner")}><Upload size={15} /> Importera schema</IndustryButton>
                <IndustryButton variant="ghost" onClick={() => shiftPeriod(-1)}><Copy size={15} /> Föregående vecka</IndustryButton>
              </div>
            </div>
          ) : view === "week" ? (
            <WeekGridView rows={rows} days={days} today={dateKey()} onShiftClick={openDialog} onSalaryClick={(id) => setSalaryStaff(staff.find((person: any) => person.id === id) ?? null)} storeName={storeName} />
          ) : (
            <DayLaneView day={selectedDay} rows={rows} events={dayEvents} onShiftClick={openDialog} onAdd={(staffId, day) => openDialog(staffId, day)} />
          )}
          {!emptyState && rows.length > 0 ? <footer className="ind-schema-footer"><span><span className="ind-legend-dot ind-legend-dot--accent" /> Planerat</span><span><span className="ind-legend-dot ind-legend-dot--ok" /> Stämplat</span><span><span className="ind-legend-dot ind-legend-dot--warn" /> Över avtal / väntar</span>{missingRates > 0 ? <span className="ind-footer-alert"><AlertTriangle size={13} /> {missingRates} person(er) saknar löneunderlag</span> : null}</footer> : null}
        </section>
      </div>

      <PlannedShiftDialog open={dialogOpen} onOpenChange={setDialogOpen} storeId={dialogStore ?? stores[0]?.id ?? ""} storeName={storeName(dialogStore)} day={dialogDay} editing={editing} />
      <StaffSalaryDialog open={!!salaryStaff} onOpenChange={(open) => !open && setSalaryStaff(null)} staff={salaryStaff} />
      <StaffAccessDialog open={!!accessStaff} onOpenChange={(open) => !open && setAccessStaff(null)} staff={accessStaff} />
    </motion.main>
  );
}
