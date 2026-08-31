/**
 * Granskningsvy för löneunderlaget (etapp 5 C).
 *
 * Makrilltrade är master för enheter — timmar, OB-timmar, dagar och omfattning.
 * Kronorna i vyn är preliminära KPI-värden; Fortnox Lön avgör bruttolön, skatt
 * och utbetalning. Perioden kan inte markeras granskad medan felkön har poster.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ChevronRight, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
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
  usePayrollLines,
  usePayrollPeriods,
  useSetPeriodStatus,
  type ComputeIssue,
  type PayrollLine,
} from "@/hooks/usePayroll";

const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

const isObCode = (type: string) => /^OB\d$/.test(type);
const isAbsence = (type: string) => ["SJK", "SEM", "VAB", "KOM", "TJL", "FPE", "PEM", "ASK", "HAV", "NAR", "UTB"].includes(type);
const isAmountLine = (type: string) => type.startsWith("FORMAN") || type.startsWith("AVDRAG") || type.startsWith("ERSATTNING");

export default function PayrollReview() {
  const { data: entities = [] } = useLegalEntities();
  const { data: employees = [] } = useEmployees(true);
  const { data: stores = [] } = useStores(true);

  const [entityId, setEntityId] = useState<string>("");
  const [period, setPeriod] = useState(currentPeriod());
  const [issues, setIssues] = useState<ComputeIssue[]>([]);
  const [unlockedStores, setUnlockedStores] = useState<string[]>([]);
  const [openEmployee, setOpenEmployee] = useState<string | null>(null);

  const swedishEntities = entities.filter((e) => e.country === "SE");
  const activeEntity = entityId || swedishEntities[0]?.legal_entity_id || "";

  const periods = usePayrollPeriods(activeEntity || null);
  const periodRow = (periods.data ?? []).find((p) => p.period === period) ?? null;
  const lines = usePayrollLines(periodRow?.id ?? null);
  const compute = useComputePayroll();
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
      else if (isAbsence(line.line_type)) absenceDays += qty;
      else if (isAmountLine(line.line_type)) benefitAmount += Number(line.unit_amount ?? 0) * qty;
      cost += Number(line.preliminary_cost ?? 0);
    });
    return { workHours, extraHours, absenceDays, benefitAmount, cost, obPerLevel };
  }, [rows]);

  const byEmployee = useMemo(() => {
    const map = new Map<string, PayrollLine[]>();
    rows.forEach((line) => {
      if (!map.has(line.employee_id)) map.set(line.employee_id, []);
      map.get(line.employee_id)!.push(line);
    });
    return [...map.entries()].sort((a, b) =>
      (employeeName.get(a[0]) ?? a[0]).localeCompare(employeeName.get(b[0]) ?? b[0], "sv"),
    );
  }, [rows, employeeName]);

  const blockingIssues = issues.filter((i) => i.kind !== "wellness_over_limit");
  const canReview = periodRow && rows.length > 0 && blockingIssues.length === 0 && unlockedStores.length === 0;

  const runCompute = async (force = false) => {
    if (!activeEntity) return;
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
            <StatusLabel tone={periodRow?.status === "reviewed" || periodRow?.status === "exported" ? "ok" : periodRow ? "progress" : "neutral"}>
              {periodRow ? PERIOD_STATUS_LABEL[periodRow.status] : "Ej beräknad"}
            </StatusLabel>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <DecisionMetric label="Personer" value={byEmployee.length} />
        <DecisionMetric label="Arbetad tid" value={`${dec.format(summary.workHours)} h`} />
        <DecisionMetric label="Mer-/övertid" value={`${dec.format(summary.extraHours)} h`} />
        <DecisionMetric label="Frånvarodagar" value={dec.format(summary.absenceDays)} />
        <DecisionMetric label="Förmåner/avdrag" value={`${money.format(summary.benefitAmount)} kr`} />
        <DecisionMetric label="Preliminär kostnad" value={`${money.format(summary.cost)} kr`} tone="progress" />
      </div>

      {summary.obPerLevel.size > 0 && (
        <div className="mt-3 flex flex-wrap gap-4">
          {[...summary.obPerLevel.entries()].sort().map(([code, hours]) => (
            <span key={code} className="ind-muted text-sm">
              {code}: <span className="ind-mono">{dec.format(hours)} h</span>
            </span>
          ))}
        </div>
      )}

      {(blockingIssues.length > 0 || unlockedStores.length > 0 || issues.length > 0) && (
        <SideQueue className="mt-6">
          <SectionLabel className="mb-2">Felkö ({issues.length + unlockedStores.length})</SectionLabel>
          {unlockedStores.map((storeId) => (
            <QueueItem key={storeId}>
              <ShieldAlert className="h-4 w-4" />
              <span>Perioden är inte låst för {storeName.get(storeId) ?? storeId}</span>
            </QueueItem>
          ))}
          {issues.map((issue, index) => (
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
        <SectionLabel className="mb-2">Per person ({byEmployee.length})</SectionLabel>
        {lines.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin ind-muted" />
        ) : byEmployee.length === 0 ? (
          <p className="ind-muted text-sm">Inget löneunderlag för perioden ännu. Beräkna perioden när enheterna är låsta.</p>
        ) : (
          byEmployee.map(([employeeId, employeeLines]) => {
            const open = openEmployee === employeeId;
            const hours = employeeLines
              .filter((l) => l.line_type === "ARB" || l.line_type === "TID" || isObCode(l.line_type) || l.line_type === "MER" || l.line_type.startsWith("OT"))
              .reduce((sum, l) => sum + Number(l.quantity ?? 0), 0);
            const cost = employeeLines.reduce((sum, l) => sum + Number(l.preliminary_cost ?? 0), 0);
            return (
              <div key={employeeId}>
                <IndustryRow edge={open ? "accent" : "neutral"} className="flex-wrap">
                  <IndustryButton variant="ghost" onClick={() => setOpenEmployee(open ? null : employeeId)}>
                    {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </IndustryButton>
                  <span className="min-w-[200px]">{employeeName.get(employeeId) ?? employeeId}</span>
                  <span className="ind-mono">{dec.format(hours)} h</span>
                  <span className="ind-muted ind-mono text-sm">{employeeLines.length} rader</span>
                  <span className="ml-auto ind-mono">{money.format(cost)} kr preliminärt</span>
                </IndustryRow>
                {open && (
                  <div className="mb-4 overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th>Rad</th>
                          <th>Antal</th>
                          <th>Omfattning</th>
                          <th>Belopp</th>
                          <th>Kostnadsställe</th>
                          <th>Enhet</th>
                          <th>Anteckning</th>
                          <th>Export</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeeLines
                          .slice()
                          .sort((a, b) => a.line_date.localeCompare(b.line_date) || a.line_type.localeCompare(b.line_type))
                          .map((line) => (
                            <tr key={line.id}>
                              <td className="ind-mono">{line.line_date}</td>
                              <td>{line.line_type}</td>
                              <td className="ind-mono">{dec.format(Number(line.quantity ?? 0))}</td>
                              <td className="ind-mono">{line.extent_pct !== null ? `${line.extent_pct} %` : "–"}</td>
                              <td className="ind-mono">{line.unit_amount !== null ? `${money.format(Number(line.unit_amount))} kr` : "–"}</td>
                              <td className="ind-mono">{line.cost_center ?? "–"}</td>
                              <td>{line.store_id ? storeName.get(line.store_id) ?? "–" : "–"}</td>
                              <td>{line.note ?? ""}</td>
                              <td>{line.export_status}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <p className="ind-muted mt-6 text-xs">
        Preliminära kronor beräknas med timlön/månadslön, semesterlönereserv och arbetsgivaravgift enligt aktuella regler.
        De är underlag för granskning och KPI, aldrig för utbetalning.
      </p>
    </IndustryFrame>
  );
}
