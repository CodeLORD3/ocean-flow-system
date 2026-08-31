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
  Sparkles,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import {
  DecisionBar,
  DecisionMetric,
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
  const { data: templates = [] } = useShiftTemplates(storeId || null);
  const { data: availability = [] } = useAvailability();
  const { data: competencies = [] } = useEmployeeCompetencies();
  const { data: attestations = [] } = useAttestations(storeId || null, week[0], week[6]);
  const { data: requests = [] } = useShiftRequests(shifts.map((s) => s.id));
  const { data: absenceRequests = [] } = useAbsenceRequests(undefined, storeId || null);
  const { data: absenceTypes = [] } = useAbsenceTypes();

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
  const pendingAbsenceRequests = absenceRequests.filter((request) => request.status === "pending");

  const storeEmployments = useMemo(
    () => employments.filter((e) => e.store_id === storeId && e.is_active),
    [employments, storeId],
  );
  const roster = useMemo(
    () =>
      storeEmployments
        .map((em) => {
          const emp = employees.find((e) => e.id === em.employee_id);
          return emp
            ? {
                employee_id: emp.id,
                name: `${emp.first_name} ${emp.last_name}`,
                birthDate: emp.birth_date,
                employmentRate: em.employment_rate ?? 1,
                employmentNumber: em.employment_number,
                competencies: competencies.filter((c) => c.employee_id === emp.id).map((c) => c.competency),
                availability: availability.filter((a) => a.employee_id === emp.id),
              }
            : null;
        })
        .filter(Boolean)
        .sort((a, b) => a!.name.localeCompare(b!.name, "sv")) as {
        employee_id: string;
        name: string;
        birthDate: string | null;
        employmentRate: number;
        employmentNumber: string | null;
        competencies: string[];
        availability: ReturnType<typeof useAvailability>["data"] extends (infer T)[] ? T[] : never;
      }[],
    [storeEmployments, employees, competencies, availability],
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
      requiredCompetency: shift.shift_type_id ? typeById.get(shift.shift_type_id)?.required_competency : null,
    });
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
    try {
      await saveShift.mutateAsync({ ...shift, employee_id: employeeId, date });
      toast.success("Passet flyttat");
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
      })),
      {
        requiredCompetency: suggestFor.shift_type_id
          ? typeById.get(suggestFor.shift_type_id)?.required_competency
          : null,
      },
    );
  }, [suggestFor, roster, shifts, typeById]);

  return (
    <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Schema</SectionLabel>
          <h1 className="ind-h1">Vecka {isoWeek(anchor)}</h1>
          <p className="ind-muted text-sm">
            {week[0]} – {week[6]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="ind-input w-56">
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
          <IndustryButton
            variant="ghost"
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
            variant="ghost"
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

      {!storeId ? (
        <IndustryRow edge="neutral">
          <p className="ind-muted text-sm">Välj en enhet för att planera veckan.</p>
        </IndustryRow>
      ) : (
        <>
          <DecisionBar>
            <DecisionMetric label="Planerat" value={formatMinutes(plannedMinutes)} />
            <DecisionMetric label="Utkast" value={draftCount} tone={draftCount ? "progress" : "ok"} />
            <DecisionMetric label="Öppna pass" value={openCount} tone={openCount ? "alert" : "ok"} />
            <div className="flex flex-wrap items-center gap-2">
              <IndustryButton
                variant="primary"
                corners
                disabled={!draftCount || publishWeek.isPending}
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
                Publicera vecka
              </IndustryButton>
              <IndustryButton
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
                <Plus className="h-4 w-4" /> Från mall
              </IndustryButton>
              <IndustryButton
                onClick={async () => {
                  try {
                    const n = await copyWeek.mutateAsync({
                      storeId,
                      fromAnchor: prevWeek,
                      toAnchor: anchor,
                      keepEmployees: true,
                    });
                    toast.success(n ? `${n} pass kopierade från förra veckan` : "Förra veckan är tom");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Kunde inte kopiera vecka");
                  }
                }}
              >
                Kopiera vecka
              </IndustryButton>
              <IndustryButton variant="ghost" onClick={copyAiPrompt}>
                <ClipboardCopy className="h-4 w-4" /> Kopiera AI-underlag
              </IndustryButton>
              <IndustryButton variant="ghost" onClick={() => downloadTemplate()}>
                <Download className="h-4 w-4" /> Mall
              </IndustryButton>
              <IndustryButton variant="ghost" onClick={exportCurrentWeek}>
                Exportera vecka
              </IndustryButton>
              <IndustryButton onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Importera schema
              </IndustryButton>
            </div>
          </DecisionBar>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[900px] border-separate border-spacing-y-1">
                <thead>
                  <tr>
                    <th className="w-44 text-left">
                      <SectionLabel>Person</SectionLabel>
                    </th>
                    {week.map((d, i) => (
                      <th key={d} className="text-left">
                        <SectionLabel>
                          {DAY_NAMES[i]} {d.slice(8)}
                        </SectionLabel>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[{ key: OPEN_ROW, name: "Öppna pass" }, ...roster.map((r) => ({ key: r.employee_id, name: r.name }))].map(
                    (row) => (
                      <tr key={row.key}>
                        <td className="align-top">
                          <IndustryRow edge={row.key === OPEN_ROW ? "alert" : "neutral"} className="h-full">
                            <span className="ind-strong text-sm">{row.name}</span>
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
                            <div className="space-y-1">
                              {shiftsAt(row.key, d).map((s) => {
                                const type = s.shift_type_id ? typeById.get(s.shift_type_id) : null;
                                const checks = checksFor(s);
                                const severity = worstSeverity(checks);
                                return (
                                  <div
                                    key={s.id}
                                    draggable
                                    onDragStart={() => setDragging(s)}
                                    onClick={() => setEditing(s)}
                                    title={checks.map((c) => `${c.label}: ${c.detail}`).join("\n") || undefined}
                                    className="ind-card cursor-pointer p-2"
                                    style={{
                                      borderLeft: `3px solid var(--color-${type?.color_token ?? "neutral-400"})`,
                                      opacity: s.status === "draft" ? 0.72 : 1,
                                    }}
                                  >
                                    <p className="ind-mono text-sm">
                                      {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                                    </p>
                                    <div className="flex items-center gap-1">
                                      <span className="ind-muted text-xs">{type?.name ?? "Pass"}</span>
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
                                className="ind-btn ind-btn--ghost w-full justify-center py-1 text-xs"
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
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
              {isLoading && <p className="ind-muted mt-3 text-sm">Läser schemat…</p>}
            </div>

            <SideQueue label="Att besluta" empty="Inget väntar just nu.">
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
        </>
      )}

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
                try {
                  await saveShift.mutateAsync({
                    ...editing,
                    store_id: storeId,
                    legal_entity_id: store?.legal_entity_id ?? null,
                    date: editing.date,
                    start_time: editing.start_time,
                    end_time: editing.end_time,
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
