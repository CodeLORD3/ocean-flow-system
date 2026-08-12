import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarRange, ChevronLeft, ChevronRight, Plus, Users, Wallet, ShieldCheck, CalendarDays, Table2, Clock, Timer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";
import { useStaffAvatars } from "@/hooks/useStaffAvatars";
import { usePlannedShiftsRange } from "@/hooks/usePlannedShifts";
import { useShiftsRange } from "@/hooks/useStaffShifts";
import { PlannedShiftDialog } from "@/components/livestaff/PlannedShiftDialog";
import { StaffAccessDialog } from "@/components/staff/StaffAccessDialog";
import { StaffSalaryDialog } from "@/components/staff/StaffSalaryDialog";
import { useEffectiveRates } from "@/hooks/useSalaryHistory";
import { usePayrollOverhead, useStoreRevenueRange } from "@/hooks/useStaffKpi";
import { useMinuteTick } from "@/hooks/useLiveStaff";
import { buildActualMap, diffTone, localDay, signedMinutes } from "@/lib/scheduleCompare";
import { dateKey, formatMinutes, type PlannedShiftRow } from "@/lib/liveStaff";


const DAY_NAMES = ["Mån", "Tis", "Ons", "Tors", "Fre", "Lör", "Sön"];

/** Måndagen i veckan för ett datum. */
function mondayOf(day: string): Date {
  const d = new Date(`${day}T12:00:00`);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function shiftMinutes(p: PlannedShiftRow): number {
  return Math.max(0, minutesOf(p.end_time) - minutesOf(p.start_time));
}

/** ISO-veckonummer — samma numrering som personalen använder i praktiken. */
function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

const kr = (v: number) => `${Math.round(v).toLocaleString("sv-SE")} kr`;

export default function StaffSchedule() {
  const [anchor, setAnchor] = useState(() => dateKey());
  const [storeFilter, setStoreFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [view, setView] = useState<"week" | "calendar">("week");

  const { data: stores = [] } = useStores(true);
  const { data: staff = [], isLoading: staffLoading } = useStaff();

  const cities = useMemo(
    () => Array.from(new Set(stores.map((s: any) => s.city).filter(Boolean))).sort() as string[],
    [stores],
  );

  const monday = useMemo(() => mondayOf(anchor), [anchor]);
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        return dateKey(d);
      }),
    [monday],
  );

  // Kalendervyn läser hela månaden, veckovyn bara den valda veckan.
  const monthDays = useMemo(() => {
    const base = new Date(`${anchor}T12:00:00`);
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const out: string[] = [];
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) out.push(dateKey(new Date(d)));
    return out;
  }, [anchor]);

  const rangeFrom = view === "week" ? days[0] : monthDays[0];
  const rangeTo = view === "week" ? days[6] : monthDays[monthDays.length - 1];

  const { data: planned = [], isLoading } = usePlannedShiftsRange(
    rangeFrom,
    rangeTo,
    storeFilter === "all" ? null : storeFilter,
  );

  const { data: actualShifts = [] } = useShiftsRange(
    rangeFrom,
    rangeTo,
    storeFilter === "all" ? null : storeFilter,
  );
  const now = useMinuteTick();
  const avatars = useStaffAvatars();

  const rates = useEffectiveRates(rangeFrom);
  const overhead = usePayrollOverhead();
  const revenue = useStoreRevenueRange(rangeFrom, rangeTo);

  const rateMap = rates.data ?? new Map<string, number | null>();
  const factor = 1 + Math.max(0, overhead.data ?? 0) / 100;

  /** Arbetad tid per anställd och dag — pågående pass räknas mot nu. */
  const actualMap = useMemo(
    () => buildActualMap(actualShifts, now.getTime()),
    [actualShifts, now],
  );


  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDay, setDialogDay] = useState(days[0]);
  const [dialogStore, setDialogStore] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlannedShiftRow | null>(null);
  const [salaryStaff, setSalaryStaff] = useState<any | null>(null);
  const [accessStaff, setAccessStaff] = useState<any | null>(null);

  const storeById = useMemo(() => new Map(stores.map((s: any) => [s.id, s])), [stores]);
  const storeName = (id: string | null) => (id ? (storeById.get(id) as any)?.name ?? "Ingen enhet" : "Ingen enhet");

  // Butiker som ingår i den aktuella filtreringen — styr vilken omsättning
  // personalkostnaden jämförs mot.
  const scopeStoreIds = useMemo(() => {
    if (storeFilter !== "all") return [storeFilter];
    return stores
      .filter((s: any) => cityFilter === "all" || s.city === cityFilter)
      .map((s: any) => s.id as string);
  }, [stores, storeFilter, cityFilter]);

  const staffIdsWithShifts = useMemo(() => new Set(planned.map((p) => p.staff_id)), [planned]);

  const staffRows = useMemo(() => {
    return staff.filter((s: any) => {
      if (staffIdsWithShifts.has(s.id)) return true;
      if (storeFilter !== "all") return s.store_id === storeFilter || (s.allowed_store_ids ?? []).includes(storeFilter);
      if (cityFilter === "all") return true;
      const ids: string[] = [...(s.store_id ? [s.store_id] : []), ...(s.allowed_store_ids ?? [])];
      return ids.some((id) => (storeById.get(id) as any)?.city === cityFilter);
    });
  }, [staff, storeFilter, cityFilter, staffIdsWithShifts, storeById]);

  const visibleStaffIds = useMemo(() => new Set(staffRows.map((s: any) => s.id)), [staffRows]);
  const visibleShifts = useMemo(
    () => planned.filter((p) => visibleStaffIds.has(p.staff_id)),
    [planned, visibleStaffIds],
  );

  const byStaffDay = useMemo(() => {
    const map = new Map<string, PlannedShiftRow[]>();
    visibleShifts.forEach((p) => {
      const key = `${p.staff_id}|${p.shift_date}`;
      map.set(key, [...(map.get(key) ?? []), p]);
    });
    return map;
  }, [visibleShifts]);

  /** Kostnad för ett pass — null när personen saknar lön. */
  const shiftCost = (p: PlannedShiftRow): number | null => {
    const rate = rateMap.get(p.staff_id);
    if (rate === null || rate === undefined || !Number.isFinite(rate)) return null;
    return (shiftMinutes(p) / 60) * rate * factor;
  };

  /** Arbetad tid (och ev. pågående pass) för en anställd en dag. */
  const actualDay = (staffId: string, day: string) => actualMap.get(`${staffId}|${day}`) ?? null;

  /** Summerad arbetad tid för alla synliga anställda en dag. */
  const actualDayTotal = (day: string) => {
    let minutes = 0;
    let ongoing = false;
    visibleStaffIds.forEach((id) => {
      const a = actualMap.get(`${id}|${day}`);
      if (!a) return;
      minutes += a.minutes;
      ongoing = ongoing || a.ongoing;
    });
    return { minutes, ongoing };
  };

  interface DayTotals {
    minutes: number;
    cost: number;
    unratedMinutes: number;
    revenue: number | null;
    shifts: number;
  }

  const dayTotals = (day: string): DayTotals => {
    const rows = visibleShifts.filter((p) => p.shift_date === day);
    let cost = 0;
    let minutes = 0;
    let unratedMinutes = 0;
    rows.forEach((p) => {
      const m = shiftMinutes(p);
      minutes += m;
      const c = shiftCost(p);
      if (c === null) unratedMinutes += m;
      else cost += c;
    });
    const revMap = revenue.data;
    let rev: number | null = null;
    if (revMap) {
      scopeStoreIds.forEach((id) => {
        const entry = revMap.get(`${id}|${day}`);
        if (entry) rev = (rev ?? 0) + entry.amount;
      });
    }
    return { minutes, cost, unratedMinutes, revenue: rev, shifts: rows.length };
  };

  const weekTotals = useMemo(() => {
    const list = days.map(dayTotals);
    const worked = days.map(actualDayTotal);
    return {
      minutes: list.reduce((a, t) => a + t.minutes, 0),
      cost: list.reduce((a, t) => a + t.cost, 0),
      unratedMinutes: list.reduce((a, t) => a + t.unratedMinutes, 0),
      workedMinutes: worked.reduce((a, t) => a + t.minutes, 0),
      workedOngoing: worked.some((t) => t.ongoing),
      revenue: list.some((t) => t.revenue !== null)
        ? list.reduce((a, t) => a + (t.revenue ?? 0), 0)
        : null,
    };
  }, [days, visibleShifts, rateMap, revenue.data, scopeStoreIds, factor, actualMap, visibleStaffIds]);

  const ratio = (cost: number, rev: number | null) =>
    rev && rev > 0 && cost > 0 ? `${((cost / rev) * 100).toFixed(1)} %` : null;

  const staffWeek = (staffId: string) => {
    const rows = visibleShifts.filter((p) => p.staff_id === staffId && days.includes(p.shift_date));
    const minutes = rows.reduce((a, p) => a + shiftMinutes(p), 0);
    const costs = rows.map(shiftCost);
    const hasRate = costs.some((c) => c !== null);
    let worked = 0;
    let ongoing = false;
    days.forEach((d) => {
      const a = actualMap.get(`${staffId}|${d}`);
      if (!a) return;
      worked += a.minutes;
      ongoing = ongoing || a.ongoing;
    });
    return {
      minutes,
      worked,
      ongoing,
      cost: hasRate ? costs.reduce((a, c) => a + (c ?? 0), 0) : null,
    };
  };


  const openDialog = (staffId: string | null, day: string, shift: PlannedShiftRow | null) => {
    setDialogDay(day);
    setDialogStore(shift?.store_id ?? (storeFilter === "all" ? null : storeFilter));
    setEditing(shift);
    setDialogOpen(true);
  };

  const shiftPeriod = (delta: number) => {
    const d = new Date(`${anchor}T12:00:00`);
    if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setAnchor(dateKey(d));
  };

  // Kalenderrutnät: tomma celler före månadens första dag så veckodagarna
  // hamnar i rätt kolumn (måndag först).
  const calendarCells = useMemo(() => {
    const first = new Date(`${monthDays[0]}T12:00:00`);
    const pad = (first.getDay() + 6) % 7;
    return [...Array.from({ length: pad }, () => null as string | null), ...monthDays];
  }, [monthDays]);

  const monthLabel = new Date(`${anchor}T12:00:00`).toLocaleDateString("sv-SE", { month: "long", year: "numeric" });

  const missingSalary = staffRows.filter((s: any) => {
    const r = rateMap.get(s.id);
    return r === null || r === undefined;
  }).length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-heading font-bold text-foreground">
            <CalendarRange className="h-5 w-5 text-primary" /> Schema & personalkalender
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Planera pass per vecka, se personalkostnad per dag och vecka samt andel av omsättningen från dagsrapporten.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={view === "week" ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setView("week")}
          >
            <Table2 className="h-3.5 w-3.5" /> Vecka
          </Button>
          <Button
            variant={view === "calendar" ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => setView("calendar")}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Kalender
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => openDialog(null, days[0], null)}>
            <Plus className="h-3.5 w-3.5" /> Planera pass
          </Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(-1)} aria-label="Föregående period">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="date"
              className="h-8 w-36 text-xs"
              value={anchor}
              onChange={(e) => setAnchor(e.target.value || dateKey())}
            />
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftPeriod(1)} aria-label="Nästa period">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Select value={cityFilter} onValueChange={(v) => { setCityFilter(v); setStoreFilter("all"); }}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla städer</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Alla enheter</SelectItem>
              {stores
                .filter((s: any) => cityFilter === "all" || s.city === cityFilter)
                .map((s: any) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          {view === "week" ? (
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              Vecka {isoWeek(monday)} · {days[0]} – {days[6]}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] capitalize">{monthLabel}</Badge>
          )}
          {overhead.data ? (
            <Badge variant="outline" className="text-[10px] tabular-nums">
              Påslag {overhead.data} %
            </Badge>
          ) : null}
          {missingSalary > 0 && (
            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-500">
              {missingSalary} utan lön
            </Badge>
          )}
        </CardContent>
      </Card>

      {view === "week" && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="shadow-card">
            <CardContent className="p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <CalendarRange className="h-3 w-3" /> Planerad tid
              </p>
              <p className="mt-0.5 font-mono text-lg tabular-nums text-foreground">{formatMinutes(weekTotals.minutes)}</p>
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-3">
              <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                <Timer className="h-3 w-3" /> Arbetad tid
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 font-mono text-lg tabular-nums text-foreground">
                {formatMinutes(weekTotals.workedMinutes)}
                {weekTotals.workedOngoing && (
                  <span className="flex items-center gap-1 font-sans text-[10px] font-medium text-sky-500">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" /> live
                  </span>
                )}
              </p>
              {weekTotals.minutes > 0 && (
                <p className={`text-[10px] tabular-nums ${diffTone(weekTotals.workedMinutes - weekTotals.minutes, weekTotals.workedOngoing)}`}>
                  {signedMinutes(weekTotals.workedMinutes - weekTotals.minutes)} mot schema
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Personalkostnad vecka</p>
              <p className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
                {weekTotals.cost > 0 ? kr(weekTotals.cost) : "Lön saknas"}
              </p>
              {weekTotals.unratedMinutes > 0 && weekTotals.cost > 0 && (
                <p className="text-[10px] text-amber-500">
                  {formatMinutes(weekTotals.unratedMinutes)} utan lön inräknad
                </p>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Kostnad av omsättning</p>
              <p className="mt-0.5 font-mono text-lg tabular-nums text-foreground">
                {ratio(weekTotals.cost, weekTotals.revenue) ?? "Omsättningsdata saknas"}
              </p>
              {weekTotals.revenue !== null && (
                <p className="text-[10px] tabular-nums text-muted-foreground">
                  Omsättning {kr(weekTotals.revenue)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="shadow-card">
        <CardContent className="p-0">
          {isLoading || staffLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : view === "calendar" ? (
            <div className="p-3">
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((d) => (
                  <div key={d} className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {d}
                  </div>
                ))}
                {calendarCells.map((day, i) =>
                  day === null ? (
                    <div key={`pad-${i}`} />
                  ) : (
                    (() => {
                      const t = dayTotals(day);
                      const pct = ratio(t.cost, t.revenue);
                      const isToday = day === dateKey();
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => { setAnchor(day); setView("week"); }}
                          className={`min-h-[76px] rounded border p-1.5 text-left transition-colors hover:border-primary/50 ${
                            isToday ? "border-primary/60 bg-primary/5" : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="font-mono text-xs tabular-nums text-foreground">{day.slice(8)}</span>
                            {t.shifts > 0 && (
                              <span className="text-[10px] tabular-nums text-muted-foreground">{t.shifts} pass</span>
                            )}
                          </div>
                          {t.minutes > 0 ? (
                            <div className="mt-1 space-y-0.5">
                              <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                {formatMinutes(t.minutes)}
                              </p>
                              <p className="font-mono text-[11px] tabular-nums text-foreground">
                                {t.cost > 0 ? kr(t.cost) : "—"}
                              </p>
                              {pct && (
                                <p className="font-mono text-[10px] tabular-nums text-primary">{pct} av oms.</p>
                              )}
                            </div>
                          ) : (
                            <p className="mt-1 text-[10px] text-muted-foreground">Inga pass</p>
                          )}
                        </button>
                      );
                    })()
                  ),
                )}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">
                Klicka på en dag för att öppna veckan. Kostnaden räknas på planerade pass och gällande lön; omsättningen
                hämtas från kassan eller dagsrapporten.
              </p>
            </div>
          ) : staffRows.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-xs text-muted-foreground">
                Ingen personal att schemalägga för den här enheten.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="sticky left-0 z-10 bg-muted/40 px-2 py-2 text-left font-medium text-muted-foreground">
                      Anställd
                    </th>
                    {days.map((d, i) => (
                      <th key={d} className="px-2 py-2 text-left font-medium text-muted-foreground">
                        {DAY_NAMES[i]} <span className="tabular-nums font-normal">{d.slice(5)}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium text-muted-foreground">Vecka</th>
                  </tr>
                </thead>
                <tbody>
                  {staffRows.map((s: any) => {
                    const wk = staffWeek(s.id);
                    const home = s.store_id ? (storeById.get(s.store_id) as any) : null;
                    const extra = (s.allowed_store_ids ?? []).filter((id: string) => id !== s.store_id).length;
                    const rate = rateMap.get(s.id);
                    return (
                      <tr key={s.id} className="border-b border-border last:border-0">
                        <td className="sticky left-0 z-10 max-w-[240px] border-r border-border bg-card px-2 py-1.5">
                          <div className="flex items-center gap-1">
                            <span className="truncate font-medium text-foreground">
                              {s.first_name} {s.last_name}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Lön"
                              onClick={() => setSalaryStaff(s)}
                            >
                              <Wallet className={`h-3 w-3 ${rate ? "text-emerald-500" : "text-amber-500"}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              title="Behörighet (stad/butik)"
                              onClick={() => setAccessStaff(s)}
                            >
                              <ShieldCheck className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {home && (
                              <Badge variant="secondary" className="px-1 py-0 text-[9px]">
                                {home.name}{home.city ? ` · ${home.city}` : ""}
                              </Badge>
                            )}
                            {extra > 0 && (
                              <Badge variant="outline" className="px-1 py-0 text-[9px]">+{extra} enheter</Badge>
                            )}
                            {(s.allowed_store_ids ?? []).length === 0 && (s.portal_access ?? []).includes("shop") && (
                              <Badge variant="outline" className="px-1 py-0 text-[9px]">Alla butiker</Badge>
                            )}
                            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                              {rate ? `${Math.round(rate)} kr/h` : "lön saknas"}
                            </span>
                          </div>
                        </td>
                        {days.map((d) => {
                          const rows = byStaffDay.get(`${s.id}|${d}`) ?? [];
                          return (
                            <td key={d} className="align-top px-1 py-1">
                              <div className="flex flex-col gap-1">
                                {rows.map((p) => {
                                  const c = shiftCost(p);
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => openDialog(s.id, d, p)}
                                      className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-left tabular-nums text-[11px] text-foreground hover:bg-primary/20"
                                    >
                                      {p.start_time.slice(0, 5)}–{p.end_time.slice(0, 5)}
                                      <span className="block font-mono text-[9px] text-muted-foreground">
                                        {storeName(p.store_id)}
                                        {c !== null ? ` · ${kr(c)}` : ""}
                                      </span>
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => openDialog(s.id, d, null)}
                                  className="rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                  aria-label={`Planera pass ${d}`}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          <span className="block font-mono">{formatMinutes(wk.minutes)}</span>
                          <span className="block font-mono text-[10px] text-foreground">
                            {wk.cost !== null && wk.cost > 0 ? kr(wk.cost) : "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/30">
                    <td className="sticky left-0 z-10 bg-muted/30 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Kostnad / dag
                    </td>
                    {days.map((d) => {
                      const t = dayTotals(d);
                      const pct = ratio(t.cost, t.revenue);
                      return (
                        <td key={d} className="px-2 py-1.5 font-mono text-[10px] tabular-nums">
                          <span className="block text-foreground">{t.cost > 0 ? kr(t.cost) : "—"}</span>
                          <span className="block text-muted-foreground">{formatMinutes(t.minutes)}</span>
                          <span className="block text-primary">{pct ?? ""}</span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right font-mono text-[10px] tabular-nums">
                      <span className="block text-foreground">{weekTotals.cost > 0 ? kr(weekTotals.cost) : "—"}</span>
                      <span className="block text-primary">{ratio(weekTotals.cost, weekTotals.revenue) ?? ""}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PlannedShiftDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        storeId={dialogStore ?? stores[0]?.id ?? ""}
        storeName={storeName(dialogStore ?? stores[0]?.id ?? null)}
        day={dialogDay}
        editing={editing}
      />

      <StaffSalaryDialog
        open={!!salaryStaff}
        onOpenChange={(o) => !o && setSalaryStaff(null)}
        staff={salaryStaff}
      />

      <StaffAccessDialog
        open={!!accessStaff}
        onOpenChange={(o) => !o && setAccessStaff(null)}
        staff={accessStaff}
      />
    </motion.div>
  );
}
