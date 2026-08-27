/**
 * Granskningsvy för schemaimport (etapp 3 E).
 *
 * Filen tolkas alltid först deterministiskt. Om den inte matchar mallen
 * används AI-fallbacken — men resultatet går ALLTID genom samma granskning
 * innan något skrivs till shifts. Import skapar utkast kopplade till
 * import_id, så hela importen kan ångras.
 */
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, FileSpreadsheet, Loader2, Sparkles, Undo2, Upload } from "lucide-react";
import {
  DecisionBar,
  DecisionMetric,
  IndustryButton,
  IndustryRow,
  QueueItem,
  SectionLabel,
  SideQueue,
  StatusLabel,
} from "@/components/industry";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { useEmployees, useAllEmployments } from "@/hooks/useEmployees";
import { useShiftTypes, useShifts, useEmployeeCompetencies, useAvailability } from "@/hooks/useSchedule";
import { useScheduleImports, useUndoImport } from "@/hooks/useAttest";
import {
  checkShift,
  formatMinutes,
  weekDates,
  worstSeverity,
  type RuleCheck,
  type Shift,
} from "@/lib/schedule";
import {
  looksLikeTemplate,
  matchRow,
  parseRows,
  readFileRows,
  type MatchResult,
  type ParsedRow,
  type RawRow,
} from "@/lib/scheduleImport";

interface ReviewRow extends ParsedRow {
  match: MatchResult;
  storeId: string | null;
  shiftTypeId: string | null;
  checks: RuleCheck[];
  selected: boolean;
  diff: "ny" | "andrad" | "oforandrad";
  existingShiftId: string | null;
}

export function ScheduleImportDialog({
  open,
  onOpenChange,
  storeId,
  legalEntityId,
  anchor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  legalEntityId: string | null;
  anchor: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [source, setSource] = useState<"template" | "ai_fallback">("template");
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);

  const { data: stores = [] } = useStores();
  const { data: employees = [] } = useEmployees(false);
  const { data: employments = [] } = useAllEmployments();
  const { data: shiftTypes = [] } = useShiftTypes();
  const { data: competencies = [] } = useEmployeeCompetencies();
  const { data: availability = [] } = useAvailability();
  const { data: imports = [] } = useScheduleImports(storeId || null);
  const undoImport = useUndoImport();

  const week = useMemo(() => weekDates(anchor), [anchor]);
  const { data: existing = [] } = useShifts(storeId || null, week[0], week[6]);

  const targets = useMemo(
    () =>
      employees.map((e) => ({
        employee_id: e.id,
        name: `${e.first_name} ${e.last_name}`,
        employment_number:
          employments.find((em) => em.employee_id === e.id && em.is_active)?.employment_number ?? null,
        pnr_last4: null,
      })),
    [employees, employments],
  );

  const personContext = (employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    const em = employments.find((x) => x.employee_id === employeeId && x.is_active);
    return {
      birthDate: emp?.birth_date ?? null,
      employmentRate: em?.employment_rate ?? 1,
      competencies: competencies.filter((c) => c.employee_id === employeeId).map((c) => c.competency),
      availability: availability.filter((a) => a.employee_id === employeeId),
    };
  };

  const recheck = (row: ReviewRow, all: ReviewRow[]): ReviewRow => {
    if (!row.match.employee_id || !row.date || !row.start_time || !row.end_time) return { ...row, checks: [] };
    const ctx = personContext(row.match.employee_id);
    const asShift: Shift = {
      id: `import-${row.index}`,
      store_id: row.storeId ?? storeId,
      legal_entity_id: legalEntityId,
      employee_id: row.match.employee_id,
      shift_type_id: row.shiftTypeId,
      date: row.date,
      start_time: row.start_time,
      end_time: row.end_time,
      break_minutes: row.break_minutes,
      status: "draft",
      published_at: null,
      note: row.note,
      import_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const siblings: Shift[] = [
      ...existing.filter((s) => s.employee_id === row.match.employee_id && s.status !== "cancelled"),
      ...all
        .filter(
          (r) =>
            r.index !== row.index &&
            r.match.employee_id === row.match.employee_id &&
            r.date &&
            r.start_time &&
            r.end_time,
        )
        .map((r) => ({
          ...asShift,
          id: `import-${r.index}`,
          date: r.date!,
          start_time: r.start_time!,
          end_time: r.end_time!,
          break_minutes: r.break_minutes,
        })),
    ];
    return {
      ...row,
      checks: checkShift(asShift, {
        shifts: siblings,
        availability: ctx.availability as never,
        competencies: ctx.competencies,
        birthDate: ctx.birthDate,
        employmentRate: ctx.employmentRate,
        requiredCompetency: row.shiftTypeId
          ? shiftTypes.find((t) => t.id === row.shiftTypeId)?.required_competency
          : null,
      }),
    };
  };

  const buildRows = async (parsed: ParsedRow[]): Promise<ReviewRow[]> => {
    const pnrLookup = async (pnr: string) => {
      const { data } = await supabase.rpc("lookup_employee_by_pnr", { _pnr: pnr });
      const hit = Array.isArray(data) ? data[0] : null;
      return (hit as { employee_id?: string } | null)?.employee_id ?? null;
    };

    const out: ReviewRow[] = [];
    for (const row of parsed) {
      const match = await matchRow(row, targets, pnrLookup);
      const storeMatch =
        stores.find((s) => row.store_hint && s.name.toLowerCase() === row.store_hint.toLowerCase()) ??
        stores.find((s) => row.store_hint && s.name.toLowerCase().includes(row.store_hint.toLowerCase())) ??
        stores.find((s) => s.id === storeId) ??
        null;
      const typeMatch =
        shiftTypes.find((t) => row.shift_type_hint && t.name.toLowerCase() === row.shift_type_hint.toLowerCase()) ??
        shiftTypes.find((t) => t.name === "Ordinarie") ??
        shiftTypes[0] ??
        null;

      const errors = [...row.errors];
      if (!match.employee_id) {
        errors.push(
          match.suggestions.length
            ? `Person kunde inte matchas — förslag: ${match.suggestions.map((s) => s.name).join(", ")}`
            : "Person kunde inte matchas",
        );
      }
      if (row.store_hint && !storeMatch) errors.push(`Okänd enhet: ${row.store_hint}`);
      if (row.shift_type_hint && !typeMatch) errors.push(`Okänd skifttyp: ${row.shift_type_hint}`);

      const twin = existing.find(
        (s) =>
          s.employee_id === match.employee_id &&
          s.date === row.date &&
          s.status !== "cancelled",
      );
      const diff: ReviewRow["diff"] = !twin
        ? "ny"
        : twin.start_time.slice(0, 5) === (row.start_time ?? "") &&
            twin.end_time.slice(0, 5) === (row.end_time ?? "") &&
            twin.break_minutes === row.break_minutes
          ? "oforandrad"
          : "andrad";

      out.push({
        ...row,
        errors,
        match,
        storeId: storeMatch?.id ?? null,
        shiftTypeId: typeMatch?.id ?? null,
        checks: [],
        selected: errors.length === 0 && diff !== "oforandrad",
        diff,
        existingShiftId: twin?.id ?? null,
      });
    }
    return out.map((r, _i, all) => recheck(r, all));
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setFilename(file.name);
    try {
      const { rows: raw } = await readFileRows(file);
      if (!raw.length) {
        toast.error("Filen innehåller inga rader");
        return;
      }
      if (looksLikeTemplate(raw)) {
        setSource("template");
        setRows(await buildRows(parseRows(raw)));
        toast.success(`${raw.length} rader tolkade`);
        return;
      }
      // AI-fallback: filen matchar inte mallen
      setSource("ai_fallback");
      toast.info("Filen matchar inte mallen — tolkar med AI-fallback");
      const { data, error } = await supabase.functions.invoke("schedule-import-ai", {
        body: {
          table: raw.map((r) => r.values),
          context: `Enheter: ${stores.map((s) => s.name).join(", ")}. Skifttyper: ${shiftTypes
            .map((t) => t.name)
            .join(", ")}.`,
        },
      });
      if (error) throw error;
      const aiRows = ((data as { rows?: Record<string, string>[] })?.rows ?? []).map((values, i) => ({
        index: i + 2,
        values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? "")])),
      })) as RawRow[];
      if (!aiRows.length) {
        toast.error("AI-fallbacken hittade inga pass i filen");
        return;
      }
      setRows(await buildRows(parseRows(aiRows)));
      toast.success(`${aiRows.length} rader tolkade via AI-fallback`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte läsa filen");
    } finally {
      setBusy(false);
    }
  };

  const updateRow = (index: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => {
      const next = prev.map((r) => (r.index === index ? { ...r, ...patch } : r));
      return next.map((r) => recheck(r, next));
    });

  const importable = rows.filter((r) => r.selected && !r.errors.length && r.date && r.start_time && r.end_time);
  const blocked = rows.filter((r) => worstSeverity(r.checks) === "block");

  const runImport = async () => {
    if (!importable.length) return;
    setImporting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { data: imp, error: impErr } = await supabase
        .from("schedule_imports")
        .insert({
          filename: filename || "schema",
          source,
          status: "review",
          store_id: storeId || null,
          legal_entity_id: legalEntityId,
          row_results: rows.map((r) => ({
            rad: r.index,
            datum: r.date,
            person: r.match.employee_id,
            metod: r.match.method,
            fel: r.errors,
            varningar: r.checks.map((c) => c.label),
            vald: r.selected,
            diff: r.diff,
          })) as never,
          created_by: auth.user?.id ?? null,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      const payload = importable.map((r) => ({
        store_id: r.storeId ?? storeId,
        legal_entity_id: legalEntityId,
        employee_id: r.match.employee_id,
        shift_type_id: r.shiftTypeId,
        date: r.date!,
        start_time: r.start_time!,
        end_time: r.end_time!,
        break_minutes: r.break_minutes,
        status: "draft" as const,
        note: r.note,
        import_id: imp.id,
        created_by: auth.user?.id ?? null,
      }));
      const { error: shiftErr } = await supabase.from("shifts").insert(payload);
      if (shiftErr) throw shiftErr;
      await supabase.from("schedule_imports").update({ status: "imported" }).eq("id", imp.id);
      toast.success(`${payload.length} pass importerade som utkast`);
      setRows([]);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Importen misslyckades");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ind max-w-6xl">
        <DialogHeader>
          <DialogTitle className="ind-h2">Importera schema</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <IndustryButton variant="primary" corners onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Välj fil (xlsx/csv)
            </IndustryButton>
            {source === "ai_fallback" && rows.length > 0 && (
              <StatusLabel tone="progress">
                <Sparkles className="mr-1 inline h-3 w-3" />
                AI-tolkad — granskas som vanligt
              </StatusLabel>
            )}
          </div>

          {rows.length > 0 && (
            <>
              <DecisionBar>
                <DecisionMetric label="Rader" value={rows.length} />
                <DecisionMetric
                  label="Importeras"
                  value={importable.length}
                  tone={importable.length ? "ok" : "neutral"}
                />
                <DecisionMetric
                  label="Fel"
                  value={rows.filter((r) => r.errors.length).length}
                  tone={rows.some((r) => r.errors.length) ? "alert" : "ok"}
                />
                <DecisionMetric
                  label="Varningar"
                  value={rows.filter((r) => r.warnings.length).length}
                  tone={rows.some((r) => r.warnings.length) ? "progress" : "ok"}
                />
                <DecisionMetric label="Nya" value={rows.filter((r) => r.diff === "ny").length} />
                <DecisionMetric
                  label="Ändrade"
                  value={rows.filter((r) => r.diff === "andrad").length}
                  tone={rows.some((r) => r.diff === "andrad") ? "progress" : "neutral"}
                />
                <IndustryButton
                  variant="ghost"
                  onClick={() =>
                    setRows((prev) =>
                      prev.map((r) => ({ ...r, selected: !r.errors.length && r.diff !== "oforandrad" })),
                    )
                  }
                >
                  Markera felfria
                </IndustryButton>
              </DecisionBar>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
                  {rows.map((r) => {
                    const severity = worstSeverity(r.checks);
                    const edge = r.errors.length
                      ? "alert"
                      : severity === "block"
                        ? "alert"
                        : severity
                          ? "accent-2"
                          : r.diff === "andrad"
                            ? "accent"
                            : r.warnings.length
                              ? "accent-2"
                              : "neutral";
                    return (
                      <IndustryRow key={r.index} edge={edge}>
                        <div className="flex flex-wrap items-start gap-3">
                          <Checkbox
                            checked={r.selected}
                            disabled={Boolean(r.errors.length)}
                            onCheckedChange={(v) => updateRow(r.index, { selected: Boolean(v) })}
                            aria-label={`Rad ${r.index}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="ind-mono text-sm">
                              Rad {r.index} · {r.date ?? "?"} {r.start_time ?? "?"}–{r.end_time ?? "?"} · rast{" "}
                              {r.break_minutes} min
                            </p>
                            <p className="text-sm">
                              {r.match.employee_id
                                ? (targets.find((t) => t.employee_id === r.match.employee_id)?.name ?? "Okänd")
                                : (r.name ?? "Namn saknas")}
                              <span className="ind-muted"> · {r.store_hint ?? "enhet saknas"}</span>
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <StatusLabel
                                tone={r.diff === "ny" ? "ok" : r.diff === "andrad" ? "progress" : "neutral"}
                              >
                                {r.diff === "ny" ? "Ny" : r.diff === "andrad" ? "Ändrad" : "Oförändrad"}
                              </StatusLabel>
                              <span className="ind-muted text-xs">
                                Matchning:{" "}
                                {r.match.method === "employment_number"
                                  ? "anställningsnummer"
                                  : r.match.method === "pnr"
                                    ? "personnummer"
                                    : r.match.method === "name"
                                      ? "namn"
                                      : "ingen"}
                              </span>
                            </div>
                            {r.errors.map((err) => (
                              <p key={err} className="ind-status--alert text-xs">
                                {err}
                              </p>
                            ))}
                            {r.warnings.map((warn) => (
                              <p key={warn} className="text-xs">
                                <StatusLabel tone="progress">Varning</StatusLabel>{" "}
                                <span className="ind-muted">{warn}</span>
                              </p>
                            ))}
                            {r.checks.map((c) => (
                              <p key={c.code + c.detail} className="text-xs">
                                <StatusLabel tone={c.severity === "block" ? "alert" : "progress"}>
                                  {c.label}
                                </StatusLabel>{" "}
                                <span className="ind-muted">{c.detail}</span>
                              </p>
                            ))}
                            {!r.match.employee_id && r.match.suggestions.length > 0 && (
                              <Select
                                value=""
                                onValueChange={(v) =>
                                  updateRow(r.index, {
                                    match: { employee_id: v, method: "name", suggestions: r.match.suggestions },
                                    errors: r.errors.filter((e) => !e.startsWith("Person")),
                                    selected: r.errors.filter((e) => !e.startsWith("Person")).length === 0,
                                  })
                                }
                              >
                                <SelectTrigger className="ind-input mt-1 w-64">
                                  <SelectValue placeholder="Välj person" />
                                </SelectTrigger>
                                <SelectContent>
                                  {r.match.suggestions.map((s) => (
                                    <SelectItem key={s.employee_id} value={s.employee_id}>
                                      {s.name} ({Math.round(s.score * 100)} %)
                                    </SelectItem>
                                  ))}
                                  {targets.map((t) => (
                                    <SelectItem key={`all-${t.employee_id}`} value={t.employee_id}>
                                      {t.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                          <Select
                            value={r.shiftTypeId ?? ""}
                            onValueChange={(v) => updateRow(r.index, { shiftTypeId: v })}
                          >
                            <SelectTrigger className="ind-input w-36">
                              <SelectValue placeholder="Skifttyp" />
                            </SelectTrigger>
                            <SelectContent>
                              {shiftTypes.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value={r.storeId ?? ""}
                            onValueChange={(v) =>
                              updateRow(r.index, {
                                storeId: v,
                                errors: r.errors.filter((e) => !e.startsWith("Okänd enhet")),
                              })
                            }
                          >
                            <SelectTrigger className="ind-input w-44">
                              <SelectValue placeholder="Enhet" />
                            </SelectTrigger>
                            <SelectContent>
                              {stores.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </IndustryRow>
                    );
                  })}
                </div>

                <SideQueue label="Att hantera" empty="Alla rader är rena.">
                  <div className="space-y-2">
                    {blocked.map((r) => (
                      <QueueItem key={`b-${r.index}`}>
                        <SectionLabel>Regelbrott</SectionLabel>
                        <p className="text-sm">
                          Rad {r.index} · {r.date}
                        </p>
                        {r.checks
                          .filter((c) => c.severity === "block")
                          .map((c) => (
                            <p key={c.code} className="ind-muted text-xs">
                              <AlertTriangle className="mr-1 inline h-3 w-3" />
                              {c.label}: {c.detail}
                            </p>
                          ))}
                      </QueueItem>
                    ))}
                    {rows
                      .filter((r) => r.errors.length)
                      .map((r) => (
                        <QueueItem key={`e-${r.index}`}>
                          <SectionLabel>Fel</SectionLabel>
                          <p className="text-sm">Rad {r.index}</p>
                          {r.errors.map((e) => (
                            <p key={e} className="ind-muted text-xs">
                              {e}
                            </p>
                          ))}
                        </QueueItem>
                      ))}
                    {!blocked.length && !rows.some((r) => r.errors.length) && (
                      <p className="ind-muted text-sm">Alla rader är rena.</p>
                    )}
                  </div>
                </SideQueue>
              </div>
            </>
          )}

          {imports.length > 0 && (
            <div>
              <SectionLabel>Tidigare importer</SectionLabel>
              <div className="space-y-1">
                {imports.slice(0, 5).map((imp) => (
                  <IndustryRow key={imp.id} edge={imp.status === "undone" ? "neutral" : "accent-2"}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm">
                          <FileSpreadsheet className="mr-1 inline h-3 w-3" />
                          {imp.filename}
                        </p>
                        <p className="ind-muted text-xs">
                          {new Date(imp.created_at).toLocaleString("sv-SE")} ·{" "}
                          {imp.source === "ai_fallback" ? "AI-fallback" : "Mall"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusLabel tone={imp.status === "imported" ? "ok" : "neutral"}>
                          {imp.status === "imported" ? "Importerad" : imp.status === "undone" ? "Ångrad" : imp.status}
                        </StatusLabel>
                        {imp.status === "imported" && (
                          <IndustryButton
                            variant="ghost"
                            onClick={async () => {
                              const n = await undoImport.mutateAsync(imp.id);
                              toast.success(`${n} utkast borttagna`);
                            }}
                          >
                            <Undo2 className="h-4 w-4" /> Ångra
                          </IndustryButton>
                        )}
                      </div>
                    </div>
                  </IndustryRow>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <IndustryButton variant="ghost" onClick={() => onOpenChange(false)}>
            Stäng
          </IndustryButton>
          <IndustryButton
            variant="primary"
            corners
            disabled={!importable.length || importing}
            onClick={runImport}
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Importera {importable.length} rader som utkast
          </IndustryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
