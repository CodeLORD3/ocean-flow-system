import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { IndustryRow, SectionLabel } from "@/components/industry";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

type Review = {
  pk_logged_time_id: string; status: string; work_date: string; employee_id: string | null; store_id: string | null;
  pk_start: string | null; pk_stop: string | null; own_start: string | null; own_stop: string | null;
  pk_minutes: number | null; own_minutes: number | null; pending: { pk_start?: string; pk_stop?: string; avbokad?: boolean } | null;
};
type Unlinked = { id: string; first_name: string | null; last_name: string | null; passes: number };

const tid = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" }) : "saknas";
const dag = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
const label: Record<string, string> = { konflikt: "Konflikt", saknar_utstampling: "Saknar utstämpling", vantar_attest: "Ändrad efter attest" };

/** PK-pass som kräver chefens beslut. `showUnlinked` visar även okopplade PK-personer (HR-kontroll, admin). */
export function PkReviewPanel({ showUnlinked = false }: { showUnlinked?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [pick, setPick] = useState<Record<string, string>>({});
  const { data } = useQuery({
    queryKey: ["pk-review", showUnlinked],
    queryFn: async () => {
      const rev = await supabase.from("pk_time_imports" as never)
        .select("pk_logged_time_id, status, work_date, employee_id, store_id, pk_start, pk_stop, own_start, own_stop, pk_minutes, own_minutes, pending")
        .in("status", ["konflikt", "saknar_utstampling", "vantar_attest"]).order("work_date");
      const ids = new Set<string>();
      ((rev.data ?? []) as unknown as Review[]).forEach((r) => r.employee_id && ids.add(r.employee_id));
      const emps = await supabase.from("employees").select("id, first_name, last_name").eq("is_test", false).eq("is_active", true).order("first_name");
      let unlinked: Unlinked[] = [];
      if (showUnlinked) {
        const u = await supabase.from("pk_time_imports" as never).select("identifier, pk_logged_time_id").eq("status", "ej_kopplad");
        const pkIds = ((u.data ?? []) as { pk_logged_time_id: string }[]).map((r) => r.pk_logged_time_id);
        if (pkIds.length) {
          const lt = await supabase.from("pk_logged_times").select("id, staff_url, connection_id").in("id", pkIds);
          const urls = [...new Set(((lt.data ?? []) as { staff_url: string }[]).map((r) => r.staff_url))];
          const st = await supabase.from("pk_staff").select("id, url, first_name, last_name").in("url", urls);
          unlinked = ((st.data ?? []) as { id: string; url: string; first_name: string | null; last_name: string | null }[]).map((s) => ({
            id: s.id, first_name: s.first_name, last_name: s.last_name,
            passes: ((lt.data ?? []) as { staff_url: string }[]).filter((r) => r.staff_url === s.url).length,
          }));
        }
      }
      return {
        rows: (rev.data ?? []) as unknown as Review[],
        employees: (emps.data ?? []) as { id: string; first_name: string; last_name: string }[],
        unlinked,
      };
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["pk-review"] }); qc.invalidateQueries({ queryKey: ["pk-import-status"] }); qc.invalidateQueries({ queryKey: ["attestations"] }); };
  const decide = async (id: string, decision: "pk" | "egen" | "andring") => {
    const { error } = await supabase.rpc("pk_import_decide" as never, { _pk_logged_time_id: id, _decision: decision } as never);
    if (error) toast({ title: "Kunde inte spara", description: error.message, variant: "destructive" });
    else toast({ title: "Sparat" });
    refresh();
  };
  const link = async (pkStaffId: string) => {
    const emp = pick[pkStaffId];
    if (!emp) return;
    const { error } = await supabase.rpc("pk_link_staff" as never, { _pk_staff_id: pkStaffId, _employee_id: emp } as never);
    if (error) toast({ title: "Kunde inte koppla", description: error.message, variant: "destructive" });
    else toast({ title: "Kopplad – passen har importerats" });
    refresh();
  };

  if (!data) return null;
  const name = (id: string | null) => { const e = data.employees.find((x) => x.id === id); return e ? `${e.first_name} ${e.last_name}` : "Okänd"; };
  if (!data.rows.length && !data.unlinked.length) return null;

  return (
    <section className="space-y-2">
      {data.unlinked.length > 0 && (
        <div>
          <SectionLabel>Ej kopplade i Personalkollen</SectionLabel>
          {data.unlinked.map((u) => (
            <IndustryRow key={u.id} className="flex-wrap gap-3">
              <span className="min-w-[200px] font-medium">{u.first_name} {u.last_name}</span>
              <span className="text-sm text-muted-foreground">{u.passes} pass väntar</span>
              <Select value={pick[u.id]} onValueChange={(v) => setPick((p) => ({ ...p, [u.id]: v }))}>
                <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="Välj befintlig anställd" /></SelectTrigger>
                <SelectContent>{data.employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" disabled={!pick[u.id]} onClick={() => link(u.id)}>Koppla</Button>
            </IndustryRow>
          ))}
        </div>
      )}
      {data.rows.length > 0 && (
        <div>
          <SectionLabel>PK-pass att granska</SectionLabel>
          {data.rows.map((r) => (
            <IndustryRow key={r.pk_logged_time_id} className="flex-wrap gap-3">
              <span className="min-w-[180px] font-medium">{name(r.employee_id)}</span>
              <span className="min-w-[90px] text-sm">{dag(r.work_date)}</span>
              <span className="text-sm font-semibold">{label[r.status] ?? r.status}</span>
              <span className="ind-mono text-sm tabular-nums">PK {tid(r.pk_start)}–{tid(r.pk_stop)}</span>
              {r.status === "konflikt" && <span className="ind-mono text-sm tabular-nums">Egen {tid(r.own_start)}–{tid(r.own_stop)}</span>}
              {r.status === "vantar_attest" && (
                <span className="ind-mono text-sm tabular-nums">
                  {r.pending?.avbokad ? "Avbokat i PK" : `Nytt i PK ${tid(r.pending?.pk_start)}–${tid(r.pending?.pk_stop)}`}
                </span>
              )}
              <span className="ml-auto flex gap-2">
                {r.status === "konflikt" && <>
                  <Button size="sm" variant="outline" onClick={() => decide(r.pk_logged_time_id, "egen")}>Välj egen</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r.pk_logged_time_id, "pk")}>Välj PK</Button>
                </>}
                {r.status === "vantar_attest" && <Button size="sm" onClick={() => decide(r.pk_logged_time_id, "andring")}>Godkänn ändringen</Button>}
                {r.status === "saknar_utstampling" && <span className="text-sm text-muted-foreground">Rätta sluttid i Personalkollen – läggs in automatiskt</span>}
              </span>
            </IndustryRow>
          ))}
        </div>
      )}
    </section>
  );
}
