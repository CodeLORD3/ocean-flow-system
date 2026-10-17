import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { IndustryButton, IndustryFrame, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";
import { periodBounds, periodForDate, periodLabel, shiftPeriod } from "@/lib/payrollPeriod";
import { effectiveEntries, hhmm } from "@/lib/timeEntries";
import type { TimeEntry } from "@/hooks/useClock";
import { STAFF_LANGS, useStaffT } from "@/lib/staffI18n";
import { toast } from "sonner";

const callWorktimeRpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;

const todayIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
const formatMinutes = (value: number) => `${Math.floor(value / 60)}:${String(Math.round(value) % 60).padStart(2, "0")}`;
const dayLabel = (d: string) => new Intl.DateTimeFormat("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Stockholm" }).format(new Date(`${d}T12:00:00Z`));
const stockholmDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date(iso));

interface Attest { id: string; date: string; employee_id: string; store_id: string | null; status: string; approved_minutes: number | null; computed: Record<string, unknown> | null }
interface AbsenceDay { date: string; extent_pct: number | null; hours: number | null; absence_requests: { status: string | null; absence_types: { name: string | null } | null } | null }
interface Workday { arbetsdag: string; ob50_minutes: number; ob70_minutes: number; ob100_minutes: number; mertid_minutes: number }

const STATUS_KEY: Record<string, { label: string; tone: "ok" | "alert" | "neutral" }> = {
  approved: { label: "attested", tone: "ok" },
  auto_approved: { label: "attested", tone: "ok" },
  flagged: { label: "in_review", tone: "alert" },
  rejected: { label: "rejected", tone: "alert" },
};

export default function MyTime() {
  const { staff, refresh } = useStaffAuth();
  const { t, lang, dir } = useStaffT();
  const changeLang = async (v: string) => {
    if (!staff) return;
    const { error } = await supabase.rpc("set_staff_lang" as never, { _staff_id: staff.id, _lang: v } as never);
    if (error) { toast.error(t("lang_error")); return; }
    await refresh?.();
    toast.success(t("lang_saved"));
  };
  const [period, setPeriod] = useState(() => periodForDate(todayIso()));
  const { from, to } = periodBounds(period);

  const ids = useQuery({
    queryKey: ["my-time-employee-ids", staff?.user_id],
    enabled: Boolean(staff?.user_id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_employee_ids");
      if (error) throw error;
      return (data ?? []) as string[];
    },
  });
  const employeeIds = ids.data ?? [];

  const details = useQuery({
    queryKey: ["my-time-period", employeeIds.join(","), from, to],
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const [att, entries, absence, stores, ob] = await Promise.all([
        supabase.from("attestations").select("id,date,employee_id,store_id,status,approved_minutes,computed").in("employee_id", employeeIds).gte("date", from).lte("date", to).range(0, 999),
        supabase.from("time_entries").select("*").in("employee_id", employeeIds).gte("occurred_at", `${from}T00:00:00+02:00`).lte("occurred_at", `${to}T23:59:59+02:00`).order("occurred_at").range(0, 999),
        supabase.from("absence_days").select("date,extent_pct,hours,absence_requests(status,absence_types(name))").in("employee_id", employeeIds).gte("date", from).lte("date", to),
        supabase.from("stores").select("id,name"),
        Promise.all(employeeIds.map(async (id) => {
          const { data } = await callWorktimeRpc("berakna_arbetstid", { _employee_id: id, _from: from, _to: to });
          return (data ?? []) as Workday[];
        })),
      ]);
      if (att.error) throw att.error;
      if (entries.error) throw entries.error;
      return {
        attest: (att.data ?? []) as unknown as Attest[],
        entries: (entries.data ?? []) as unknown as TimeEntry[],
        absence: ((absence.data ?? []) as unknown as AbsenceDay[]).filter((a) => a.absence_requests?.status !== "avslagen" && a.absence_requests?.status !== "rejected" && a.absence_requests?.status !== "cancelled"),
        stores: new Map(((stores.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name])),
        ob: ob.flat(),
      };
    },
  });

  const days = useMemo(() => {
    const d = details.data;
    if (!d) return [];
    const map = new Map<string, { date: string; attest?: Attest; entries: TimeEntry[]; absence: AbsenceDay[]; ob: number; mertid: number }>();
    const get = (date: string) => {
      let row = map.get(date);
      if (!row) { row = { date, entries: [], absence: [], ob: 0, mertid: 0 }; map.set(date, row); }
      return row;
    };
    // En rad per dag – samma regel som lönen: bästa ej avslagna attesten räknas.
    for (const a of d.attest) {
      if (a.status === "rejected") continue;
      const row = get(a.date);
      if (!row.attest || (a.approved_minutes ?? 0) > (row.attest.approved_minutes ?? 0)) row.attest = a;
    }
    for (const e of effectiveEntries(d.entries)) get(stockholmDay(e.occurred_at)).entries.push(e);
    for (const a of d.absence) get(a.date).absence.push(a);
    for (const w of d.ob) {
      if (!map.has(w.arbetsdag)) continue;
      const row = get(w.arbetsdag);
      row.ob += Number(w.ob50_minutes ?? 0) + Number(w.ob70_minutes ?? 0) + Number(w.ob100_minutes ?? 0);
      row.mertid += Number(w.mertid_minutes ?? 0);
    }
    return [...map.values()].filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  }, [details.data, from, to]);

  const totals = useMemo(() => days.reduce((s, r) => ({
    worked: s.worked + (r.attest?.approved_minutes ?? 0),
    ob: s.ob + r.ob,
    absenceDays: s.absenceDays + (r.absence.length ? 1 : 0),
    pending: s.pending + (r.attest?.status === "flagged" || (!r.attest && r.entries.length && !r.absence.length) ? 1 : 0),
  }), { worked: 0, ob: 0, absenceDays: 0, pending: 0 }), [days]);

  const loading = ids.isLoading || details.isLoading;

  return <IndustryFrame className="ind-page space-y-6 p-4 md:p-6" dir={dir} lang={lang}>
    <div>
      <SectionLabel>{t("my_time")}</SectionLabel>
      <h1 className="ind-h1">{t("my_time")}</h1>
      <p className="ind-muted mt-1 text-sm">{t("my_time_intro")}</p>
      <label className="mt-3 flex items-center gap-2 text-sm"><span className="ind-muted">{t("language")}</span>
        <select className="min-h-11 rounded border bg-background px-2 text-base" value={lang} onChange={(e) => changeLang(e.target.value)}>
          {STAFF_LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select></label>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <IndustryButton variant="secondary" aria-label={t("prev_period")} onClick={() => setPeriod((p) => shiftPeriod(p, -1))}><ChevronLeft className="h-4 w-4" /></IndustryButton>
      <div className="min-w-0 flex-1 text-center sm:flex-none sm:px-3">
        <div className="font-medium">{t("pay_period")} {periodLabel(period)}</div>
        <div className="ind-muted text-xs">{t("paid_25")}</div>
      </div>
      <IndustryButton variant="secondary" aria-label={t("next_period")} onClick={() => setPeriod((p) => shiftPeriod(p, 1))}><ChevronRight className="h-4 w-4" /></IndustryButton>
    </div>

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <IndustryRow edge="accent" className="flex-col items-start"><span className="ind-muted text-xs">{t("worked")}</span><strong className="ind-mono text-lg">{formatMinutes(totals.worked)}</strong></IndustryRow>
      <IndustryRow edge="neutral" className="flex-col items-start"><span className="ind-muted text-xs">{t("of_which_ob")}</span><strong className="ind-mono text-lg">{formatMinutes(totals.ob)}</strong></IndustryRow>
      <IndustryRow edge="neutral" className="flex-col items-start"><span className="ind-muted text-xs">{t("absence_days")}</span><strong className="ind-mono text-lg">{totals.absenceDays}</strong></IndustryRow>
      <IndustryRow edge={totals.pending ? "alert" : "neutral"} className="flex-col items-start"><span className="ind-muted text-xs">{t("not_done_days")}</span><strong className="ind-mono text-lg">{totals.pending}</strong></IndustryRow>
    </div>

    <section className="space-y-1">
      <SectionLabel>{t("day_by_day")}</SectionLabel>
      {loading ? <Loader2 className="h-5 w-5 animate-spin ind-muted" /> : null}
      {details.error ? <IndustryRow edge="alert"><span className="text-sm">{t("load_error")}</span></IndustryRow> : null}
      {!loading && !details.error && !days.length ? <IndustryRow edge="neutral"><CalendarDays className="h-4 w-4 ind-muted" /><span className="ind-muted text-sm">{t("no_time")}</span></IndustryRow> : null}
      {days.map((r) => {
        const ins = r.entries.filter((e) => e.type === "in");
        const outs = r.entries.filter((e) => e.type === "ut");
        const firstIn = (r.attest?.computed?.first_in as string | undefined) ?? ins[0]?.occurred_at ?? null;
        const lastOut = (r.attest?.computed?.last_out as string | undefined) ?? outs[outs.length - 1]?.occurred_at ?? null;
        const breakMin = Number(r.attest?.computed?.break_minutes ?? 0);
        const storeId = r.attest?.store_id ?? r.entries[0]?.store_id ?? null;
        const sk = r.attest ? STATUS_KEY[r.attest.status] : null;
        const status = sk ? { ...sk, label: t(sk.label) } : null;
        const absenceName = r.absence.map((a) => `${a.absence_requests?.absence_types?.name ?? t("absence")}${a.extent_pct && a.extent_pct < 100 ? ` ${a.extent_pct} %` : ""}`).join(", ");
        return <IndustryRow key={r.date} edge={r.attest?.status === "flagged" ? "alert" : r.absence.length ? "neutral" : "accent"} className="flex-wrap gap-x-4 gap-y-1">
          <span className="w-28 font-medium capitalize">{dayLabel(r.date)}</span>
          {firstIn || lastOut ? <span className="ind-mono">{hhmm(firstIn)}–{lastOut ? hhmm(lastOut) : t("missing")}</span> : null}
          {breakMin > 0 ? <span className="ind-mono ind-muted text-sm">{t("break")} {formatMinutes(breakMin)}</span> : null}
          {r.attest ? <span className="ind-mono font-medium">{formatMinutes(r.attest.approved_minutes ?? 0)} h</span> : null}
          {r.ob > 0 ? <span className="ind-mono text-sm">OB {formatMinutes(r.ob)}</span> : null}
          {storeId ? <span className="ind-muted text-sm">{details.data?.stores.get(storeId) ?? ""}</span> : null}
          {absenceName ? <StatusLabel tone="neutral">{absenceName}</StatusLabel> : null}
          {status ? <StatusLabel tone={status.tone}>{status.label}</StatusLabel> : r.entries.length && !r.absence.length ? <StatusLabel tone="neutral">{t("not_attested")}</StatusLabel> : null}
        </IndustryRow>;
      })}
    </section>
  </IndustryFrame>;
}
