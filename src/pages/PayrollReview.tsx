/**
 * Granskningsvy för löneunderlaget (etapp 5 C).
 *
 * Makrilltrade är master för enheter — timmar, OB-timmar, dagar och omfattning.
 * Kronorna i vyn är preliminära KPI-värden; Fortnox Lön avgör bruttolön, skatt
 * och utbetalning. Perioden kan inte markeras granskad medan felkön har poster.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileSpreadsheet, Loader2, RefreshCw, Send, ShieldAlert } from "lucide-react";
import {
  DecisionBar,
  DecisionMetric,
  IndustryButton,
  IndustryFrame,
  IndustryRow,
  QueueItem,
  SectionLabel,
  SideQueue,
  StatusLabel,
} from "@/components/industry";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import { useEmployees } from "@/hooks/useEmployees";
import { useStores } from "@/hooks/useStores";
import {
  ISSUE_LABEL,
  PERIOD_STATUS_LABEL,
  currentPeriod,
  useComputePayroll,
  useExportPayroll,
  usePayrollExportLog,
  usePayrollLines,
  usePayrollPeriods,
  useSetPeriodStatus,
  type ComputeIssue,
  type PayrollLine,
} from "@/hooks/usePayroll";
import { PayrollDayEditDialog } from "@/components/payroll/PayrollDayEditDialog";
import { DeviationParts, useDecideAttestationPart } from "@/components/payroll/DeviationParts";
import { asStampedDecision, partsOf, pendingParts, type PartDecisionRow, type PartsAttestation } from "@/lib/attestParts";
import { netPay } from "@/lib/netPay";
import { explainAttestation, type ExplainAttestation } from "@/lib/attestExplanation";
import { clockedHours, grossPay, obHours, unpaidAbsenceDeduction, workedHours } from "@/lib/payrollHours";
import { fixedSalaryForPeriod, hourlyBaseOn, hourlyRatesInPeriod, type DatedWage } from "../../supabase/functions/_shared/employmentWages";

const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

const isObCode = (type: string) => /^OB\d$/.test(type);
const isAbsence = (type: string) => ["SJK", "SEM", "VAB", "KOM", "TJL", "FPE", "PEM", "ASK", "HAV", "NAR", "UTB"].includes(type);
const isAmountLine = (type: string) => type.startsWith("FORMAN") || type.startsWith("AVDRAG") || type.startsWith("ERSATTNING");
const obPct = (line: PayrollLine) => Number(line.note?.match(/OB (\d+) %/)?.[1] ?? 0);

export default function PayrollReview() {
  const { data: entities = [] } = useLegalEntities();
  const { data: employees = [] } = useEmployees(true);
  const { data: stores = [] } = useStores(true);

  const [entityId, setEntityId] = useState<string>("");
  const [period, setPeriod] = useState(currentPeriod());
  const [issues, setIssues] = useState<ComputeIssue[]>([]);
  const [unlockedStores, setUnlockedStores] = useState<string[]>([]);
  const [openEmployee, setOpenEmployee] = useState<string | null>(null);
  const [editDay, setEditDay] = useState<{ employeeId: string; date: string } | null>(null);

  const swedishEntities = entities.filter((e) => e.country === "SE");
  const activeEntity = entityId || swedishEntities[0]?.legal_entity_id || "";

  const periods = usePayrollPeriods(activeEntity || null);
  const periodRow = (periods.data ?? []).find((p) => p.period === period) ?? null;
  const lines = usePayrollLines(periodRow?.id ?? null);
  const exportLog = usePayrollExportLog(periodRow?.id ?? null);
  const compute = useComputePayroll();
  const exportPayroll = useExportPayroll();
  const setStatus = useSetPeriodStatus();

  const employeeName = useMemo(
    () => new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees],
  );
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const rows = lines.data ?? [];
  const summary = useMemo(() => {
    const obPerLevel = new Map<string, number>();
    let workHours = 0;
    let extraHours = 0;
    let absenceDays = 0;
    let benefitAmount = 0;
    let cost = 0;
    rows.forEach((line) => {
      const qty = Number(line.quantity ?? 0);
      if (line.line_type === "ARB" || line.line_type === "TID") workHours += qty;
      else if (isObCode(line.line_type)) obPerLevel.set(line.line_type, (obPerLevel.get(line.line_type) ?? 0) + qty);
      else if (line.line_type === "MER" || line.line_type.startsWith("OT")) extraHours += qty;
      // Frånvarorader är i timmar, en rad per dag — dagarna räknas som antal rader.
      else if (isAbsence(line.line_type)) absenceDays += 1;
      else if (isAmountLine(line.line_type)) benefitAmount += Number(line.unit_amount ?? 0) * qty;
      cost += Number(line.preliminary_cost ?? 0);
    });
    return { workHours, extraHours, absenceDays, benefitAmount, cost, obPerLevel };
  }, [rows]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, PayrollLine[]>();
    rows.forEach((line) => {
      const employeeLines = map.get(line.employee_id);
      if (employeeLines) employeeLines.push(line);
      else map.set(line.employee_id, [line]);
    });
    return [...map.entries()].sort((a, b) =>
      (employeeName.get(a[0]) ?? a[0]).localeCompare(employeeName.get(b[0]) ?? b[0], "sv"),
    );
  }, [rows, employeeName]);

  // Stämplad tid för månadsavlönade i löneperioden (16:e–15:e) — för att se avvikelser.
  const periodRange = useMemo(() => {
    const [y, m] = period.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 2, 16)).toISOString().slice(0, 10);
    return { from: start, to: `${period}-15` };
  }, [period]);
  // Lönebyten per datum (t.ex. månadslön → timlön mitt i perioden), samma som löneberäkningen.
  const wagesQuery = useQuery({
    queryKey: ["payroll-review-wages", activeEntity],
    enabled: !!activeEntity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employment_wages")
        .select("employment_id, first_day, pay_type, monthly_salary, hourly_rate, employments!inner(employee_id, legal_entity_id, is_active)")
        .eq("employments.legal_entity_id", activeEntity);
      if (error) throw error;
      return data ?? [];
    },
  });
  const wagesByEmployment = useMemo(() => {
    const map = new Map<string, DatedWage[]>();
    for (const w of wagesQuery.data ?? []) {
      const list = map.get(w.employment_id);
      if (list) list.push(w);
      else map.set(w.employment_id, [w]);
    }
    return map;
  }, [wagesQuery.data]);
  // Fast månadslön ligger på anställningen och betalas av Fortnox Lön — visas här som kontroll.
  // Vid lönebyte i perioden räknas månadslönen bara för dagarna den gäller.
  const fixedQuery = useQuery({
    queryKey: ["payroll-fixed-salaries", activeEntity],
    enabled: !!activeEntity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employments")
        .select("id, employee_id, pay_type, monthly_salary, hourly_rate")
        .eq("legal_entity_id", activeEntity)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const fixedSalary = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of fixedQuery.data ?? []) {
      const amount = fixedSalaryForPeriod(r, wagesByEmployment.get(r.id), periodRange.from, periodRange.to);
      if (amount > 0) map.set(r.employee_id, (map.get(r.employee_id) ?? 0) + amount);
    }
    return map;
  }, [fixedQuery.data, wagesByEmployment, periodRange]);
  const fixedTotal = [...fixedSalary.values()].reduce((s, v) => s + v, 0);
  const employmentsQuery = useQuery({
    queryKey: ["payroll-review-employments", activeEntity],
    enabled: !!activeEntity,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employments")
        .select("id, employee_id, employment_number, pay_type, is_active, hourly_rate, monthly_salary, tax_table, tax_column, tax_adjustment, tax_type")
        .eq("legal_entity_id", activeEntity);
      if (error) throw error;
      return data ?? [];
    },
  });
  const employmentOf = useMemo(() => {
    const map = new Map<string, { number: string; payType: string; hourlyBase: (date: string) => number; taxTable: string | null; taxColumn: number | null; taxAdjustment: number | null; taxType: string | null }>();
    for (const r of employmentsQuery.data ?? []) {
      if (map.has(r.employee_id) && !r.is_active) continue;
      // Samma timbas som löneberäkningen: timlön, eller månadslön / 165 — den lön som gällde dagen.
      const wages = wagesByEmployment.get(r.id);
      const hourlyBase = (date: string) => hourlyBaseOn(r, wages, date || periodRange.to);
      map.set(r.employee_id, { number: r.employment_number ?? "", payType: r.pay_type ?? "", hourlyBase, taxTable: r.tax_table != null ? String(r.tax_table) : null, taxColumn: r.tax_column != null ? Number(r.tax_column) : null, taxAdjustment: r.tax_adjustment != null ? Number(r.tax_adjustment) : null, taxType: r.tax_type ?? null });
    }
    return map;
  }, [employmentsQuery.data, wagesByEmployment, periodRange]);
  /** Brutto och ungefärligt netto per person — samma brutto som visas på raden. */
  const payOf = (employeeId: string, employeeLines: PayrollLine[]) => {
    const emp = employmentOf.get(employeeId);
    const gross = (fixedSalary.get(employeeId) ?? 0) + grossPay(employeeLines, emp?.hourlyBase ?? 0);
    return { gross, net: netPay(gross, emp?.taxTable, emp?.taxColumn, emp?.taxAdjustment, emp?.taxType) };
  };
  // In- och utstämpling visas för alla i perioden (månads- och timavlönade).
  const clockIds = useMemo(
    () => [...new Set([...fixedSalary.keys(), ...byEmployee.map(([id]) => id)])].sort(),
    [fixedSalary, byEmployee],
  );
  const clockedQuery = useQuery({
    queryKey: ["payroll-clocked", clockIds.join(","), periodRange.from, periodRange.to],
    enabled: clockIds.length > 0,
    queryFn: async () => {
      type Row = {
        id: string; employee_id: string; date: string; store_id: string | null; approved_minutes: number | null; computed: unknown;
        status: string; basis: string | null; part_decisions: unknown; decided_at: string | null; decided_by: string | null;
      };
      const all: Row[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("attestations")
          .select("id, employee_id, date, store_id, approved_minutes, computed, status, basis, part_decisions, decided_at, decided_by")
          .in("employee_id", clockIds)
          .gte("date", periodRange.from)
          .lte("date", periodRange.to)
          .order("date")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
  });
  const clockedByEmployee = useMemo(() => {
    const map = new Map<string, { date: string; minutes: number; first_in?: string | null; last_out?: string | null; store_id: string | null }[]>();
    for (const r of clockedQuery.data ?? []) {
      const c = (r.computed ?? {}) as { clocked_minutes?: number; first_in?: string | null; last_out?: string | null };
      const minutes = Number(r.approved_minutes ?? c.clocked_minutes ?? 0);
      if (minutes <= 0 && !c.first_in) continue;
      const list = map.get(r.employee_id) ?? [];
      list.push({ date: r.date, minutes, first_in: c.first_in, last_out: c.last_out, store_id: r.store_id });
      map.set(r.employee_id, list);
    }
    return map;
  }, [clockedQuery.data]);
  // Attestrader per person och dag, för stämplad tid och förklaringen av beslutet.
  const attestByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof clockedQuery.data>>();
    for (const r of clockedQuery.data ?? []) {
      const key = `${r.employee_id}|${r.date}`;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return map;
  }, [clockedQuery.data]);
  // Kontona som fattat besluten (dagsbeslut och beslut per avvikelse).
  const deciderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of clockedQuery.data ?? []) {
      if (r.decided_by) ids.add(r.decided_by);
      for (const d of Object.values((r.part_decisions ?? {}) as Record<string, PartDecisionRow>)) if (d?.by) ids.add(d.by);
    }
    return [...ids].sort();
  }, [clockedQuery.data]);
  const decidersQuery = useQuery({
    queryKey: ["payroll-deciders", deciderIds.join(",")],
    enabled: deciderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("user_id, first_name, last_name, email").in("user_id", deciderIds);
      if (error) throw error;
      return (data ?? []) as { user_id: string; first_name: string | null; last_name: string | null; email: string | null }[];
    },
  });
  const accountOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of decidersQuery.data ?? []) {
      const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
      map.set(s.user_id, name && s.email ? `${name} (${s.email})` : name || s.email || "");
    }
    return (id: string) => map.get(id) || null;
  }, [decidersQuery.data]);
  /** Arbetad (stämplad, efter rast) och betald tid för dagen plus klartext om attesten. */
  const dayExplanation = (employeeId: string, date: string, storeId: string | null, paidHours: number | null) => {
    // Samma val som lönen: ej avslagen rad före avslagen, sedan flest godkända minuter.
    const rank = (x: { status: string; approved_minutes: number | null }) =>
      (x.status === "rejected" ? 0 : 1) * 100000 + Number(x.approved_minutes ?? 0);
    const rows = [...(attestByDay.get(`${employeeId}|${date}`) ?? [])].sort((x, y) => rank(y) - rank(x));
    const r = rows.find((x) => x.status !== "rejected" && (!storeId || x.store_id === storeId)) ?? rows[0];
    if (!r) return null;
    const c = (r.computed ?? {}) as { clocked_minutes?: number };
    const worked = Number(c.clocked_minutes ?? 0) / 60;
    const paid = paidHours ?? Number(r.approved_minutes ?? 0) / 60;
    const a: ExplainAttestation = {
      id: r.id,
      status: r.status,
      basis: r.basis,
      computed: r.computed as ExplainAttestation["computed"],
      part_decisions: (r.part_decisions ?? {}) as Record<string, PartDecisionRow>,
      approved_minutes: r.approved_minutes,
      decided_at: r.decided_at,
      decided_by: r.decided_by,
    };
    return (
      <span className="mt-1 block w-full text-sm">
        <span className="ind-mono block">
          Arbetat totalt {dec.format(worked)} h · Betalt {dec.format(paid)} h
        </span>
        <span className="block text-muted-foreground">{explainAttestation(a, accountOf)}</span>
      </span>
    );
  };
  // Avvikelser mot schemat per person: dagar som har delar utanför schemat.
  const deviationsByEmployee = useMemo(() => {
    const map = new Map<string, (PartsAttestation & { date: string; store_id: string | null; first_in?: string | null; last_out?: string | null })[]>();
    for (const r of clockedQuery.data ?? []) {
      const a: PartsAttestation = {
        id: r.id,
        status: r.status,
        basis: r.basis,
        computed: r.computed as PartsAttestation["computed"],
        part_decisions: (r.part_decisions ?? {}) as Record<string, PartDecisionRow>,
      };
      if (partsOf(a).length === 0) continue;
      const c = (r.computed ?? {}) as { first_in?: string | null; last_out?: string | null };
      const list = map.get(r.employee_id) ?? [];
      list.push({ ...a, date: r.date, store_id: r.store_id, first_in: c.first_in, last_out: c.last_out });
      map.set(r.employee_id, list);
    }
    return map;
  }, [clockedQuery.data]);
  const pendingOf = (employeeId: string) =>
    (deviationsByEmployee.get(employeeId) ?? []).reduce((n, a) => n + pendingParts(a).length, 0);
  const pendingTotal = useMemo(
    () => [...deviationsByEmployee.values()].flat().reduce((n, a) => n + pendingParts(a).length, 0),
    [deviationsByEmployee],
  );
  const decidePart = useDecideAttestationPart();
  const [bulkFor, setBulkFor] = useState<string | null>(null);
  /** Attesterar alla väntande avvikelser för en person som stämplat: extra tid godkänd, kortare tid som stämplad. */
  const attestAllAsStamped = async (employeeId: string) => {
    const days = deviationsByEmployee.get(employeeId) ?? [];
    setBulkFor(employeeId);
    let done = 0;
    try {
      for (const a of days) {
        for (const p of pendingParts(a)) {
          await decidePart.mutateAsync({ id: a.id, part: p.kind, decision: asStampedDecision(p.kind) });
          done += 1;
        }
      }
      toast.success(`${done} avvikelser attesterade som stämplat. Tryck Beräkna period för att uppdatera lönen.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte attestera alla");
    } finally {
      setBulkFor(null);
    }
  };

  // Stämplingar per person och dag, för att visa in/ut på timavlönades rader.
  const clockedByDay = useMemo(() => {
    const map = new Map<string, { minutes: number; first_in?: string | null; last_out?: string | null; store_id: string | null }[]>();
    for (const [employeeId, days] of clockedByEmployee) {
      for (const d of days) {
        const key = `${employeeId}|${d.date}`;
        const list = map.get(key) ?? [];
        list.push(d);
        map.set(key, list);
      }
    }
    return map;
  }, [clockedByEmployee]);
  // Schemalagda (publicerade) pass i perioden, för att jämföra mot faktisk stämpling.
  const shiftsQuery = useQuery({
    queryKey: ["payroll-shifts", clockIds.join(","), periodRange.from, periodRange.to],
    enabled: clockIds.length > 0,
    queryFn: async () => {
      type Row = { employee_id: string; date: string; store_id: string | null; start_time: string; end_time: string };
      const all: Row[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("shifts")
          .select("employee_id, date, store_id, start_time, end_time")
          .in("employee_id", clockIds)
          .eq("status", "published")
          .gte("date", periodRange.from)
          .lte("date", periodRange.to)
          .order("date")
          .order("start_time")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Row[]));
        if (!data || data.length < pageSize) break;
      }
      return all;
    },
  });
  const shiftsByDay = useMemo(() => {
    const map = new Map<string, { start: string; end: string; store_id: string | null }[]>();
    for (const r of shiftsQuery.data ?? []) {
      const key = `${r.employee_id}|${r.date}`;
      const list = map.get(key) ?? [];
      list.push({ start: r.start_time.slice(0, 5), end: r.end_time.slice(0, 5), store_id: r.store_id });
      map.set(key, list);
    }
    return map;
  }, [shiftsQuery.data]);
  const scheduleText = (employeeId: string, date: string) => {
    const list = shiftsByDay.get(`${employeeId}|${date}`) ?? [];
    return list.length ? list.map((x) => `${x.start}–${x.end}`).join(", ") : "ej schemalagd";
  };
  const clockTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "–";
  // Månadsavlönade utan avvikelser har inga rader men ska ändå synas i listan.
  const people = useMemo(() => {
    const ids = new Set(byEmployee.map(([id]) => id));
    const extra = [...fixedSalary.keys()].filter((id) => !ids.has(id)).map((id) => [id, [] as PayrollLine[]] as [string, PayrollLine[]]);
    return [...byEmployee, ...extra].sort((a, b) =>
      (employeeName.get(a[0]) ?? a[0]).localeCompare(employeeName.get(b[0]) ?? b[0], "sv"),
    );
  }, [byEmployee, fixedSalary, employeeName]);

  /** Kostnad för bolag per person: lönerader (redan inkl. personens arbetsgivaravgift) + fast månadslön med semesteravsättning och samma avgift. */
  const costOfPerson = (employeeId: string, employeeLines: PayrollLine[]) => {
    const rate = Number(employeeLines.find((l) => l.contribution_rate != null)?.contribution_rate ?? 31.42) / 100;
    const wageCost = employeeLines.filter((l) => l.source_type === "attestation").reduce((t, l) => t + Number(l.preliminary_cost ?? 0), 0);
    const otherCost = employeeLines.filter((l) => l.source_type !== "attestation").reduce((t, l) => t + Number(l.preliminary_cost ?? 0), 0);
    const fixedAfterUnpaid = Math.max(0, (fixedSalary.get(employeeId) ?? 0) + unpaidAbsenceDeduction(employeeLines));
    const payWithVacation = wageCost / (1 + rate) + fixedAfterUnpaid * 1.008;
    const contribution = payWithVacation * rate;
    return { cost: payWithVacation + contribution + otherCost, contribution, vacation: payWithVacation - payWithVacation / 1.008, rate };
  };
  const costTotals = people.reduce(
    (acc, [id, l]) => {
      const c = costOfPerson(id, l);
      return { cost: acc.cost + c.cost, contribution: acc.contribution + c.contribution, vacation: acc.vacation + c.vacation, gross: acc.gross + payOf(id, l).gross };
    },
    { cost: 0, contribution: 0, vacation: 0, gross: 0 },
  );
  const netTotal = people.reduce(
    (acc, [id, l]) => {
      const n = payOf(id, l).net;
      return n === null ? acc : { sum: acc.sum + n, count: acc.count + 1 };
    },
    { sum: 0, count: 0 },
  );
  const blockingIssues = issues.filter((i) => i.kind !== "wellness_over_limit" && i.kind !== "pending_deviation");
  // Väntande avvikelser visas per person — i felkön bara som en summa.
  const listedIssues = issues.filter((i) => i.kind !== "pending_deviation");
  const canReview = periodRow && rows.length > 0 && blockingIssues.length === 0 && unlockedStores.length === 0;
  const canExport = canReview && periodRow && ["reviewed", "exported", "reexported"].includes(periodRow.status);

  const runCompute = async (force = false) => {
    if (!activeEntity) return;
    if (periodRow && ["exported", "reexported"].includes(periodRow.status)) {
      toast.error("Perioden är redan skickad till Fortnox. Öppna den för rättelse innan du beräknar igen.");
      return;
    }
    try {
      const result = await compute.mutateAsync({ legalEntityId: activeEntity, period, force });
      setIssues(result.issues ?? []);
      setUnlockedStores(result.unlocked_stores ?? []);
      toast.success(`Löneunderlaget beräknat — ${result.lines ?? 0} rader`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte beräkna löneunderlaget");
    }
  };

  const markReviewed = async () => {
    if (!periodRow) return;
    try {
      await setStatus.mutateAsync({ id: periodRow.id, status: "reviewed" });
      toast.success("Perioden är markerad som granskad");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte uppdatera perioden");
    }
  };

  const exportToFortnox = async () => {
    if (!activeEntity) return;
    try {
      const result = await exportPayroll.mutateAsync({ legalEntityId: activeEntity, period, mode: "fortnox" });
      if (result.failures?.length) toast.warning(`${result.sent ?? 0} rader skickades, ${result.failures.length} misslyckades`);
      else toast.success(`Löneunderlaget skickades — ${result.sent ?? 0} rader`);
    } catch (e) {
      const error = e as Error & { issues?: ComputeIssue[] };
      if (error.issues?.length) setIssues(error.issues);
      toast.error(error.message || "Kunde inte skicka löneunderlaget");
    }
  };

  const downloadPaxml = async () => {
    if (!activeEntity) return;
    try {
      const result = await exportPayroll.mutateAsync({ legalEntityId: activeEntity, period, mode: "paxml" });
      if (!result.xml) throw new Error("PAXml-filen kunde inte skapas");
      const blob = new Blob([result.xml], { type: "application/xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `makrilltrade-paxml-${period}.xml`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("PAXml 2.2 är klar för nedladdning");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte skapa PAXml-filen");
    }
  };

  // Excel för manuell inmatning i Fortnox Lön — samma rader som visas här, en rad per person.
  const downloadExcel = () => {
    if (people.length === 0) return;
    const pcts = [...new Set(rows.filter((l) => isObCode(l.line_type)).map(obPct).filter((p) => p > 0))].sort((a, b) => a - b);
    const data = people.map(([employeeId, employeeLines]) => {
      const sum = (pick: (l: PayrollLine) => boolean) =>
        Math.round(employeeLines.filter(pick).reduce((t, l) => t + Number(l.quantity ?? 0), 0) * 100) / 100;
      const worked = fixedSalary.has(employeeId)
        ? Math.round(clockedHours(clockedByEmployee.get(employeeId) ?? []) * 100) / 100
        : Math.round(workedHours(employeeLines) * 100) / 100;
      const row: Record<string, string | number> = {
        Anställningsnummer: employmentOf.get(employeeId)?.number ?? "",
        Namn: employeeName.get(employeeId) ?? employeeId,
        Avlöningsform: fixedSalary.has(employeeId) ? "Månadslön" : "Timlön",
        "Arbetade timmar": worked,
      };
      // Timlön som gäller i perioden — vid byte visas den senaste och från vilket datum.
      const empRows = (employmentsQuery.data ?? []).filter((r) => r.employee_id === employeeId);
      const empRow = empRows.find((r) => r.is_active) ?? empRows[0];
      const rates = empRow ? hourlyRatesInPeriod(empRow, wagesByEmployment.get(empRow.id), periodRange.from, periodRange.to) : [];
      const lastRate = rates[rates.length - 1];
      row["Timlön (kr/h)"] = lastRate ? lastRate.rate : "";
      row["Timlön gäller från"] = lastRate ? lastRate.from : "";
      for (const pct of pcts) row[`OB ${pct} %`] = sum((l) => isObCode(l.line_type) && obPct(l) === pct);
      row.Mertid = sum((l) => l.line_type === "MER");
      row.Frånvarodagar = employeeLines.filter((l) => isAbsence(l.line_type)).length;
      row.Frånvarotimmar = sum((l) => isAbsence(l.line_type));
      row["Fast månadslön (kr)"] = fixedSalary.get(employeeId) ?? 0;
      row["Avdrag obetald frånvaro (kr)"] = Math.round(unpaidAbsenceDeduction(employeeLines));
      const { gross, net } = payOf(employeeId, employeeLines);
      row["Brutto (kr)"] = Math.round(gross);
      row["Kostnad för bolag (kr)"] = Math.round(costOfPerson(employeeId, employeeLines).cost);
      row["Arbetsgivaravgift %"] = costOfPerson(employeeId, employeeLines).rate * 100;
      row["Utbetalt till konto ca (kr)"] = net ?? "Skattetabell saknas";
      return row;
    });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), "Löneunderlag");
    const entityName = swedishEntities.find((e) => e.legal_entity_id === activeEntity)?.legal_name ?? activeEntity;
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Bolag", entityName],
        ["Löneperiod", `${periodRange.from} – ${periodRange.to}`],
        ["Status", periodRow ? PERIOD_STATUS_LABEL[periodRow.status] : "Ej beräknad"],
        ["Antal personer", people.length],
        ["Skapad", new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })],
      ]),
      "Period",
    );
    XLSX.writeFile(book, `loneunderlag-${activeEntity}-${periodRange.from}_${periodRange.to}.xlsx`);
    toast.success("Excel-filen är nedladdad");
  };

  return (
    <IndustryFrame className="p-4 sm:p-6">
      <DecisionBar>
        <div className="mr-auto">
          <SectionLabel>Personal · löneunderlag</SectionLabel>
          <h1 className="ind-h1">Granskning av löneunderlag</h1>
          <p className="ind-muted text-sm">
            Enheter är master här. Kronor är preliminära — Fortnox Lön avgör bruttolön, skatt och utbetalning.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IndustryButton variant="secondary" size="touch" onClick={() => void runCompute(false)} disabled={!activeEntity || compute.isPending}>
            {compute.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Beräkna period
          </IndustryButton>
          <IndustryButton variant="primary" size="touch" onClick={() => void markReviewed()} disabled={!canReview || setStatus.isPending}>
            <CheckCircle2 className="h-4 w-4" /> Markera granskad
          </IndustryButton>
          <IndustryButton variant="primary" size="touch" onClick={() => void exportToFortnox()} disabled={!canExport || exportPayroll.isPending}>
            {exportPayroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Skicka till Fortnox
          </IndustryButton>
          <IndustryButton variant="secondary" size="touch" onClick={() => void downloadPaxml()} disabled={!canExport || exportPayroll.isPending}>
            <Download className="h-4 w-4" /> PAXml 2.2
          </IndustryButton>
          <IndustryButton variant="secondary" size="touch" onClick={downloadExcel} disabled={people.length === 0}>
            <FileSpreadsheet className="h-4 w-4" /> Excel
          </IndustryButton>
        </div>
      </DecisionBar>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Bolag</Label>
          <Select value={activeEntity} onValueChange={setEntityId}>
            <SelectTrigger className="w-[260px]"><SelectValue placeholder="Välj bolag" /></SelectTrigger>
            <SelectContent>
              {swedishEntities.map((e) => (
                <SelectItem key={e.legal_entity_id} value={e.legal_entity_id}>{e.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Period</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-[170px]" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <div className="pt-1.5">
            <StatusLabel tone={periodRow?.status === "reviewed" || periodRow?.status === "exported" || periodRow?.status === "reexported" ? "ok" : periodRow ? "progress" : "neutral"}>
              {periodRow ? PERIOD_STATUS_LABEL[periodRow.status] : "Ej beräknad"}
            </StatusLabel>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <DecisionMetric label="Personer" value={people.length} />
        <DecisionMetric label="Avvikelser att attestera" value={pendingTotal} tone={pendingTotal > 0 ? "alert" : "ok"} />
        <DecisionMetric label="Arbetad tid" value={`${dec.format(summary.workHours)} h`} />
        <DecisionMetric label="Mer-/övertid" value={`${dec.format(summary.extraHours)} h`} />
        <DecisionMetric label="Frånvarodagar" value={dec.format(summary.absenceDays)} />
        <DecisionMetric label="Förmåner/avdrag" value={`${money.format(summary.benefitAmount)} kr`} />
        <DecisionMetric label="Fasta månadslöner" value={`${money.format(fixedTotal)} kr`} />
        <DecisionMetric label="Brutto (lön 25:e, före skatt)" value={`${money.format(costTotals.gross)} kr`} tone="progress" />
        <DecisionMetric label={`Utbetalt till konto ca (${netTotal.count} av ${people.length} med skattetabell)`} value={`${money.format(netTotal.sum)} kr`} />
        <DecisionMetric label="Semesteravsättning 0,8 % (separat, betalas inte ut nu)" value={`${money.format(costTotals.vacation)} kr`} />
        <DecisionMetric label="Arbetsgivaravgift (per person efter ålder)" value={`${money.format(costTotals.contribution)} kr`} />
        <DecisionMetric label="Kostnad för bolag" value={`${money.format(costTotals.cost)} kr`} />
      </div>
      <p className="ind-muted mt-2 text-sm">
        Från kontot den 25:e går nettolönen till de anställda. Skatteavdraget och arbetsgivaravgiften betalas till Skatteverket den 12:e månaden efter. Den exakta nettolönen räknas i Fortnox Lön.
      </p>

      {summary.obPerLevel.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-4">
          {[...summary.obPerLevel.entries()].sort().map(([code, hours]) => (
            <span key={code} className="ind-muted text-sm">
              {code}: <span className="ind-mono">{dec.format(hours)} h</span>
            </span>
          ))}
        </div>
      )}

      {pendingTotal > 0 && (
        <p className="mt-3 text-sm">
          <StatusLabel tone="alert">{pendingTotal} avvikelser väntar på attest</StatusLabel>{" "}
          Tid utanför schemat betalas först när den är godkänd. Öppna personen för att attestera varje avvikelse.
        </p>
      )}

      {(blockingIssues.length > 0 || unlockedStores.length > 0 || listedIssues.length > 0) && (
        <SideQueue label={`Felkö (${listedIssues.length + unlockedStores.length})`} className="mt-6">
          <SectionLabel className="mb-2">Felkö ({listedIssues.length + unlockedStores.length})</SectionLabel>
          {unlockedStores.map((storeId) => (
            <QueueItem key={storeId}>
              <ShieldAlert className="h-4 w-4" />
              <span>Perioden är inte låst för {storeName.get(storeId) ?? storeId}</span>
            </QueueItem>
          ))}
          {listedIssues.map((issue, index) => (
            <QueueItem key={`${issue.kind}-${index}`}>
              <ShieldAlert className="h-4 w-4" />
              <span>
                {ISSUE_LABEL[issue.kind] ?? issue.kind}
                {issue.employee_id ? ` · ${employeeName.get(issue.employee_id) ?? issue.employee_id}` : ""} · {issue.detail}
              </span>
            </QueueItem>
          ))}
        </SideQueue>
      )}

      <section className="mt-8">
        <SectionLabel className="mb-2">Per person ({people.length})</SectionLabel>
        {lines.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin ind-muted" />
        ) : people.length === 0 ? (
          <p className="ind-muted text-sm">Inget löneunderlag för perioden ännu. Beräkna perioden när enheterna är låsta.</p>
        ) : (
          people.map(([employeeId, employeeLines]) => {
            const open = openEmployee === employeeId;
            const hours = workedHours(employeeLines);
            const obTotal = obHours(employeeLines);
            return (
              <div key={employeeId}>
                <IndustryRow edge={open ? "accent" : "neutral"} className="flex-wrap">
                  <IndustryButton variant="ghost" onClick={() => setOpenEmployee(open ? null : employeeId)}>
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </IndustryButton>
                  <span className="min-w-[200px]">{employeeName.get(employeeId) ?? employeeId}</span>
                  {(() => {
                    // Månadsavlönade: stämplad tid (dubbletter räknas en gång). Timavlönade: ARB-raderna.
                    const clocked = clockedByEmployee.get(employeeId) ?? [];
                    const isMonthly = fixedSalary.has(employeeId);
                    const h = isMonthly ? clockedHours(clocked) : hours;
                    const n = isMonthly && employeeLines.length === 0 ? clocked.length : employeeLines.length;
                    return (
                      <>
                        <span className="ind-mono">{dec.format(h)} h arbetad tid</span>
                        {obTotal > 0 && <span className="ind-muted ind-mono text-sm">varav OB {dec.format(obTotal)} h</span>}
                        <span className="ind-muted ind-mono text-sm">{n} rader</span>
                      </>
                    );
                  })()}
                  {pendingOf(employeeId) > 0 && (
                    <StatusLabel tone="alert">{pendingOf(employeeId)} att attestera</StatusLabel>
                  )}
                  <IndustryButton variant="ghost" className="h-9" onClick={() => setEditDay({ employeeId, date: periodRange.from })}>
                    Redigera period
                  </IndustryButton>
                  {(() => {
                    const fixed = fixedSalary.get(employeeId) ?? 0;
                    const { gross, net } = payOf(employeeId, employeeLines);
                    const totalCost = costOfPerson(employeeId, employeeLines).cost;
                    return (
                      <span className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-4 text-sm sm:w-auto">
                        <span>Brutto</span>
                        <span className="ind-mono text-right">{money.format(gross)} kr</span>
                        <span>Kostnad för bolag</span>
                        <span className="ind-mono text-right">{money.format(totalCost)} kr</span>
                        <span>Utbetalt till konto</span>
                        <span className="ind-mono text-right">{net !== null ? `ca ${money.format(net)} kr` : "Skattetabell saknas"}</span>
                        {fixed ? (
                          <span className="ind-mono col-span-2 text-right text-xs text-muted-foreground">varav fast månadslön {money.format(fixed)} kr</span>
                        ) : null}
                        {unpaidAbsenceDeduction(employeeLines) < 0 ? (
                          <span className="ind-mono col-span-2 text-right text-xs text-muted-foreground">
                            avdrag obetald frånvaro {money.format(unpaidAbsenceDeduction(employeeLines))} kr
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                </IndustryRow>
                {open && (deviationsByEmployee.get(employeeId) ?? []).length > 0 && (
                  <div className="mb-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <SectionLabel>Avvikelser mot schemat</SectionLabel>
                      {pendingOf(employeeId) > 0 && (
                        <IndustryButton
                          variant="secondary"
                          className="h-11"
                          disabled={bulkFor !== null || decidePart.isPending}
                          onClick={() => void attestAllAsStamped(employeeId)}
                        >
                          {bulkFor === employeeId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Attestera alla som stämplat ({pendingOf(employeeId)})
                        </IndustryButton>
                      )}
                    </div>
                    <p className="ind-muted text-xs">
                      Tid inom schemat är redan godkänd. Extra tid före eller efter schemat betalas bara om du godkänner den. Kom in senare eller gick tidigare: välj stämplad tid eller schematid. Tryck Beräkna period när du är klar.
                    </p>
                    <ul className="space-y-2">
                      {(deviationsByEmployee.get(employeeId) ?? []).map((a) => (
                        <li key={a.id} className="rounded-md border border-border px-3 py-2">
                          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-sm">
                            <span className="ind-mono w-24 shrink-0">
                              {new Date(`${a.date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            <span className="ind-mono order-last w-full text-muted-foreground sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
                              Schema {scheduleText(employeeId, a.date)} · In {clockTime(a.first_in)} · Ut {a.last_out ? clockTime(a.last_out) : "ej utstämplad"}
                            </span>
                            <span className="text-muted-foreground">{storeName.get(a.store_id ?? "") ?? ""}</span>
                          </div>
                          {dayExplanation(employeeId, a.date, a.store_id, null)}
                          <DeviationParts attestation={a} onEdit={() => setEditDay({ employeeId, date: a.date })} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {open && fixedSalary.has(employeeId) && (
                  <div className="mb-3 space-y-1">
                    <SectionLabel>Schema och stämpling {periodRange.from} – {periodRange.to}</SectionLabel>
                    {(clockedByEmployee.get(employeeId) ?? []).length === 0 ? (
                      <p className="ind-muted text-sm">Inga stämplingar i perioden.</p>
                    ) : (
                      <ul className="mt-1 divide-y divide-border rounded-md border border-border">
                        {(clockedByEmployee.get(employeeId) ?? []).map((d) => (
                          <li key={`${d.date}-${d.store_id}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-1.5 text-sm">
                            <span className="ind-mono w-24 shrink-0">
                              {new Date(`${d.date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            <span className="ind-mono min-w-[16rem] flex-1 text-muted-foreground">
                              <span className="block">Schema {scheduleText(employeeId, d.date)}</span>
                              <span className="block text-foreground">
                                In {clockTime(d.first_in)} · Ut {d.last_out ? clockTime(d.last_out) : "ej utstämplad"}
                              </span>
                            </span>
                            <span className="ind-mono w-16 text-right">
                              {dec.format(d.minutes / 60)} h{d.minutes > 11 * 60 ? " ⚠" : ""}
                            </span>
                            <span className="w-40 text-muted-foreground">{storeName.get(d.store_id ?? "") ?? ""}</span>
                            <IndustryButton variant="ghost" className="h-9" onClick={() => setEditDay({ employeeId, date: d.date })}>Ändra</IndustryButton>
                            {dayExplanation(employeeId, d.date, d.store_id, d.minutes / 60)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {open && employeeLines.length > 0 && (
                  <ul className="mb-4 divide-y divide-border rounded-md border border-border">
                    {employeeLines
                      .slice()
                      .sort((a, b) => a.line_date.localeCompare(b.line_date) || a.line_type.localeCompare(b.line_type))
                      .map((line) => {
                        const label =
                          line.line_type === "ARB"
                            ? "Arbetad tid"
                            : line.line_type.startsWith("OB")
                              ? (line.note?.match(/OB \d+ %/)?.[0] ?? "OB-tillägg")
                              : line.line_type;
                        const isTimeLine = line.line_type === "ARB" || line.line_type === "TID";
                        const dayPunches = isTimeLine
                          ? (clockedByDay.get(`${employeeId}|${line.line_date}`) ?? []).filter(
                              (d) => d.first_in && (!line.store_id || !d.store_id || d.store_id === line.store_id),
                            )
                          : [];
                        const amount = line.preliminary_cost ?? (line.unit_amount !== null ? Number(line.unit_amount) * Number(line.quantity ?? 0) : null);
                        return (
                          <li key={line.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-3 py-1.5 text-sm">
                            <span className="ind-mono w-24 shrink-0">
                              {new Date(line.line_date + "T12:00:00").toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" })}
                            </span>
                            <span className="min-w-[7rem] flex-1">
                              {label}
                              {isTimeLine && (
                                <span className="ind-mono block text-muted-foreground">
                                  <span className="block">Schema {scheduleText(employeeId, line.line_date)}</span>
                                  <span className="block text-foreground">
                                    {dayPunches.length > 0
                                      ? dayPunches
                                          .map((d) => `In ${clockTime(d.first_in)} · Ut ${d.last_out ? clockTime(d.last_out) : "ej utstämplad"}`)
                                          .join(", ")
                                      : "Ingen stämpling"}
                                  </span>
                                </span>
                              )}
                            </span>
                            <span className="ind-mono w-16 text-right">{dec.format(Number(line.quantity ?? 0))} h</span>
                            {line.extent_pct !== null && <span className="ind-mono text-muted-foreground">{line.extent_pct} %</span>}
                            <span className="ind-mono w-24 text-right">{amount !== null ? `${money.format(Number(amount))} kr` : "–"}</span>
                            <span className="w-full text-xs text-muted-foreground sm:w-40 sm:text-sm">
                              {line.store_id ? storeName.get(line.store_id) ?? "" : ""}
                            </span>
                            <IndustryButton variant="ghost" className="h-9" onClick={() => setEditDay({ employeeId, date: line.line_date })}>Ändra</IndustryButton>
                            {isTimeLine ? dayExplanation(employeeId, line.line_date, line.store_id, Number(line.quantity ?? 0)) : null}
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </section>

      {exportLog.data && exportLog.data.length > 0 && (
        <section className="mt-8">
          <SectionLabel className="mb-2">Exportlogg</SectionLabel>
          <div className="space-y-1">
            {exportLog.data.slice(0, 8).map((log) => (
              <IndustryRow key={log.id} edge={log.status === "error" ? "alert" : "neutral"} className="flex-wrap text-sm">
                <StatusLabel tone={log.status === "sent" ? "ok" : log.status === "error" ? "alert" : "progress"}>{log.status}</StatusLabel>
                <span>{log.transaction_type}</span>
                <span className="ind-muted">{new Date(log.created_at).toLocaleString("sv-SE")}</span>
                {log.http_status && <span className="ind-mono">HTTP {log.http_status}</span>}
                {log.error_message && <span className="text-destructive">{log.error_message}</span>}
              </IndustryRow>
            ))}
          </div>
        </section>
      )}

      <p className="ind-muted mt-6 text-xs">
        Preliminära kronor beräknas med timlön/månadslön, semesterlönereserv och arbetsgivaravgift enligt aktuella regler.
        De är underlag för granskning och KPI, aldrig för utbetalning.
      </p>
      {editDay && (
        <PayrollDayEditDialog
          open
          onOpenChange={(o) => !o && setEditDay(null)}
          employeeId={editDay.employeeId}
          employeeName={employeeName.get(editDay.employeeId) ?? ""}
          date={editDay.date}
          minDate={periodRange.from}
          maxDate={periodRange.to}
          onSaved={() => undefined}
        />
      )}
    </IndustryFrame>
  );
}
