import { useMemo, useState } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees } from "@/hooks/useEmployees";
import type { Json } from "@/integrations/supabase/types";
import { useQuery } from "@tanstack/react-query";
import { IndustryButton, IndustryFrame, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";

interface PayrollRow { employeeId: string; regular: number; ob50: number; ob70: number; ob100: number; overtime: number; mertid: number; missingWage: boolean; source: Record<string, unknown>; }
interface Workday { regular_minutes: number; ob50_minutes: number; ob70_minutes: number; ob100_minutes: number; overtime_minutes: number; mertid_minutes: number; missing_wage_code: boolean; }
const dateValue = (date: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(date);
const today = () => dateValue(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export default function PayrollExports() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: employees = [] } = useEmployees(true);
  const query = useQuery({
    queryKey: ["payroll-export-rpc", from, to, employees.map((employee) => employee.id).join(",")],
    enabled: employees.length > 0,
    queryFn: async () => {
      const results = await Promise.all(employees.map(async (employee) => {
        const { data, error } = await supabase.rpc("berakna_arbetstid", { _employee_id: employee.id, _from: from, _to: to });
        if (error) throw error;
        return { employeeId: employee.id, days: (data ?? []) as Workday[] };
      }));
      return results;
    },
  });
  const rows = useMemo<PayrollRow[]>(() => (query.data ?? []).map(({ employeeId, days }) => ({
    employeeId,
    regular: days.reduce((sum, day) => sum + Number(day.regular_minutes ?? 0), 0),
    ob50: days.reduce((sum, day) => sum + Number(day.ob50_minutes ?? 0), 0),
    ob70: days.reduce((sum, day) => sum + Number(day.ob70_minutes ?? 0), 0),
    ob100: days.reduce((sum, day) => sum + Number(day.ob100_minutes ?? 0), 0),
    overtime: days.reduce((sum, day) => sum + Number(day.overtime_minutes ?? 0), 0),
    mertid: days.reduce((sum, day) => sum + Number(day.mertid_minutes ?? 0), 0),
    missingWage: days.some((day) => day.missing_wage_code),
    source: { from, to, day_count: days.length, calculation_engine: "berakna_arbetstid" },
  })).filter((row) => row.regular + row.ob50 + row.ob70 + row.ob100 + row.overtime + row.mertid > 0).sort((a, b) => a.employeeId.localeCompare(b.employeeId)), [query.data, from, to]);
  const nameOf = (id: string) => { const employee = employees.find((item) => item.id === id); return employee ? `${employee.first_name} ${employee.last_name}` : id; };
  const formatMinutes = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
  const saveExport = async () => {
    if (!rows.length) return;
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const blocked = rows.some((row) => row.missingWage);
      const { data: exportRow, error } = await supabase.from("payroll_exports").insert({ period_start: from, period_end: to, status: blocked ? "blocked" : "draft", blocked_reason: blocked ? "En eller flera OB-rader saknar löneart." : null, exported_by: user.user?.id ?? null }).select("id").single();
      if (error) throw error;
      const lines = rows.map((row) => ({ export_id: exportRow.id, employee_id: row.employeeId, regular_minutes: row.regular, overtime_minutes: row.overtime, ob_50_minutes: row.ob50, ob_70_minutes: row.ob70, ob_100_minutes: row.ob100, wage_code_missing: row.missingWage, source_snapshot: row.source as Json }));
      const { error: lineError } = await supabase.from("payroll_export_lines").insert(lines);
      if (lineError) throw lineError;
      setGeneratedAt(new Date().toISOString());
      toast.success("Löneunderlaget sparat");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunde inte spara löneunderlaget"); } finally { setSaving(false); }
  };
  const downloadCsv = () => {
    const header = ["Anställd", "Från", "Till", "Ordinarie minuter", "Mertid minuter", "OB 50 minuter", "OB 70 minuter", "OB 100 minuter", "Övertid minuter", "Löneart saknas"];
    const body = rows.map((row) => [nameOf(row.employeeId), from, to, row.regular, row.mertid, row.ob50, row.ob70, row.ob100, row.overtime, row.missingWage ? "Ja" : "Nej"]);
    const blob = new Blob(["\ufeff" + [header, ...body].map((line) => line.map(csvCell).join(";")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `makrilltrade-loneunderlag-${from}-${to}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const blocked = rows.some((row) => row.missingWage);
  return <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
    <div><SectionLabel>Personal · Fortnox-underlag</SectionLabel><h1 className="ind-h1">Löneunderlag</h1><p className="ind-muted mt-1 text-sm">Tid från den gemensamma databasmotorn, uppdelad på ordinarie tid, mertid, OB och övertid.</p></div>
    <div className="flex flex-wrap items-end gap-3"><div><SectionLabel>Från</SectionLabel><IndustryInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div><div><SectionLabel>Till</SectionLabel><IndustryInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div><IndustryButton variant="secondary" onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" />Uppdatera</IndustryButton><IndustryButton variant="primary" corners disabled={!rows.length || saving} onClick={saveExport}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Spara underlag</IndustryButton><IndustryButton variant="secondary" disabled={!rows.length} onClick={downloadCsv}><Download className="h-4 w-4" />CSV</IndustryButton></div>
    {blocked && <IndustryRow edge="alert"><StatusLabel tone="alert">Löneart saknas</StatusLabel><span className="text-sm">Underlaget sparas som blockerat tills alla OB-perioder har en kopplad löneart.</span></IndustryRow>}
    {generatedAt && <IndustryRow edge="accent"><StatusLabel tone="ok">Sparat</StatusLabel><span className="text-sm">Underlaget skapades {new Date(generatedAt).toLocaleString("sv-SE")}.</span></IndustryRow>}
    <section className="space-y-1"><SectionLabel>Sammanställning</SectionLabel>{query.isLoading ? <Loader2 className="h-5 w-5 animate-spin ind-muted" /> : rows.length === 0 ? <IndustryRow edge="neutral"><span className="ind-muted text-sm">Inga registrerade arbetstidsrader i perioden.</span></IndustryRow> : rows.map((row) => <IndustryRow key={row.employeeId} edge={row.missingWage ? "alert" : "accent"} className="flex-wrap"><span className="min-w-[220px] flex-1 font-medium">{nameOf(row.employeeId)}</span><span className="ind-mono">Ord {formatMinutes(row.regular)}</span><span className="ind-mono">Mertid {formatMinutes(row.mertid)}</span><span className="ind-mono">OB 50 {formatMinutes(row.ob50)}</span><span className="ind-mono">OB 70 {formatMinutes(row.ob70)}</span><span className="ind-mono">OB 100 {formatMinutes(row.ob100)}</span><span className="ind-mono">ÖT {formatMinutes(row.overtime)}</span>{row.missingWage && <StatusLabel tone="alert">Löneart saknas</StatusLabel>}</IndustryRow>)}</section>
  </IndustryFrame>;
}
