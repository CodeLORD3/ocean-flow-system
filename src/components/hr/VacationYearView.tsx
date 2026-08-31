import { useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, ChevronUp, Download, Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IndustryButton, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";
import { useVacationBalances, type VacationBalance } from "@/hooks/useAbsence";

const svDate = (value: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(`${value}T12:00:00`)) : "—";
const days = (value: number) => value.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const remaining = (row: VacationBalance) => row.entitled_days + row.saved_days + row.manual_adjustment_days - row.used_days;

function suggestDate(row: VacationBalance) {
  const start = new Date(`${row.vacation_year}-04-01T12:00:00`);
  const end = new Date(`${row.vacation_year + 1}-03-31T12:00:00`);
  const today = new Date();
  const date = today > start && today < end ? today : start;
  return date.toISOString().slice(0, 10);
}

export function VacationYearView({ employeeId }: { employeeId?: string | null }) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);
  const balances = useVacationBalances(employeeId);
  const allBalances = useQuery({
    queryKey: ["vacation-balances", "all"],
    enabled: !employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.from("vacation_balances").select("id, employee_id, vacation_year, entitled_days, earned_days, used_days, saved_days, manual_adjustment_days, expiry_flagged, expires_at").order("vacation_year", { ascending: false }).order("employee_id");
      if (error) throw error;
      return (data ?? []) as VacationBalance[];
    },
  });
  const rows = employeeId ? balances.data ?? [] : allBalances.data ?? [];
  const grouped = useMemo(() => {
    const map = new Map<number, VacationBalance[]>();
    rows.forEach((row) => map.set(row.vacation_year, [...(map.get(row.vacation_year) ?? []), row]));
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [rows]);
  const currentYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const exportCsv = () => {
    const header = "Årgång;Intjänat;Uttaget;Kvar;Sparat;Förfaller\n";
    const body = rows.map((row) => [row.vacation_year, days(row.earned_days), days(row.used_days), days(remaining(row)), days(row.saved_days), svDate(row.expires_at)].join(";")).join("\n");
    const blob = new Blob(["\ufeff" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "semesterar-saldon.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><SectionLabel>Semesterår · 1 april – 31 mars</SectionLabel><p className="ind-muted text-sm">Intjänat, uttaget, sparat och återstående saldo per årgång.</p></div>
      <div className="flex gap-2"><IndustryButton variant="secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Excel/CSV</IndustryButton></div>
    </div>
    {!rows.length && <IndustryRow edge="neutral"><p className="ind-muted text-sm">Inga semestersaldon finns för valt urval.</p></IndustryRow>}
    {grouped.map(([year, yearRows]) => {
      const open = selectedYear === year || (selectedYear === null && year === currentYear);
      const total = yearRows.reduce((sum, row) => sum + remaining(row), 0);
      return <div key={year} className="overflow-hidden rounded-md border border-[var(--color-divider)] bg-[var(--color-neutral-100)]">
        <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-[var(--color-neutral-200)]" onClick={() => setSelectedYear(open ? null : year)} aria-expanded={open}>
          <span><strong className="ind-mono">{year}/{year + 1}</strong><span className="ind-muted ml-3 text-sm">{yearRows.length} person(er) · {days(total)} dagar kvar</span></span>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {open && <div className="overflow-x-auto border-t border-[var(--color-divider)]"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b border-[var(--color-divider)] text-left"><th>Årgång</th><th className="text-right">Intjänat</th><th className="text-right">Uttaget</th><th className="text-right">Kvar</th><th className="text-right">Sparat</th><th>Förfaller</th><th /></tr></thead><tbody>{yearRows.map((row) => {
          const left = remaining(row);
          const isSuggested = suggested === row.id;
          return <tr key={row.id} className="border-b border-[var(--color-divider)] last:border-0"><td className="px-3 py-2 font-medium">{row.vacation_year}/{row.vacation_year + 1}{!employeeId && <span className="ind-muted ml-2 text-xs">{row.employee_id.slice(0, 8)}</span>}</td><td className="px-3 py-2 text-right ind-mono">{days(row.earned_days)}</td><td className="px-3 py-2 text-right ind-mono">{days(row.used_days)}</td><td className="px-3 py-2 text-right ind-mono font-semibold">{days(left)}</td><td className="px-3 py-2 text-right ind-mono font-semibold">{days(row.saved_days)}</td><td className={`px-3 py-2 ${row.expiry_flagged ? "font-semibold text-[var(--color-warn-800)]" : "ind-muted"}`}>{svDate(row.expires_at)}</td><td className="px-3 py-2 text-right"><IndustryButton variant="ghost" onClick={() => { setSuggested(row.id); }}><CalendarPlus className="h-4 w-4" /> Föreslå datum</IndustryButton></td></tr>;
        })}</tbody></table></div>}
        {open && yearRows.map((row) => suggested === row.id ? <div key={`${row.id}-suggestion`} className="border-t border-[var(--color-divider)] px-3 py-2"><div className="flex flex-wrap items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-[var(--color-accent-700)]" /><span>Förslag på semesterstart:</span><IndustryInput type="date" value={suggestDate(row)} readOnly className="w-auto" /><StatusLabel tone="ok">{days(remaining(row))} dagar tillgängliga</StatusLabel><IndustryButton variant="ghost" onClick={() => setSuggested(null)}>Stäng</IndustryButton></div></div> : null)}
      </div>;
    })}
  </section>;
}
