import { useMemo, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees } from "@/hooks/useEmployees";
import { useQuery } from "@tanstack/react-query";
import { IndustryButton, IndustryFrame, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";

interface Entry { id: string; employee_id: string; occurred_at: string; type: string; corrects_entry_id: string | null; correction_kind: string | null; work_site_id: string | null; cost_center: string | null; }
interface Window { day_kind: string; start_time: string; end_time: string; pct: number; wage_code_id: string | null; }
interface Holiday { holiday_date: string; treated_as: string; }
interface PayrollRow { employeeId: string; regular: number; ob50: number; ob70: number; ob100: number; overtime: number; missingWage: boolean; source: Record<string, unknown>; }

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
const minutesBetween = (a: string, b: string) => Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000));

function effective(entries: Entry[]) {
  const corrected = new Set(entries.map((e) => e.corrects_entry_id).filter(Boolean));
  return entries.filter((e) => !corrected.has(e.id) && e.correction_kind !== "void").sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

function kindFor(date: string, holidays: Holiday[]) {
  const holiday = holidays.find((h) => h.holiday_date === date);
  if (holiday) return holiday.treated_as;
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? "sunday" : day === 6 ? "saturday" : "weekday";
}

function splitPremium(start: string, end: string, windows: Window[], holidays: Holiday[]) {
  let regular = 0, ob50 = 0, ob70 = 0, ob100 = 0, missingWage = false;
  let cursor = new Date(start);
  const finish = new Date(end);
  while (cursor < finish) {
    const next = new Date(Math.min(finish.getTime(), cursor.getTime() + 15 * 60_000));
    const localDate = cursor.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    const localTime = cursor.toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });
    const matches = windows.filter((w) => w.day_kind === kindFor(localDate, holidays) && localTime >= w.start_time.slice(0, 5) && localTime < w.end_time.slice(0, 5));
    const mins = Math.max(0, Math.round((next.getTime() - cursor.getTime()) / 60000));
    const premium = matches.sort((a, b) => b.pct - a.pct)[0];
    if (!premium) regular += mins;
    else if (premium.pct >= 100) ob100 += mins;
    else if (premium.pct >= 70) ob70 += mins;
    else ob50 += mins;
    if (premium && !premium.wage_code_id) missingWage = true;
    cursor = next;
  }
  return { regular, ob50, ob70, ob100, missingWage };
}

export default function PayrollExports() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: employees = [] } = useEmployees(true);

  const query = useQuery({
    queryKey: ["payroll-export-data", from, to],
    queryFn: async () => {
      const [entryResult, windowResult, holidayResult] = await Promise.all([
        supabase.from("time_entries").select("id, employee_id, occurred_at, type, corrects_entry_id, correction_kind, work_site_id, cost_center").gte("occurred_at", `${from}T00:00:00`).lte("occurred_at", `${to}T23:59:59`).order("occurred_at"),
        supabase.from("ob_windows").select("day_kind, start_time, end_time, pct, wage_code_id").eq("is_active", true),
        supabase.from("payroll_holidays").select("holiday_date, treated_as").gte("holiday_date", from).lte("holiday_date", to),
      ]);
      if (entryResult.error) throw entryResult.error;
      if (windowResult.error) throw windowResult.error;
      if (holidayResult.error) throw holidayResult.error;
      return { entries: effective((entryResult.data ?? []) as Entry[]), windows: (windowResult.data ?? []) as Window[], holidays: (holidayResult.data ?? []) as Holiday[] };
    },
  });

  const rows = useMemo<PayrollRow[]>(() => {
    const grouped = new Map<string, Entry[]>();
    for (const entry of query.data?.entries ?? []) { const list = grouped.get(entry.employee_id) ?? []; list.push(entry); grouped.set(entry.employee_id, list); }
    return [...grouped.entries()].map(([employeeId, entries]) => {
      let regular = 0, ob50 = 0, ob70 = 0, ob100 = 0; let missingWage = false; let overtime = 0;
      let openIn: string | null = null;
      for (const entry of entries) {
        if (entry.type === "in") openIn = entry.occurred_at;
        if (entry.type === "ut" && openIn) { const split = splitPremium(openIn, entry.occurred_at, query.data?.windows ?? [], query.data?.holidays ?? []); regular += split.regular; ob50 += split.ob50; ob70 += split.ob70; ob100 += split.ob100; missingWage ||= split.missingWage; openIn = null; }
      }
      const total = regular + ob50 + ob70 + ob100;
      if (total > 160 * 60) { overtime = total - 160 * 60; regular -= overtime; }
      return { employeeId, regular, ob50, ob70, ob100, overtime, missingWage, source: { from, to, entry_count: entries.length } };
    }).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
  }, [query.data, from, to]);

  const nameOf = (id: string) => { const employee = employees.find((item) => item.id === id); return employee ? `${employee.first_name} ${employee.last_name}` : id; };
  const formatMinutes = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;

  const saveExport = async () => {
    if (!rows.length) return;
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { data: exportRow, error } = await supabase.from("payroll_exports").insert({ period_start: from, period_end: to, status: rows.some((row) => row.missingWage) ? "blocked" : "draft", blocked_reason: rows.some((row) => row.missingWage) ? "En eller flera OB-rader saknar löneart." : null, exported_by: user.user?.id ?? null }).select("id").single();
      if (error) throw error;
      const { error: lineError } = await supabase.from("payroll_export_lines").insert(rows.map((row) => ({ export_id: exportRow.id, employee_id: row.employeeId, regular_minutes: row.regular, overtime_minutes: row.overtime, ob_50_minutes: row.ob50, ob_70_minutes: row.ob70, ob_100_minutes: row.ob100, wage_code_missing: row.missingWage, source_snapshot: row.source })));
      if (lineError) throw lineError;
      setGeneratedAt(new Date().toISOString());
      toast.success("Löneunderlaget sparat");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunde inte spara löneunderlaget"); }
    finally { setSaving(false); }
  };

  const downloadCsv = () => {
    const header = ["Anställd", "Från", "Till", "Ordinarie minuter", "OB 50 minuter", "OB 70 minuter", "OB 100 minuter", "Övertid minuter", "Löneart saknas"];
    const body = rows.map((row) => [nameOf(row.employeeId), from, to, row.regular, row.ob50, row.ob70, row.ob100, row.overtime, row.missingWage ? "Ja" : "Nej"]);
    const blob = new Blob(["\ufeff" + [header, ...body].map((line) => line.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `makrilltrade-loneunderlag-${from}-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  const blocked = rows.some((row) => row.missingWage);
  return <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
    <div><SectionLabel>Personal · Fortnox-underlag</SectionLabel><h1 className="ind-h1">Löneunderlag</h1><p className="ind-muted mt-1 text-sm">Tid från den append-only journalen, uppdelad på ordinarie tid och OB-nivåer.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div><SectionLabel>Från</SectionLabel><IndustryInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><SectionLabel>Till</SectionLabel><IndustryInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><IndustryButton variant="secondary" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" />Uppdatera</IndustryButton><IndustryButton variant="primary" corners disabled={!rows.length || saving || blocked} onClick={saveExport}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Spara underlag</IndustryButton><IndustryButton variant="secondary" disabled={!rows.length} onClick={downloadCsv}><Download className="h-4 w-4" />CSV</IndustryButton></div>
    {blocked && <IndustryRow edge="alert"><StatusLabel tone="alert">Blockerat</StatusLabel><span className="text-sm">Minst en OB-period saknar kopplad löneart. Koppla lönearten under Regler & OB innan underlaget sparas.</span></IndustryRow>}
    {generatedAt && <IndustryRow edge="accent"><StatusLabel tone="ok">Sparat</StatusLabel><span className="text-sm">Underlaget skapades {new Date(generatedAt).toLocaleString("sv-SE")}.</span></IndustryRow>}
    <section className="space-y-1"><SectionLabel>Sammanställning</SectionLabel>{query.isLoading ? <Loader2 className="h-5 w-5 animate-spin ind-muted" /> : rows.length === 0 ? <IndustryRow edge="neutral"><span className="ind-muted text-sm">Inga avslutade arbetspass i perioden.</span></IndustryRow> : rows.map((row) => <IndustryRow key={row.employeeId} edge={row.missingWage ? "alert" : "accent"} className="flex-wrap"><span className="min-w-[220px] flex-1 font-medium">{nameOf(row.employeeId)}</span><span className="ind-mono">Ord {formatMinutes(row.regular)}</span><span className="ind-mono">OB 50 {formatMinutes(row.ob50)}</span><span className="ind-mono">OB 70 {formatMinutes(row.ob70)}</span><span className="ind-mono">OB 100 {formatMinutes(row.ob100)}</span><span className="ind-mono">ÖT {formatMinutes(row.overtime)}</span>{row.missingWage && <StatusLabel tone="alert">Löneart saknas</StatusLabel>}</IndustryRow>)}</section>
  </IndustryFrame>;
}
