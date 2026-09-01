import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Loader2, Plus, Save, Settings2 } from "lucide-react";
import { IndustryButton, IndustryFrame, IndustryInput, IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";
import { ShiftTemplatesPanel } from "@/components/staff/ShiftTemplatesPanel";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WorkRule { id: string; rule_key: string; name: string; value_numeric: number | null; value_text: string | null; unit: string | null; legal_source: string | null; agreement_source: string | null; is_unverified: boolean; version: number; valid_from: string; note: string | null; }
interface ObWindow { id: string; name: string; day_kind: string; start_time: string; end_time: string; pct: number; wage_code_id: string | null; agreement_source: string | null; }
interface Holiday { id: string; holiday_date: string; name: string; is_major_holiday: boolean; treated_as: string; note: string | null; }
interface WageCode { id: string; code: string; name: string; kind: string; is_active: boolean; }
interface WorkSite { id: string; name: string; posting_cost_center: string; ledger_required: string; geofence_radius_m: number; allow_mobile_punch: boolean; is_active: boolean; }

function useStaffRulesData() {
  return useQuery({
    queryKey: ["staff-rules-settings"],
    queryFn: async () => {
      const [rules, windows, holidays, wages, sites] = await Promise.all([
        supabase.from("work_rules").select("*").order("rule_key"),
        supabase.from("ob_windows").select("*").order("sort_order"),
        supabase.from("payroll_holidays").select("*").order("holiday_date"),
        supabase.from("wage_codes").select("*").order("code"),
        supabase.from("work_sites").select("*").order("sort_order"),
      ]);
      for (const result of [rules, windows, holidays, wages, sites]) if (result.error) throw result.error;
      return { rules: (rules.data ?? []) as WorkRule[], windows: (windows.data ?? []) as ObWindow[], holidays: (holidays.data ?? []) as Holiday[], wages: (wages.data ?? []) as WageCode[], sites: (sites.data ?? []) as WorkSite[] };
    },
  });
}

export default function StaffRules() {
  const qc = useQueryClient();
  const { data, isLoading } = useStaffRulesData();
  const [holiday, setHoliday] = useState({ date: "", name: "", major: false });
  const [saving, setSaving] = useState(false);
  const rules = data?.rules ?? [];
  const windows = data?.windows ?? [];
  const holidays = data?.holidays ?? [];
  const wages = data?.wages ?? [];
  const sites = data?.sites ?? [];
  const wageById = useMemo(() => new Map(wages.map((w) => [w.id, w.code])), [wages]);

  const updateRule = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number | null }) => {
      const { error } = await supabase.from("work_rules").update({ value_numeric: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-rules-settings"] }),
  });

  /** Liggarplikten måste beslutas per driftställe, inte lämnas som "utred". */
  const updateLedger = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: string }) => {
      const { error } = await supabase
        .from("work_sites")
        .update({ ledger_required: value as "ja" | "nej" | "utred" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["staff-rules-settings"] });
      toast.success("Liggarplikten uppdaterad");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Kunde inte spara liggarplikten"),
  });

  const addHoliday = async () => {
    if (!holiday.date || !holiday.name.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("payroll_holidays").insert({ holiday_date: holiday.date, name: holiday.name.trim(), is_major_holiday: holiday.major });
      if (error) throw error;
      setHoliday({ date: "", name: "", major: false });
      await qc.invalidateQueries({ queryKey: ["staff-rules-settings"] });
      toast.success("Helgdag sparad");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Kunde inte spara helgdagen"); }
    finally { setSaving(false); }
  };

  return (
    <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
      <div>
        <SectionLabel>Personal · regelmotor</SectionLabel>
        <h1 className="ind-h1">Regler, OB & driftställen</h1>
        <p className="ind-muted mt-1 text-sm">Reglerna är data, versionerade och kan granskas innan de används i löneunderlaget.</p>
      </div>
      {isLoading ? <Loader2 className="h-5 w-5 animate-spin ind-muted" /> : (
        <Tabs defaultValue="rules" className="space-y-5">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1">
            <TabsTrigger value="rules"><Settings2 className="mr-2 h-4 w-4" />Arbetstidsregler</TabsTrigger>
            <TabsTrigger value="ob">OB & lönearter</TabsTrigger>
            <TabsTrigger value="sites">Driftställen</TabsTrigger>
            <TabsTrigger value="holidays"><CalendarDays className="mr-2 h-4 w-4" />Helgdagar</TabsTrigger>
            <TabsTrigger value="templates">Passmallar</TabsTrigger>
          </TabsList>
          <TabsContent value="rules" className="space-y-1">
            <SectionLabel>Versionerade regler</SectionLabel>
            {rules.map((rule) => (
              <IndustryRow key={rule.id} edge={rule.is_unverified ? "accent-2" : "neutral"} className="flex-wrap">
                <div className="min-w-[260px] flex-1"><p className="font-medium">{rule.name}</p><p className="ind-muted text-xs">{rule.rule_key} · v{rule.version} · {rule.legal_source ?? rule.agreement_source ?? "Intern regel"}</p></div>
                <div className="flex items-center gap-2"><IndustryInput className="w-28" type="number" step="0.01" defaultValue={rule.value_numeric ?? ""} onBlur={(e) => updateRule.mutate({ id: rule.id, value: e.target.value === "" ? null : Number(e.target.value) })} /><span className="ind-muted text-sm">{rule.unit ?? ""}</span></div>
                {rule.is_unverified && <StatusLabel tone="progress">Overifierad</StatusLabel>}
              </IndustryRow>
            ))}
          </TabsContent>
          <TabsContent value="ob" className="space-y-5">
            <section className="space-y-1"><SectionLabel>OB-fönster · minutbaserat</SectionLabel>{windows.map((window) => <IndustryRow key={window.id} edge="accent" className="flex-wrap"><div className="min-w-[240px] flex-1"><p className="font-medium">{window.name}</p><p className="ind-muted text-xs">{window.day_kind} · {window.start_time.slice(0, 5)}–{window.end_time.slice(0, 5)} · {window.agreement_source ?? ""}</p></div><strong className="ind-mono">{window.pct} %</strong><StatusLabel tone={window.wage_code_id ? "ok" : "alert"}>{window.wage_code_id ? `Löneart ${wageById.get(window.wage_code_id) ?? "kopplad"}` : "Löneart saknas"}</StatusLabel></IndustryRow>)}</section>
            <section className="space-y-1"><SectionLabel>Lönearter</SectionLabel>{wages.map((wage) => <IndustryRow key={wage.id}><span className="ind-mono w-24">{wage.code}</span><span>{wage.name}</span><StatusLabel tone={wage.is_active ? "ok" : "neutral"}>{wage.is_active ? "Aktiv" : "Inaktiv"}</StatusLabel></IndustryRow>)}</section>
          </TabsContent>
          <TabsContent value="sites" className="space-y-3">
            <div>
              <SectionLabel>Kontering och liggarplikt per driftställe</SectionLabel>
              <p className="ind-muted mt-1 text-xs">
                Liggarplikten ska beslutas per driftställe. Så länge ett driftställe står som "Utred" är det oklart om
                personalliggaren måste kunna visas vid kontroll.
              </p>
            </div>
            <div className="space-y-1">
              {sites.map((site) => (
                <IndustryRow key={site.id} edge={site.ledger_required === "utred" ? "accent-2" : "neutral"} className="flex-wrap">
                  <div className="min-w-[200px] flex-1">
                    <p className="font-medium">{site.name}</p>
                    <p className="ind-muted text-xs">
                      Platslås {site.geofence_radius_m} m · {site.allow_mobile_punch ? "Mobil tillåten" : "Endast terminal"}
                    </p>
                  </div>
                  <span className="ind-mono font-semibold">KST {site.posting_cost_center}</span>
                  <div className="flex items-center gap-1">
                    {(["ja", "nej", "utred"] as const).map((option) => (
                      <IndustryButton
                        key={option}
                        variant={site.ledger_required === option ? "primary" : "secondary"}
                        disabled={updateLedger.isPending}
                        onClick={() => updateLedger.mutate({ id: site.id, value: option })}
                      >
                        {option === "ja" ? "Liggarplikt" : option === "nej" ? "Ingen plikt" : "Utred"}
                      </IndustryButton>
                    ))}
                  </div>
                  <StatusLabel tone={site.ledger_required === "ja" ? "ok" : site.ledger_required === "utred" ? "progress" : "neutral"}>
                    {site.ledger_required === "utred" ? "Beslut saknas" : `Liggarplikt: ${site.ledger_required}`}
                  </StatusLabel>
                </IndustryRow>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="holidays" className="space-y-4"><div className="flex flex-wrap items-end gap-2"><div><SectionLabel>Datum</SectionLabel><IndustryInput type="date" value={holiday.date} onChange={(e) => setHoliday((v) => ({ ...v, date: e.target.value }))} /></div><div><SectionLabel>Namn</SectionLabel><IndustryInput placeholder="T.ex. Julafton" value={holiday.name} onChange={(e) => setHoliday((v) => ({ ...v, name: e.target.value }))} /></div><IndustryButton variant="primary" corners disabled={saving} onClick={addHoliday}><Plus className="h-4 w-4" />Lägg till</IndustryButton></div><div className="space-y-1">{holidays.map((item) => <IndustryRow key={item.id} className="flex-wrap"><span className="ind-mono w-28">{item.holiday_date}</span><span className="flex-1">{item.name}</span>{item.is_major_holiday && <StatusLabel tone="progress">Storhelg</StatusLabel>}</IndustryRow>)}</div></TabsContent>
          <TabsContent value="templates" className="mt-5"><ShiftTemplatesPanel /></TabsContent>
        </Tabs>
      )}
      <p className="ind-muted text-xs"><Save className="mr-1 inline h-3.5 w-3.5" />Ändringar i regelvärden sparas när du lämnar fältet. Nivån för övertid är fortsatt markerad som overifierad tills avtalet är bekräftat.</p>
    </IndustryFrame>
  );
}
