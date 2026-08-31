import { useMemo, useState } from "react";
import { CalendarDays, Loader2, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { IndustryButton, IndustryFrame, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";

const dateValue = (date: Date) => {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const today = () => dateValue(new Date());
const monthStart = () => `${today().slice(0, 7)}-01`;
const formatMinutes = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;

interface Workday {
  arbetsdag: string;
  regular_minutes: number;
  ob50_minutes: number;
  ob70_minutes: number;
  ob100_minutes: number;
  mertid_minutes: number;
  overtime_minutes: number;
  break_minutes: number;
  total_minutes: number;
  missing_wage_code: boolean;
}

export default function MyTime() {
  const { staff } = useStaffAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const employeeIds = useQuery({
    queryKey: ["my-time-employee-ids", staff?.user_id],
    enabled: Boolean(staff?.user_id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_employee_ids");
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
  const worktime = useQuery({
    queryKey: ["my-time", employeeIds.data, from, to],
    enabled: Boolean(employeeIds.data?.length),
    queryFn: async () => {
      const rows = await Promise.all((employeeIds.data ?? []).map(async (employeeId) => {
        const { data, error } = await supabase.rpc("berakna_arbetstid", { _employee_id: employeeId, _from: from, _to: to });
        if (error) throw error;
        return (data ?? []) as Workday[];
      }));
      return rows.flat().sort((a, b) => a.arbetsdag.localeCompare(b.arbetsdag));
    },
  });
  const totals = useMemo(() => (worktime.data ?? []).reduce((sum, day) => ({
    total: sum.total + Number(day.total_minutes ?? 0),
    ob: sum.ob + Number(day.ob50_minutes ?? 0) + Number(day.ob70_minutes ?? 0) + Number(day.ob100_minutes ?? 0),
    mertid: sum.mertid + Number(day.mertid_minutes ?? 0),
    overtime: sum.overtime + Number(day.overtime_minutes ?? 0),
  }), { total: 0, ob: 0, mertid: 0, overtime: 0 }), [worktime.data]);

  return <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
    <div>
      <SectionLabel>Personal · Min tid</SectionLabel>
      <h1 className="ind-h1">Min tid</h1>
      <p className="ind-muted mt-1 text-sm">Din tid beräknas från den gemensamma svenska arbetstidsmotorn.</p>
    </div>
    <div className="flex flex-wrap items-end gap-3">
      <div><SectionLabel>Från</SectionLabel><IndustryInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
      <div><SectionLabel>Till</SectionLabel><IndustryInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <IndustryButton variant="secondary" onClick={() => void worktime.refetch()}><RefreshCw className="h-4 w-4" />Uppdatera</IndustryButton>
    </div>
    <div className="grid gap-3 sm:grid-cols-4">
      <IndustryRow edge="accent"><span className="ind-muted text-xs">Totalt</span><strong className="ind-mono text-lg">{formatMinutes(totals.total)}</strong></IndustryRow>
      <IndustryRow edge="neutral"><span className="ind-muted text-xs">OB</span><strong className="ind-mono text-lg">{formatMinutes(totals.ob)}</strong></IndustryRow>
      <IndustryRow edge="neutral"><span className="ind-muted text-xs">Mertid</span><strong className="ind-mono text-lg">{formatMinutes(totals.mertid)}</strong></IndustryRow>
      <IndustryRow edge="neutral"><span className="ind-muted text-xs">Övertid</span><strong className="ind-mono text-lg">{formatMinutes(totals.overtime)}</strong></IndustryRow>
    </div>
    <section className="space-y-1">
      <SectionLabel>Dag för dag</SectionLabel>
      {employeeIds.isLoading || worktime.isLoading ? <Loader2 className="h-5 w-5 animate-spin ind-muted" /> : null}
      {!employeeIds.isLoading && !worktime.isLoading && !(worktime.data ?? []).length ? <IndustryRow edge="neutral"><CalendarDays className="h-4 w-4 ind-muted" /><span className="ind-muted text-sm">Ingen registrerad tid i perioden.</span></IndustryRow> : null}
      {(worktime.data ?? []).map((day) => <IndustryRow key={day.arbetsdag} edge={day.missing_wage_code ? "alert" : "accent"} className="flex-wrap">
        <span className="min-w-[150px] flex-1 font-medium">{new Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeZone: "Europe/Stockholm" }).format(new Date(`${day.arbetsdag}T12:00:00+02:00`))}</span>
        <span className="ind-mono">Tot {formatMinutes(Number(day.total_minutes ?? 0))}</span>
        <span className="ind-mono">OB {formatMinutes(Number(day.ob50_minutes ?? 0) + Number(day.ob70_minutes ?? 0) + Number(day.ob100_minutes ?? 0))}</span>
        <span className="ind-mono">Mertid {formatMinutes(Number(day.mertid_minutes ?? 0))}</span>
        <span className="ind-mono">ÖT {formatMinutes(Number(day.overtime_minutes ?? 0))}</span>
        {day.missing_wage_code ? <StatusLabel tone="alert">Löneart saknas</StatusLabel> : null}
      </IndustryRow>)}
    </section>
  </IndustryFrame>;
}
