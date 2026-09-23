/**
 * Schemavyn (etapp 3 B/C) — veckogrid per enhet med utkast → publicera,
 * öppna pass, drag-and-drop, regelmotor-varningar, förslagsmotor och sidokö
 * för väntande förfrågningar och flaggade avvikelser.
 *
 * All presentation använder Industry-primitiverna och tokens ur industry.css.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Download,
  History,
  Loader2,
  Plus,
  Send,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  IndustryButton,
  IndustryFrame,
  IndustryInput,
  IndustryRow,
  QueueItem,
  SectionLabel,
  SideQueue,
  StatusLabel,
} from "@/components/industry";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useFrequentStaff } from "@/hooks/useFrequentStaff";
import { Label } from "@/components/ui/label";
import { useStores } from "@/hooks/useStores";
import { useEmployees, useAllEmployments } from "@/hooks/useEmployees";
import {
  useShiftTypes,
  useShifts,
  useSaveShift,
  useDeleteShift,
  usePublishWeek,
  useShiftTemplates,
  useCreateWeekFromTemplates,
  useCopyWeek,
  useAvailability,
  useEmployeeCompetencies,
  useShiftRequests,
  useDecideShiftRequest,
  useShiftHistory,
} from "@/hooks/useSchedule";
import { useAbsenceRequests, useAbsenceTypes, useDecideAbsenceRequest } from "@/hooks/useAbsence";
import { useAttestations, DEVIATION_LABEL } from "@/hooks/useAttest";
import {
  DAY_NAMES,
  checkShift,
  dateKey,
  formatMinutes,
  isoWeek,
  mondayOf,
  shiftMinutes,
  suggestCandidates,
  weekDates,
  worstSeverity,
  type Shift,
  type RuleCheck,
} from "@/lib/schedule";
import { buildAiPrompt, downloadTemplate, exportWeek } from "@/lib/scheduleImport";
import { effectiveHourlyRate, formatMoney } from "@/lib/staffKpi";
import { usePayrollOverhead } from "@/hooks/useStaffKpi";
import { useWeekdayRevenue } from "@/hooks/useWeekdayRevenue";
import { useWeekdayStaffNeed } from "@/hooks/useWeekdayStaffNeed";
import { useMarginSettings } from "@/hooks/useMarginSettings";

/** Varningsgräns: personalkostnad i procent av snittförsäljningen. */
const LABOR_COST_LIMIT_PCT = 20;
import { ScheduleImportDialog } from "@/components/schedule/ScheduleImportDialog";

const today = () => dateKey(new Date());

const OPEN_ROW = "__open__";

export default function SchedulePlanner() {
  const [storeId, setStoreId] = useState<string>("");
  const [anchor, setAnchor] = useState<string>(today());
  const [editing, setEditing] = useState<Partial<Shift> | null>(null);
  const [suggestFor, setSuggestFor] = useState<Shift | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dragging, setDragging] = useState<Shift | null>(null);
  /** Tomläget är veckans normaltillstånd — "Börja tomt" öppnar rutnätet manuellt. */
  const [startEmpty, setStartEmpty] = useState(false);
  /** Personer som lagts till i veckans rutnät manuellt — inget är förifyllt. */
  const [extraRows, setExtraRows] = useState<string[]>([]);
  /** Sökpopovern för "Lägg till person i veckan". */
  const [addOpen, setAddOpen] = useState(false);

  const week = useMemo(() => weekDates(anchor), [anchor]);
  const prevWeek = useMemo(() => {
    const d = mondayOf(anchor);
    d.setDate(d.getDate() - 7);
    return dateKey(d);
  }, [anchor]);

  const { data: stores = [] } = useStores();
  const store = stores.find((s) => s.id === storeId);
  const { data: employees = [] } = useEmployees(false);
  const { data: employments = [] } = useAllEmployments();
  const { data: shiftTypes = [] } = useShiftTypes();
  const { data: shifts = [], isLoading } = useShifts(storeId || null, week[0], week[6]);
  const prevWeekDates = useMemo(() => weekDates(prevWeek), [prevWeek]);
  const { data: prevShifts = [] } = useShifts(storeId || null, prevWeekDates[0], prevWeekDates[6]);
  const { data: templates = [] } = useShiftTemplates(storeId || null);
  const { data: availability = [] } = useAvailability();
  const { data: competencies = [] } = useEmployeeCompetencies();
  const { data: attestations = [] } = useAttestations(storeId || null, week[0], week[6]);
  const { data: requests = [] } = useShiftRequests(shifts.map((s) => s.id));
  /* Frånvaron hämtas för alla enheter: personal kan schemaläggas överallt, så en
     semester registrerad på hemmabutiken måste spärra passet även i en annan butik. */
  const { data: absenceRequests = [] } = useAbsenceRequests(undefined, null);
  const { data: absenceTypes = [] } = useAbsenceTypes();
  const { data: overheadPct = 0 } = usePayrollOverhead();
  const { data: weekdayRevenue } = useWeekdayRevenue(storeId || null, week[0]);
  const { margins } = useMarginSettings(storeId || null);
  
  const { data: frequentStaff = [] } = useFrequentStaff(storeId || null);


  const saveShift = useSaveShift();
  const deleteShift = useDeleteShift();
  const publishWeek = usePublishWeek();
  const fromTemplates = useCreateWeekFromTemplates();
  const copyWeek = useCopyWeek();
  const decideRequest = useDecideShiftRequest();
  const decideAbsenceRequest = useDecideAbsenceRequest();
  const { data: history = [] } = useShiftHistory(historyFor);
  const absenceTypeById = useMemo(() => new Map(absenceTypes.map((type) => [type.id, type])), [absenceTypes]);
  const nameByEmployeeId = useMemo(
    () => new Map(employees.map((employee) => [employee.id, `${employee.first_name} ${employee.last_name}`])),
    [employees],
  );
  const pendingAbsenceRequests = absenceRequests.filter(
    (request) => request.status === "pending" && (!storeId || request.store_id === storeId),
  );

  /** Frånvaroblock per anställd — både beslutade och väntande spärrar passet. */
  const absencesByEmployee = useMemo(() => {
    const map = new Map<string, { from: string; to: string; label: string }[]>();
    absenceRequests
      .filter((request) => ["pending", "approved", "auto_approved"].includes(request.status))
      .forEach((request) => {
        const from = request.date_from ?? request.start_date;
        const to = request.date_to ?? request.end_date ?? from;
        const label = absenceTypeById.get(request.absence_type_id)?.name ?? "Frånvaro";
        map.set(request.employee_id, [...(map.get(request.employee_id) ?? []), { from, to, label }]);
      });
    return map;
  }, [absenceRequests, absenceTypeById]);

  const storeEmployments = useMemo(
    () => employments.filter((e) => e.store_id === storeId && e.is_active),
    [employments, storeId],
  );
  /**
   * Alla aktiva anställda kan schemaläggas på vilken enhet som helst — anställningen
   * på butiken används bara för att hämta grad och anställningsnummer när den finns.
   */
  const roster = useMemo(
    () =>
      employees
        .map((emp) => {
          const em =
            storeEmployments.find((e) => e.employee_id === emp.id) ??
            employments.find((e) => e.employee_id === emp.id && e.is_active) ??
            null;
          const raw = Number(em?.employment_rate ?? 1);
          const rate = !Number.isFinite(raw) || raw <= 0 ? 1 : raw > 1.5 ? raw / 100 : raw;
          return {
            employee_id: emp.id,
            name: `${emp.first_name} ${emp.last_name}`,
            birthDate: emp.birth_date,
            employmentRate: rate,
            employmentNumber: em?.employment_number ?? null,
            competencies: competencies.filter((c) => c.employee_id === emp.id).map((c) => c.competency),
            availability: availability.filter((a) => a.employee_id === emp.id),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "sv")) as {
        employee_id: string;
        name: string;
        birthDate: string | null;
        employmentRate: number;
        employmentNumber: string | null;
        competencies: string[];
        availability: ReturnType<typeof useAvailability>["data"] extends (infer T)[] ? T[] : never;
      }[],
    [storeEmployments, employments, employees, competencies, availability],
  );

  const typeById = useMemo(() => new Map(shiftTypes.map((t) => [t.id, t])), [shiftTypes]);
  const nameById = useMemo(() => new Map(roster.map((r) => [r.employee_id, r.name])), [roster]);

  const checksFor = (shift: Shift): RuleCheck[] => {
    if (!shift.employee_id) return [];
    const person = roster.find((r) => r.employee_id === shift.employee_id);
    if (!person) return [];
    return checkShift(shift, {
      shifts: shifts.filter((s) => s.employee_id === shift.employee_id),
      availability: person.availability as never,
      competencies: person.competencies,
      birthDate: person.birthDate,
      employmentRate: person.employmentRate,
      absences: absencesByEmployee.get(shift.employee_id) ?? [],
      requiredCompetency: shift.shift_type_id ? typeById.get(shift.shift_type_id)?.required_competency : null,
    });
  };

  /**
   * Spärr innan ett pass sparas: frånvaro, överlapp, dygnsvila och övriga
   * blockerande regler får aldrig passeras tyst, oavsett hur passet skapas.
   */
  const blockersFor = (shift: Shift): RuleCheck[] =>
    checksFor(shift).filter((c) => c.severity === "block");

  const blockedBySchedule = (shift: Shift) => {
    const blockers = blockersFor(shift);
    if (blockers.length === 0) return false;
    const who = shift.employee_id ? nameById.get(shift.employee_id) ?? "Personen" : "Personen";
    toast.error(`${who}: ${blockers[0].label}`, { description: blockers[0].detail });
    return true;
  };

  const draftCount = shifts.filter((s) => s.status === "draft").length;
  const openCount = shifts.filter((s) => !s.employee_id && s.status !== "cancelled").length;
  const plannedMinutes = shifts
    .filter((s) => s.status !== "cancelled")
    .reduce((sum, s) => sum + shiftMinutes(s), 0);

  const pending = requests.filter((r) => r.status === "pending");
  const flagged = attestations.filter((a) => a.status === "flagged");

  const shiftsAt = (employeeKey: string, date: string) =>
    shifts.filter(
      (s) =>
        s.date === date &&
        s.status !== "cancelled" &&
        (employeeKey === OPEN_ROW ? !s.employee_id : s.employee_id === employeeKey),
    );

  const moveShift = async (shift: Shift, employeeKey: string, date: string) => {
    const employeeId = employeeKey === OPEN_ROW ? null : employeeKey;
    if (shift.status === "published" && !confirm("Passet är publicerat. Flytta ändå?")) return;
    if (blockedBySchedule({ ...shift, employee_id: employeeId, date })) return;
    try {
      await saveShift.mutateAsync({ ...shift, employee_id: employeeId, date, status: "draft", published_at: null });
      toast.success("Passet flyttat och sparat som utkast");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte flytta passet");
    }
  };

  const copyAiPrompt = async () => {
    const prompt = buildAiPrompt(
      roster.map((r) => ({
        name: r.name,
        employment_number: r.employmentNumber,
        employment_rate: r.employmentRate,
        competencies: r.competencies,
        store: store?.name ?? "",
      })),
      shiftTypes.map((t) => t.name),
      `v ${isoWeek(anchor)} (${week[0]} – ${week[6]})`,
    );
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("AI-underlaget ligger på urklipp");
    } catch {
      toast.error("Kunde inte kopiera — markera och kopiera manuellt");
    }
  };

  const exportCurrentWeek = () => {
    exportWeek(
      shifts
        .filter((s) => s.status !== "cancelled")
        .map((s) => ({
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          break_minutes: s.break_minutes,
          employment_number: roster.find((r) => r.employee_id === s.employee_id)?.employmentNumber ?? null,
          name: s.employee_id ? (nameById.get(s.employee_id) ?? "") : "",
          store: store?.name ?? "",
          shift_type: s.shift_type_id ? (typeById.get(s.shift_type_id)?.name ?? "") : "",
          note: s.note,
        })),
      `schema-v${isoWeek(anchor)}.xlsx`,
    );
  };

  const suggestions = useMemo(() => {
    if (!suggestFor) return [];
    return suggestCandidates(
      suggestFor,
      roster.map((r) => ({
        employee_id: r.employee_id,
        name: r.name,
        employmentRate: r.employmentRate,
        birthDate: r.birthDate,
        competencies: r.competencies,
        availability: r.availability as never,
        shifts: shifts.filter((s) => s.employee_id === r.employee_id),
        absences: absencesByEmployee.get(r.employee_id) ?? [],
      })),
      {
        requiredCompetency: suggestFor.shift_type_id
          ? typeById.get(suggestFor.shift_type_id)?.required_competency
          : null,
      },
    );
  }, [suggestFor, roster, shifts, typeById, absencesByEmployee]);

  const weekRangeLabel = useMemo(() => {
    const format = (value: string) =>
      new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
    return `${format(week[0])} – ${format(week[6])} ${week[6].slice(0, 4)}`;
  }, [week]);

  /** Underlag till tomlägets primärval: vad förra veckan innehöll. */
  const prevStats = useMemo(() => {
    const live = prevShifts.filter((s) => s.status !== "cancelled");
    return {
      count: live.length,
      people: new Set(live.map((s) => s.employee_id).filter(Boolean)).size,
      minutes: live.reduce((sum, s) => sum + shiftMinutes(s), 0),
    };
  }, [prevShifts]);

  /** Veckan börjar alltid tom i rutnätet — kopiera eller mall väljs i verktygsraden. */
  const showEmptyState = false;

  /** Regelbrott i veckan — samma siffra som visas per pass. */
  const violationCount = useMemo(
    () => shifts.filter((s) => s.status !== "cancelled" && checksFor(s).length > 0).length,
    [shifts, checksFor],
  );

  /** Timmar per person och veckans tak ur sysselsättningsgraden. */
  const personHours = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of shifts) {
      if (s.status === "cancelled") continue;
      const key = s.employee_id ?? OPEN_ROW;
      map.set(key, (map.get(key) ?? 0) + shiftMinutes(s));
    }
    return map;
  }, [shifts]);

  /** Timlönsekvivalent per anställd ur anställningen (månadslön slås ut per timme). */
  const rateByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    // Butikens anställning först, annars personens övriga aktiva anställning.
    [...employments.filter((e) => e.is_active), ...storeEmployments].forEach((em) => {
      const rate = effectiveHourlyRate(em.pay_type, em.hourly_rate, em.monthly_salary);
      if (rate !== null) map.set(em.employee_id, rate);
    });
    return map;
  }, [storeEmployments, employments]);

  /**
   * Snittlön på enheten — används för öppna pass som ännu saknar person. Enhetens
   * egna anställningar väger först, hela registret bara som sista utväg.
   */
  const fallbackRate = useMemo(() => {
    const own = storeEmployments
      .filter((e) => e.is_active !== false)
      .map((e) => effectiveHourlyRate(e.pay_type, e.hourly_rate, e.monthly_salary))
      .filter((r): r is number => r !== null && r > 0);
    if (own.length) return own.reduce((a, b) => a + b, 0) / own.length;
    const values = Array.from(rateByEmployee.values());
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [storeEmployments, rateByEmployee]);

  /**
   * Påslag för arbetsgivaravgifter. Finns ingen egen inställning används den
   * lagstadgade satsen, så behov och kostnad aldrig räknas utan avgifter.
   */
  const effectiveOverheadPct = overheadPct > 0 ? overheadPct : 31.42;

  /** Kostnad per arbetad timme inklusive påslag — grunden för behovsramen. */
  const hourlyCostWithOverhead = useMemo(() => {
    if (fallbackRate === null || fallbackRate <= 0) return null;
    return fallbackRate * (1 + effectiveOverheadPct / 100);
  }, [fallbackRate, effectiveOverheadPct]);

  /** Personalkostnad per dag, inklusive påslag för arbetsgivaravgifter. */
  const costPerDay = useMemo(() => {
    const factor = 1 + effectiveOverheadPct / 100;
    return week.map((d) =>
      shifts
        .filter((s) => s.date === d && s.status !== "cancelled")
        .reduce((sum, s) => {
          const rate = s.employee_id ? rateByEmployee.get(s.employee_id) ?? fallbackRate : fallbackRate;
          if (rate === null || rate === undefined) return sum;
          return sum + (shiftMinutes(s) / 60) * rate * factor;
        }, 0),
    );
  }, [shifts, week, rateByEmployee, fallbackRate, effectiveOverheadPct]);

  /** Kostnadsandel mot snittförsäljningen för samma veckodag bakåt i tiden. */
  const costRatio = useMemo(
    () =>
      week.map((_, i) => {
        const expected = weekdayRevenue.average[i];
        const cost = costPerDay[i] ?? 0;
        if (!expected || expected <= 0 || cost <= 0) return null;
        return (cost / expected) * 100;
      }),
    [week, weekdayRevenue, costPerDay],
  );

  const weekCost = useMemo(() => costPerDay.reduce((a, b) => a + b, 0), [costPerDay]);
  const expectedWeekRevenue = useMemo(
    () =>
      weekdayRevenue.average.reduce<number | null>((sum, value, i) => {
        if (!value || (costPerDay[i] ?? 0) <= 0) return sum;
        return (sum ?? 0) + value;
      }, null),
    [weekdayRevenue, costPerDay],
  );
  const weekCostRatio =
    expectedWeekRevenue && expectedWeekRevenue > 0 && weekCost > 0 ? (weekCost / expectedWeekRevenue) * 100 : null;
  const overLimitDays = costRatio.filter((r) => r !== null && r > LABOR_COST_LIMIT_PCT).length;

  /** Täckning per dag: hur många pass som har en person. */
  const coverage = useMemo(
    () =>
      week.map((d) => {
        const day = shifts.filter((s) => s.date === d && s.status !== "cancelled");
        const people = new Set(day.filter((s) => s.employee_id).map((s) => s.employee_id as string));
        return { total: day.length, staffed: day.filter((s) => s.employee_id).length, people: people.size };
      }),
    [shifts, week],
  );

  /**
   * Behov per dag: omsättningen sätter ramen, historiken justerar inom ±25 %.
   * Timkostnaden är densamma som personalkostnaden räknas med, så behovsraden
   * och kostnadsraden aldrig kan säga emot varandra.
   */
  /** Planerade timmar per dag — jämförs mot behovet i samma enhet. */
  const plannedHoursPerDay = useMemo(
    () =>
      week.map((d) =>
        shifts
          .filter((s) => s.date === d && s.status !== "cancelled")
          .reduce((sum, s) => sum + shiftMinutes(s) / 60, 0),
      ),
    [shifts, week],
  );

  const { data: needPerDay } = useWeekdayStaffNeed(storeId || null, week[0], {
    averageRevenue: weekdayRevenue.average,
    revenueSamples: weekdayRevenue.samples,
    hourlyCost: hourlyCostWithOverhead,
    margins,
  });

  /**
   * Rutnätets rader: öppna pass, de som redan har pass i veckan och de personer
   * du själv lagt till. Ingenting är förifyllt.
   */
  const gridRows = useMemo(() => {
    const withShifts = new Set(
      shifts.filter((s) => s.status !== "cancelled" && s.employee_id).map((s) => s.employee_id as string),
    );
    const keys = Array.from(new Set([...withShifts, ...extraRows]));
    const people = keys
      .map((key) => {
        const r = roster.find((p) => p.employee_id === key);
        return { key, name: r?.name ?? nameByEmployeeId.get(key) ?? "Okänd", rate: r?.employmentRate ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
    return [{ key: OPEN_ROW, name: "Öppna pass", rate: null as number | null }, ...people];
  }, [shifts, extraRows, roster, nameByEmployeeId]);

  /** Personer som ännu inte har en rad i veckan. */
  const addablePeople = useMemo(
    () => roster.filter((r) => !gridRows.some((row) => row.key === r.employee_id)),
    [roster, gridRows],
  );

  /** Snabbval: de fem som jobbat flest pass på enheten senaste 12 veckorna. */
  const frequentPeople = useMemo(() => {
    const rank = new Map(frequentStaff.map((f, i) => [f.employee_id, i]));
    return addablePeople
      .filter((r) => rank.has(r.employee_id))
      .sort((a, b) => (rank.get(a.employee_id) ?? 0) - (rank.get(b.employee_id) ?? 0))
      .slice(0, 5);
  }, [frequentStaff, addablePeople]);

  return (
    <IndustryFrame
      className="ind-page flex min-h-full flex-col"
      style={{ padding: "clamp(0.5rem, 1.2vw, 1rem)" }}
    >
      <div className="flex flex-1 flex-col rounded-2xl border border-border/70 bg-card shadow-[0_16px_40px_-24px_hsl(var(--primary)/0.35)]">

        <header
          className="flex flex-wrap items-center justify-between border-b border-border"
          style={{ gap: "clamp(0.5rem, 1vw, 0.85rem)", padding: "clamp(0.6rem, 1.3vw, 1rem) clamp(0.75rem, 1.6vw, 1.25rem)" }}
        >
          <div className="flex min-w-0 flex-col">
            <SectionLabel>Tidsperiod</SectionLabel>
            <h1
              className="flex flex-wrap items-baseline gap-2 font-semibold leading-tight text-foreground"
              style={{ fontSize: "clamp(1.05rem, 1.9vw, 1.5rem)" }}
            >
              Vecka {isoWeek(anchor)}
              <span
                className="font-normal italic text-muted-foreground"
                style={{ fontSize: "clamp(0.68rem, 1vw, 0.875rem)" }}
              >
                {weekRangeLabel}
              </span>
            </h1>
          </div>
          {storeId && !showEmptyState && (
            <div className="flex flex-wrap items-stretch gap-2">
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Schemalagt</p>
                <p className="font-mono text-base font-medium leading-tight tabular-nums text-foreground xl:text-lg">
                  {formatMinutes(plannedMinutes)}
                </p>
              </div>
              <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Utkast</p>
                <p className="font-mono text-base font-medium leading-tight tabular-nums text-foreground xl:text-lg">{draftCount}</p>
              </div>
              <div
                className={`rounded-lg border px-3 py-1.5 ${violationCount ? "border-destructive/30 bg-destructive/5" : "border-border/70 bg-muted/20"}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Regelbrott</p>
                <p
                  className={`font-mono text-base font-medium leading-tight tabular-nums xl:text-lg ${violationCount ? "text-destructive" : "text-foreground"}`}
                >
                  {violationCount}
                </p>
              </div>
              <div
                className={`rounded-lg border px-3 py-1.5 ${
                  weekCostRatio !== null && weekCostRatio > LABOR_COST_LIMIT_PCT
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-border/70 bg-muted/20"
                }`}
                title={
                  weekCostRatio === null
                    ? "Snittförsäljning per veckodag saknas för enheten"
                    : `Andel av snittförsäljningen för samma veckodagar bakåt (gräns ${LABOR_COST_LIMIT_PCT} %)`
                }
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Personalkostnad
                </p>
                <p
                  className={`flex items-center gap-1.5 font-mono text-base font-medium leading-tight tabular-nums xl:text-lg ${
                    weekCostRatio !== null && weekCostRatio > LABOR_COST_LIMIT_PCT
                      ? "text-destructive"
                      : "text-foreground"
                  }`}
                >
                  {weekCostRatio !== null && weekCostRatio > LABOR_COST_LIMIT_PCT && (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  {weekCostRatio === null ? "–" : `${weekCostRatio.toFixed(1)} %`}
                </p>
                <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {weekCost > 0 ? formatMoney(weekCost, store?.currency ?? "SEK") : "0 kr"}
                  {overLimitDays ? ` · ${overLimitDays} dag${overLimitDays > 1 ? "ar" : ""} över gränsen` : ""}
                </p>
              </div>
            </div>
          )}
          <div className="flex min-w-0 items-center gap-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="ind-input h-9 w-[min(15rem,42vw)]">
              <SelectValue placeholder="Välj enhet" />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex overflow-hidden rounded-md border border-border">
          <IndustryButton
            variant="ghost" className="h-9 rounded-none border-0 px-2.5"
            onClick={() => {
              const d = mondayOf(anchor);
              d.setDate(d.getDate() - 7);
              setAnchor(dateKey(d));
            }}
            aria-label="Föregående vecka"
          >
            <ChevronLeft className="h-4 w-4" />
          </IndustryButton>
          <IndustryButton
            variant="ghost" className="h-9 rounded-none border-0 border-l border-border px-2.5"
            onClick={() => {
              const d = mondayOf(anchor);
              d.setDate(d.getDate() + 7);
              setAnchor(dateKey(d));
            }}
            aria-label="Nästa vecka"
          >
            <ChevronRight className="h-4 w-4" />
          </IndustryButton>
          </div>
        </div>
        </header>

      {!storeId ? (
        <IndustryRow edge="neutral" className="m-4">
          <p className="ind-muted text-sm">Välj en enhet för att planera veckan.</p>
        </IndustryRow>
      ) : (
        <>
          {!showEmptyState && (
          <section
            className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border bg-muted/20 px-4 py-1.5"
            aria-label="Enhet och förklaring"
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Enhet</span>
              <span className="truncate text-xs font-semibold text-foreground">{store?.name ?? ""}</span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {openCount} öppna pass
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Publicerat
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" /> Utkast
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> Regelbrott
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-2.5 border border-dashed border-muted-foreground/70" /> Öppet pass
              </span>
            </div>
          </section>
          )}

          {!showEmptyState && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-primary/[0.04] px-4 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <IndustryButton
                variant="primary"
                className="h-9"
                onClick={() =>
                  setEditing({
                    store_id: storeId,
                    legal_entity_id: store?.legal_entity_id ?? null,
                    employee_id: null,
                    date: week[0],
                    start_time: "08:00",
                    end_time: "17:00",
                    break_minutes: 30,
                    status: "draft",
                    shift_type_id: shiftTypes[0]?.id ?? null,
                  })
                }
              >
                <Plus className="h-4 w-4" /> Lägg till pass
              </IndustryButton>
              <IndustryButton
                className="h-9"
                onClick={async () => {
                  try {
                    const n = await fromTemplates.mutateAsync({
                      storeId,
                      legalEntityId: store?.legal_entity_id ?? null,
                      anchor,
                      templates,
                    });
                    toast.success(n ? `${n} pass skapade från mall` : "Inga mallar för enheten");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Kunde inte skapa från mall");
                  }
                }}
              >
                Från mall
              </IndustryButton>
              <IndustryButton
                className="h-9"
                onClick={async () => {
                  try {
                    const n = await copyWeek.mutateAsync({
                      storeId,
                      fromAnchor: prevWeek,
                      toAnchor: anchor,
                      keepEmployees: true,
                    });
                    toast.success(n.count ? `${n.count} pass kopierade från förra veckan` : "Förra veckan är tom", {
                      description: n.freed
                        ? `${n.freed} pass lades som obemannade eftersom personen är ledig.`
                        : undefined,
                    });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Kunde inte kopiera vecka");
                  }
                }}
              >
                Kopiera vecka
              </IndustryButton>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <IndustryButton variant="ghost" className="h-9 px-2.5 text-xs" onClick={copyAiPrompt}>
                <ClipboardCopy className="h-4 w-4" /> Kopiera AI-underlag
              </IndustryButton>
              <IndustryButton variant="ghost" className="h-9 px-2.5 text-xs" onClick={() => downloadTemplate()}>
                <Download className="h-4 w-4" /> Mall
              </IndustryButton>
              <IndustryButton variant="ghost" className="h-9 px-2.5 text-xs" onClick={exportCurrentWeek}>
                Exportera vecka
              </IndustryButton>
              <IndustryButton className="h-9 px-3 text-xs" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Importera schema
              </IndustryButton>
            </div>
          </div>
          )}

          {showEmptyState ? (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-muted/20 px-4 py-8">
              <div className="w-full max-w-3xl">
                <div className="flex flex-col items-center text-center">
                  <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="h-7 w-7" />
                  </span>
                  <h2 className="text-xl font-semibold text-foreground">
                    Redo att lägga vecka {isoWeek(anchor)}?
                  </h2>
                  <p className="mt-1 max-w-md text-sm text-muted-foreground">
                    Veckan är tom. De flesta veckor är förra veckan med ett par ändringar — börja där, eller bygg från
                    grunden.
                  </p>
                </div>
                <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
                  <button
                    type="button"
                    disabled={!prevStats.count || copyWeek.isPending}
                    className="rounded-xl bg-primary px-4 py-4 text-left text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-50 disabled:hover:translate-y-0"
                    onClick={async () => {
                      try {
                        const n = await copyWeek.mutateAsync({
                          storeId,
                          fromAnchor: prevWeek,
                          toAnchor: anchor,
                          keepEmployees: true,
                        });
                        toast.success(n.count ? `${n.count} pass kopierade från förra veckan` : "Förra veckan är tom", {
                      description: n.freed
                        ? `${n.freed} pass lades som obemannade eftersom personen är ledig.`
                        : undefined,
                    });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Kunde inte kopiera vecka");
                      }
                    }}
                  >
                    <span className="block text-sm font-semibold">Kopiera vecka {isoWeek(prevWeek)}</span>
                    <span className="mt-1 block font-mono text-[11px] tabular-nums opacity-90">
                      {prevStats.count
                        ? `${prevStats.count} pass · ${prevStats.people} personer · ${formatMinutes(prevStats.minutes)}`
                        : "Förra veckan är tom"}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
                    onClick={() => setImportOpen(true)}
                  >
                    <span className="block text-sm font-semibold text-foreground">Importera från fil</span>
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                      Excel eller CSV · samma granskning
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40"
                    onClick={() => setStartEmpty(true)}
                  >
                    <span className="block text-sm font-semibold text-primary">Börja tomt</span>
                    <span className="mt-1 block font-mono text-[11px] text-muted-foreground">Bygg pass för pass</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
          <div className="grid flex-1 items-start lg:grid-cols-[minmax(0,1fr)_clamp(200px,19vw,300px)]">
            <div className="min-w-0 overflow-x-auto">

              <table className="w-full min-w-[640px] table-fixed border-collapse">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-3 py-3 text-left" style={{ width: "clamp(7rem, 15vw, 12rem)" }}>
                      <SectionLabel>Personal</SectionLabel>
                    </th>
                    {week.map((d, i) => {
                      const weekend = i >= 5;
                      const isToday = d === today();
                      return (
                        <th
                          key={d}
                          className={`border-l border-border/40 px-1 py-3 text-center align-bottom ${weekend ? "bg-muted/30" : ""}`}
                        >
                          <span
                            className={`block text-xs font-semibold uppercase tracking-wide leading-tight ${isToday ? "text-primary" : "text-foreground"}`}
                          >
                            <span className="hidden lg:inline">{DAY_NAMES[i]}</span>
                            <span className="lg:hidden">{DAY_NAMES[i].slice(0, 3)}</span>
                          </span>
                          <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">
                            {d.slice(8)}
                          </span>
                        </th>
                      );
                    })}
                    <th className="border-l border-border px-2 py-3 text-right" style={{ width: "clamp(4.25rem, 8vw, 7rem)" }}>
                      <SectionLabel>Tim / tak</SectionLabel>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {gridRows.map(
                    (row) => (
                      <tr key={row.key} className="group border-b border-border/40 transition-colors hover:bg-card">
                        <td className="align-top">
                          <IndustryRow edge={row.key === OPEN_ROW ? "alert" : "neutral"} className="h-full min-h-14 border-0 bg-transparent px-3 py-2 shadow-none">
                            <div className="flex items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
                                {row.key === OPEN_ROW
                                  ? "?"
                                  : row.name
                                      .split(" ")
                                      .filter(Boolean)
                                      .slice(0, 2)
                                      .map((p) => p[0])
                                      .join("")}
                              </span>
                              <span className="min-w-0">
                                <span className="ind-strong block break-words text-[11px] leading-tight lg:text-xs xl:text-sm">
                                  {row.name}
                                </span>
                                {row.rate != null && (
                                  <span className="ind-muted block font-mono text-[10px] tabular-nums">
                                    {row.rate >= 1 ? "Heltid" : "Deltid"} · {Math.round(row.rate * 100)} %
                                  </span>
                                )}
                              </span>
                            </div>
                          </IndustryRow>
                        </td>
                        {week.map((d) => (
                          <td
                            key={`${row.key}-${d}`}
                            className="align-top"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (dragging) moveShift(dragging, row.key, d);
                              setDragging(null);
                            }}
                          >
                             <div className="min-h-14 space-y-1 border-l border-border/60 p-1">
                              {shiftsAt(row.key, d).map((s) => {
                                const type = s.shift_type_id ? typeById.get(s.shift_type_id) : null;
                                const checks = checksFor(s);
                                const severity = worstSeverity(checks);
                                return (
                                  <div
                                    key={s.id}
                                    draggable
                                    onDragStart={() => setDragging(s)}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setEditing(s);
                                    }}
                                    title={checks.map((c) => `${c.label}: ${c.detail}`).join("\n") || undefined}
                                     className="ind-card cursor-pointer overflow-hidden p-1.5"
                                     style={{
                                       boxShadow: `inset 3px 0 0 var(--color-${type?.color_token ?? "neutral-400"})`,
                                       opacity: s.status === "draft" ? 0.72 : 1,
                                     }}
                                  >
                                     <p className="ind-mono whitespace-nowrap text-[10px] leading-tight lg:text-[11px] xl:text-xs">
                                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                    </p>
                                    <div className="flex items-center gap-1">
                                       <span className="ind-muted hidden truncate text-[10px] lg:inline">{type?.name ?? "Pass"}</span>
                                      {s.status === "draft" && <StatusLabel tone="progress">Utkast</StatusLabel>}
                                      {severity && (
                                        <span
                                          className={`ind-status--${severity === "block" ? "alert" : "progress"} inline-flex items-center gap-1 text-xs`}
                                        >
                                          <AlertTriangle className="h-3 w-3" />
                                          {checks.length}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                              <button
                                type="button"
                                 className="ind-btn ind-btn--ghost h-7 w-full justify-center p-0 text-xs"
                                onClick={() =>
                                  setEditing({
                                    store_id: storeId,
                                    legal_entity_id: store?.legal_entity_id ?? null,
                                    employee_id: row.key === OPEN_ROW ? null : row.key,
                                    date: d,
                                    start_time: "08:00",
                                    end_time: "17:00",
                                    break_minutes: 30,
                                    status: "draft",
                                    shift_type_id: shiftTypes[0]?.id ?? null,
                                  })
                                }
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        ))}
                        <td className="border-l border-border px-2 py-2 align-top text-right">
                          {(() => {
                            const minutes = personHours.get(row.key) ?? 0;
                            const capMinutes = row.rate != null ? Math.round(row.rate * 40 * 60) : null;
                            const over = capMinutes != null && minutes > capMinutes;
                            return (
                              <>
                                <span
                                  className={`block font-mono text-xs tabular-nums ${over ? "text-destructive" : "text-foreground"}`}
                                >
                                  {(minutes / 60).toFixed(1).replace(".", ",")}
                                  {capMinutes != null ? ` / ${Math.round(capMinutes / 60)}` : ""}
                                </span>
                                {capMinutes != null && (
                                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                                    <span
                                      className={`block h-full ${over ? "bg-destructive" : "bg-primary"}`}
                                      style={{ width: `${Math.min(100, Math.round((minutes / Math.max(capMinutes, 1)) * 100))}%` }}
                                    />
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-card">
                  <tr className="border-t-2 border-border">
                    <td className="px-3 py-2">
                      <SectionLabel>Täckning</SectionLabel>
                    </td>
                    {coverage.map((c, i) => (
                      <td key={week[i]} className="border-l border-border/40 px-1 py-2 text-center">
                        <span
                          className={`font-mono text-sm font-semibold tabular-nums ${c.total && c.staffed < c.total ? "text-destructive" : c.total ? "text-foreground" : "text-muted-foreground"}`}
                        >
                          {c.total ? `${c.staffed} / ${c.total}` : "0"}
                        </span>
                      </td>
                    ))}
                    <td className="border-l border-border bg-muted/40 px-2 py-2 text-right">
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatMinutes(plannedMinutes)}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <SectionLabel>Behov (ca)</SectionLabel>
                    </td>
                    {needPerDay.map((n, i) => {
                      const plannedHours = plannedHoursPerDay[i] ?? 0;
                      const short = n.hours !== null && n.hours > 0 && plannedHours < n.hours;
                      const cur = store?.currency ?? "SEK";
                      const money = (v: number | null) => formatMoney(v ?? 0, cur);
                      const dayLabel = i === 5 || i === 6 ? "helgdagar" : "veckodagar";
                      const chain =
                        n.hours === null
                          ? "Inget försäljningsunderlag för denna veckodag – inget behov beräknas"
                          : [
                              `Snittförsäljning ${money(weekdayRevenue.average[i] ?? 0)} ur ${n.samples} tidigare ${dayLabel}`,
                              `− moms ${margins.vatPct} % = netto ${money(n.net)}`,
                              `× bruttovinstmarginal ${margins.grossMarginPct} % = ${money(n.gross)}`,
                              `− övriga kostnader ${margins.otherCostPct} % och vinstkrav ${margins.profitTargetPct} % av nettot`,
                              `= lönebudget ${money(n.budget)}`,
                              `÷ timkostnad ${money(hourlyCostWithOverhead)} (lön + arbetsgivaravgift ${effectiveOverheadPct.toFixed(2)} %)`,
                              n.hours === 0
                                ? "= ingen plats för personal i kalkylen"
                                : `= ${n.hours.toFixed(1)} h${n.source === "omsättning+historik" ? " (justerat mot faktiskt arbetade timmar)" : ""}, pass ${n.avgShiftHours.toFixed(1)} h`,
                            ].join("\n");
                      return (
                        <td
                          key={`need-${week[i]}`}
                          className="border-l border-border/40 px-1 py-2 text-center"
                          title={chain}
                        >
                          <span
                            className={`font-mono text-sm font-semibold tabular-nums ${
                              n.hours === null ? "text-muted-foreground" : short ? "text-destructive" : "text-foreground"
                            }`}
                          >
                            {n.hours === null ? "–" : `${plannedHours.toFixed(1)} / ${n.hours.toFixed(1)} h`}
                          </span>
                          {n.hours !== null && (
                            <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                              {n.hours === 0
                                ? "utan utrymme"
                                : `ca ${n.people} pers · ${n.source === "omsättning+historik" ? "oms+hist" : "kalkyl"}`}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l border-border bg-muted/40 px-2 py-2 text-right">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {needPerDay.reduce((sum, n) => sum + (n.hours ?? 0), 0).toFixed(1)} h/v
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <SectionLabel>Snittförsäljning</SectionLabel>
                    </td>
                    {week.map((d, i) => {
                      const avg = weekdayRevenue.average[i];
                      const samples = weekdayRevenue.samples[i] ?? 0;
                      return (
                        <td
                          key={`rev-${d}`}
                          className="border-l border-border/40 px-1 py-2 text-center"
                          title={
                            avg
                              ? `Snitt av ${samples} tidigare ${i === 5 || i === 6 ? "helgdagar" : "veckodagar"} på denna enhet`
                              : "Ingen historisk försäljning för denna veckodag"
                          }
                        >
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums ${
                              avg ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {avg ? formatMoney(avg, store?.currency ?? "SEK") : "–"}
                          </span>
                          {avg ? (
                            <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                              {samples} dagar
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="border-l border-border bg-muted/40 px-2 py-2 text-right">
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {weekdayRevenue.average.some((v) => v)
                          ? formatMoney(
                              weekdayRevenue.average.reduce((sum, v) => sum + (v ?? 0), 0),
                              store?.currency ?? "SEK",
                            )
                          : "–"}
                      </span>
                    </td>
                  </tr>
                  <tr className="border-t border-border/60">
                    <td className="px-3 py-2">
                      <SectionLabel>Kostnad / snittförsäljning</SectionLabel>
                    </td>
                    {week.map((d, i) => {
                      const ratio = costRatio[i];
                      const over = ratio !== null && ratio > LABOR_COST_LIMIT_PCT;
                      const expected = weekdayRevenue.average[i];
                      return (
                        <td
                          key={`cost-${d}`}
                          className={`border-l border-border/40 px-1 py-2 text-center ${over ? "bg-destructive/5" : ""}`}
                          title={
                            expected
                              ? `Snitt ${formatMoney(expected, store?.currency ?? "SEK")} · ${weekdayRevenue.samples[i]} dagar bakåt`
                              : "Ingen historisk försäljning för denna veckodag"
                          }
                        >
                          <span
                            className={`font-mono text-xs font-semibold tabular-nums ${
                              over ? "text-destructive" : ratio !== null ? "text-foreground" : "text-muted-foreground"
                            }`}
                          >
                            {ratio === null ? "–" : `${ratio.toFixed(0)} %`}
                          </span>
                          {costPerDay[i] > 0 && (
                            <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                              {formatMoney(costPerDay[i], store?.currency ?? "SEK")}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l border-border bg-muted/40 px-2 py-2 text-right">
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          weekCostRatio !== null && weekCostRatio > LABOR_COST_LIMIT_PCT
                            ? "text-destructive"
                            : "text-foreground"
                        }`}
                      >
                        {weekCostRatio === null ? "–" : `${weekCostRatio.toFixed(1)} %`}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="space-y-2 px-3 py-3">
                <span className="ind-muted text-xs">Lägg till person i veckan</span>
                {frequentPeople.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="ind-muted text-xs">Jobbar oftast här:</span>
                    {frequentPeople.map((r) => (
                      <button
                        key={r.employee_id}
                        type="button"
                        onClick={() => setExtraRows((prev) => [...prev, r.employee_id])}
                        className="rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        {r.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="ind-muted text-xs">Ingen historik för enheten ännu – sök fram personen nedan.</p>
                )}
                <Popover open={addOpen} onOpenChange={setAddOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex h-9 w-[min(18rem,70vw)] items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-muted-foreground"
                    >
                      Sök namn…
                      <Search className="h-4 w-4 opacity-60" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[min(20rem,80vw)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Sök för- eller efternamn" />
                      <CommandList>
                        <CommandEmpty>Ingen träff.</CommandEmpty>
                        <CommandGroup>
                          {addablePeople.map((r) => (
                            <CommandItem
                              key={r.employee_id}
                              value={r.name}
                              onSelect={() => {
                                setExtraRows((prev) => [...prev, r.employee_id]);
                                setAddOpen(false);
                              }}
                            >
                              {r.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              {isLoading && <p className="ind-muted mt-3 text-sm">Läser schemat…</p>}
            </div>

            <SideQueue label="Att besluta" empty="Inget väntar just nu." className="hidden rounded-none border-0 border-l border-border bg-muted/30 p-4 shadow-none lg:block">
              <div className="space-y-2">
                {pendingAbsenceRequests.map((request) => (
                  <QueueItem key={request.id}>
                    <SectionLabel>Frånvaro</SectionLabel>
                    <p className="text-sm">
                      {absenceTypeById.get(request.absence_type_id)?.name ?? "Frånvaro"} · {request.start_date}{request.end_date ? ` – ${request.end_date}` : ""}
                    </p>
                    <p className="ind-muted text-xs">
                      {nameByEmployeeId.get(request.employee_id) ?? "Okänd medarbetare"} · {request.extent_pct}%
                    </p>
                    {request.note && <p className="ind-muted text-xs">{request.note}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <IndustryButton
                        variant="primary"
                        disabled={decideAbsenceRequest.isPending}
                        onClick={async () => {
                          try {
                            await decideAbsenceRequest.mutateAsync({ requestId: request.id, decision: "approved" });
                            toast.success("Frånvaro godkänd");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Kunde inte godkänna frånvaron");
                          }
                        }}
                      >
                        Godkänn
                      </IndustryButton>
                      <IndustryButton
                        variant="ghost"
                        disabled={decideAbsenceRequest.isPending}
                        onClick={async () => {
                          try {
                            await decideAbsenceRequest.mutateAsync({ requestId: request.id, decision: "rejected" });
                            toast.success("Frånvaro avslagen");
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Kunde inte avslå frånvaron");
                          }
                        }}
                      >
                        Avslå
                      </IndustryButton>
                    </div>
                  </QueueItem>
                ))}
                {pending.map((r) => {
                  const shift = shifts.find((s) => s.id === r.shift_id);
                  return (
                    <QueueItem key={r.id}>
                      <SectionLabel>
                        {r.type === "swap" ? "Byte" : r.type === "handover" ? "Överlämning" : "Ta öppet pass"}
                      </SectionLabel>
                      <p className="text-sm">
                        {shift ? `${shift.date} ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}` : "Pass saknas"}
                      </p>
                      <p className="ind-muted text-xs">
                        {r.from_employee_id ? (nameById.get(r.from_employee_id) ?? "Okänd") : "Öppet"} →{" "}
                        {r.to_employee_id ? (nameById.get(r.to_employee_id) ?? "Okänd") : "Öppet"}
                      </p>
                      {shift && r.to_employee_id && (
                        <ul className="ind-muted mt-1 space-y-0.5 text-xs">
                          {(() => {
                            const person = roster.find((p) => p.employee_id === r.to_employee_id);
                            if (!person) return <li>Mottagaren tillhör inte enheten.</li>;
                            const checks = checkShift(shift, {
                              shifts: shifts.filter((s) => s.employee_id === person.employee_id),
                              availability: person.availability as never,
                              competencies: person.competencies,
                              birthDate: person.birthDate,
                              employmentRate: person.employmentRate,
                              requiredCompetency: shift.shift_type_id
                                ? typeById.get(shift.shift_type_id)?.required_competency
                                : null,
                            });
                            return checks.length ? (
                              checks.map((c) => (
                                <li key={c.code + c.detail}>
                                  <StatusLabel tone={c.severity === "block" ? "alert" : "progress"}>{c.label}</StatusLabel>{" "}
                                  {c.detail}
                                </li>
                              ))
                            ) : (
                              <li>
                                <StatusLabel tone="ok">Inga regelbrott</StatusLabel>
                              </li>
                            );
                          })()}
                        </ul>
                      )}
                      <div className="mt-2 flex gap-2">
                        <IndustryButton
                          variant="primary"
                          onClick={async () => {
                            await decideRequest.mutateAsync({ request: r, approve: true });
                            toast.success("Godkänt");
                          }}
                        >
                          Godkänn
                        </IndustryButton>
                        <IndustryButton
                          variant="ghost"
                          onClick={async () => {
                            await decideRequest.mutateAsync({ request: r, approve: false });
                            toast.success("Avslaget");
                          }}
                        >
                          Avslå
                        </IndustryButton>
                      </div>
                    </QueueItem>
                  );
                })}
                {flagged.map((a) => (
                  <QueueItem key={a.id}>
                    <SectionLabel>Avvikelse</SectionLabel>
                    <p className="text-sm">
                      {a.date} · {nameById.get(a.employee_id) ?? "Okänd"}
                    </p>
                    <StatusLabel tone="alert">{DEVIATION_LABEL[a.deviation_type]}</StatusLabel>
                    <p className="ind-muted text-xs">
                      Differens {formatMinutes(a.computed?.diff_minutes ?? 0)} — hanteras i attestvyn.
                    </p>
                  </QueueItem>
                ))}
                {!pending.length && !flagged.length && <p className="ind-muted text-sm">Inget väntar just nu.</p>}
              </div>
            </SideQueue>
          </div>
          )}

          {!showEmptyState && (
            <footer className="flex flex-wrap items-center justify-between gap-3 bg-primary px-5 py-3 text-primary-foreground">
              <div className="flex items-center gap-3 text-sm font-medium">
                <span
                  className={`h-2 w-2 rounded-full ${draftCount ? "animate-pulse bg-amber-400" : "bg-emerald-300"}`}
                />
                <span>
                  {draftCount
                    ? `Opublicerade ändringar finns i utkast · ${draftCount} pass`
                    : `Vecka ${isoWeek(anchor)} är publicerad · du kan fortfarande ändra`}
                </span>
                <span className="hidden font-mono text-xs tabular-nums opacity-70 sm:inline">
                  {formatMinutes(plannedMinutes)} · {shifts.length} pass · {openCount} öppna
                </span>
              </div>
              {draftCount ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-background px-6 py-2 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
                  disabled={publishWeek.isPending}
                  onClick={async () => {
                    try {
                      const n = await publishWeek.mutateAsync({ storeId, anchor });
                      toast.success(`${n} pass publicerade`);
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Kunde inte publicera");
                    }
                  }}
                >
                  {publishWeek.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Publicera ändringar
                </button>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg bg-background px-6 py-2 text-sm font-semibold text-primary shadow-lg transition-transform hover:scale-[1.02] active:scale-95"
                  onClick={() =>
                    setEditing({
                      store_id: storeId,
                      legal_entity_id: store?.legal_entity_id ?? null,
                      employee_id: null,
                      date: week[0],
                      start_time: "08:00",
                      end_time: "17:00",
                      break_minutes: 30,
                      status: "draft",
                      shift_type_id: shiftTypes[0]?.id ?? null,
                    })
                  }
                >
                  <Plus className="h-4 w-4" /> Lägg till ändring
                </button>
              )}
            </footer>
          )}
        </>
      )}
      </div>

      {/* Passdialog */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="ind max-w-lg">
          <DialogHeader>
            <DialogTitle className="ind-h2">{editing?.id ? "Redigera pass" : "Nytt pass"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="ind-label">Datum</Label>
                  <IndustryInput
                    type="date"
                    value={editing.date ?? ""}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="ind-label">Rast (min)</Label>
                  <IndustryInput
                    type="number"
                    inputMode="decimal"
                    value={editing.break_minutes ?? 0}
                    onChange={(e) => setEditing({ ...editing, break_minutes: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label className="ind-label">Start</Label>
                  <IndustryInput
                    type="time"
                    value={(editing.start_time ?? "").slice(0, 5)}
                    onChange={(e) => setEditing({ ...editing, start_time: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="ind-label">Slut</Label>
                  <IndustryInput
                    type="time"
                    value={(editing.end_time ?? "").slice(0, 5)}
                    onChange={(e) => setEditing({ ...editing, end_time: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="ind-label">Skifttyp</Label>
                <Select
                  value={editing.shift_type_id ?? ""}
                  onValueChange={(v) => setEditing({ ...editing, shift_type_id: v })}
                >
                  <SelectTrigger className="ind-input">
                    <SelectValue placeholder="Välj typ" />
                  </SelectTrigger>
                  <SelectContent>
                    {shiftTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="ind-label">Person</Label>
                <Select
                  value={editing.employee_id ?? OPEN_ROW}
                  onValueChange={(v) => setEditing({ ...editing, employee_id: v === OPEN_ROW ? null : v })}
                >
                  <SelectTrigger className="ind-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPEN_ROW}>Öppet pass</SelectItem>
                    {roster.map((r) => (
                      <SelectItem key={r.employee_id} value={r.employee_id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="ind-label">Notering</Label>
                <IndustryInput
                  value={editing.note ?? ""}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                />
              </div>
              {editing.id && (
                <div className="flex flex-wrap gap-2">
                  <IndustryButton variant="ghost" onClick={() => setSuggestFor(editing as Shift)}>
                    <Users className="h-4 w-4" /> Förslag på person
                  </IndustryButton>
                  <IndustryButton variant="ghost" onClick={() => setHistoryFor(editing.id!)}>
                    <History className="h-4 w-4" /> Historik
                  </IndustryButton>
                  <IndustryButton
                    variant="ghost"
                    onClick={async () => {
                      await deleteShift.mutateAsync(editing.id!);
                      setEditing(null);
                      toast.success("Passet borttaget");
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Ta bort
                  </IndustryButton>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <IndustryButton variant="ghost" onClick={() => setEditing(null)}>
              Avbryt
            </IndustryButton>
            <IndustryButton
              variant="primary"
              corners
              disabled={saveShift.isPending}
              onClick={async () => {
                if (!editing?.date || !editing.start_time || !editing.end_time) {
                  toast.error("Datum och tider krävs");
                  return;
                }
                if (blockedBySchedule(editing as Shift)) return;
                try {
                  await saveShift.mutateAsync({
                    ...editing,
                    store_id: storeId,
                    legal_entity_id: store?.legal_entity_id ?? null,
                    date: editing.date,
                    start_time: editing.start_time,
                    end_time: editing.end_time,
                    status: "draft",
                    published_at: null,
                  } as never);
                  setEditing(null);
                  toast.success("Passet sparat som utkast");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kunde inte spara");
                }
              }}
            >
              Spara
            </IndustryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Förslagsmotor */}
      <Dialog open={Boolean(suggestFor)} onOpenChange={(o) => !o && setSuggestFor(null)}>
        <DialogContent className="ind max-w-2xl">
          <DialogHeader>
            <DialogTitle className="ind-h2">Förslag på person</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <IndustryRow key={s.employee_id} edge={s.blocked ? "alert" : i === 0 ? "accent" : "neutral"}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="ind-strong">
                      {i + 1}. {s.name}
                    </p>
                    <ul className="ind-muted space-y-0.5 text-xs">
                      {s.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusLabel tone={s.blocked ? "alert" : "ok"}>
                      {s.blocked ? "Blockerad" : `Poäng ${s.score}`}
                    </StatusLabel>
                    <IndustryButton
                      disabled={s.blocked || !suggestFor}
                      onClick={async () => {
                        if (blockedBySchedule({ ...(suggestFor as Shift), employee_id: s.employee_id })) return;
                        await saveShift.mutateAsync({ ...(suggestFor as Shift), employee_id: s.employee_id });
                        setSuggestFor(null);
                        setEditing(null);
                        toast.success(`${s.name} tilldelad passet`);
                      }}
                    >
                      Tilldela
                    </IndustryButton>
                  </div>
                </div>
              </IndustryRow>
            ))}
            {!suggestions.length && <p className="ind-muted text-sm">Inga kandidater i enhetens personal.</p>}
          </div>
        </DialogContent>
      </Dialog>

      {/* Historik */}
      <Dialog open={Boolean(historyFor)} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="ind max-w-2xl">
          <DialogHeader>
            <DialogTitle className="ind-h2">Ändringshistorik</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {history.map((h) => (
              <IndustryRow key={(h as { id: string }).id} edge="neutral">
                <p className="ind-mono text-xs">
                  {new Date((h as { changed_at: string }).changed_at).toLocaleString("sv-SE")} ·{" "}
                  {(h as { action: string }).action}
                </p>
                <pre className="ind-muted overflow-x-auto text-xs">
                  {JSON.stringify((h as { changes: unknown }).changes, null, 1)}
                </pre>
              </IndustryRow>
            ))}
            {!history.length && <p className="ind-muted text-sm">Ingen historik ännu.</p>}
          </div>
        </DialogContent>
      </Dialog>

      <ScheduleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        storeId={storeId}
        legalEntityId={store?.legal_entity_id ?? null}
        anchor={anchor}
      />
    </IndustryFrame>
  );
}
