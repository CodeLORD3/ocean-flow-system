import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, Download, Link2, Loader2, RefreshCw, ShieldCheck, UserRound, X } from "lucide-react";
import { useEmployees, useAllEmployments, employeeName } from "@/hooks/useEmployees";

type PlanRow = {
  employee_number: string;
  fortnox_name: string | null;
  pnr_last4: string | null;
  inactive: boolean;
  action: "already_linked" | "link" | "no_match" | "no_employment";
  match_method: string | null;
  employee_id: string | null;
  makrilltrade_name: string | null;
  employment_id: string | null;
  current_number: string | null;
};

type LinkChoice = { employee_number: string; employee_id: string };

const actionLabel: Record<PlanRow["action"], string> = {
  already_linked: "Redan kopplad",
  link: "Matchad",
  no_match: "Ingen träff",
  no_employment: "Ingen anställning i bolaget",
};

export function FortnoxImportEmployeesDialog({
  legalEntityCode,
  entityName,
  disabled,
}: {
  legalEntityCode: string;
  entityName: string;
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [linking, setLinking] = useState(false);
  const { data: employees = [] } = useEmployees(false);
  const { data: employments = [] } = useAllEmployments();

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const eligibleIds = useMemo(
    () => new Set(employments.filter((e) => e.legal_entity_id === legalEntityCode).map((e) => e.employee_id)),
    [employments, legalEntityCode],
  );
  const employeeOptions = useMemo(
    () => employees
      .filter((e) => eligibleIds.has(e.id))
      .sort((a, b) => employeeName(a).localeCompare(employeeName(b), "sv")),
    [employees, eligibleIds],
  );

  const call = async (mode: "sync" | "plan" | "link", links?: LinkChoice[]) => {
    const { data, error } = await supabase.functions.invoke("fortnox-import-employees", {
      body: { legal_entity_code: legalEntityCode, mode, links },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const applyPlan = (data: any) => {
    const rows = (data.plan ?? []) as PlanRow[];
    setPlan(rows);
    setChoices(Object.fromEntries(rows.filter((r) => r.employee_id).map((r) => [r.employee_number, r.employee_id as string])));
    setSelected(new Set(rows.filter((r) => r.action === "link" && r.employee_id).map((r) => r.employee_number)));
  };

  const refreshPlan = async () => {
    setLoadingPlan(true);
    try {
      applyPlan(await call("plan"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte läsa anställda");
    } finally {
      setLoadingPlan(false);
    }
  };

  const syncEmployees = async () => {
    setSyncing(true);
    try {
      const data = await call("sync");
      applyPlan(data);
      toast.success(`${data.synced ?? 0} anställda hämtade från Fortnox`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte hämta anställda från Fortnox");
    } finally {
      setSyncing(false);
    }
  };

  const linkSelected = async () => {
    const links = plan
      .filter((r) => selected.has(r.employee_number))
      .map((r) => ({ employee_number: r.employee_number, employee_id: choices[r.employee_number] }))
      .filter((r): r is LinkChoice => !!r.employee_id);
    if (!links.length) return toast.error("Välj minst en matchad anställd");

    setLinking(true);
    try {
      const data = await call("link", links);
      applyPlan(data);
      qc.invalidateQueries({ queryKey: ["employments"] });
      toast.success(`${data.summary?.linked ?? 0} anställningar kopplades`);
      if (data.summary?.failed) toast.error(`${data.summary.failed} kopplingar misslyckades`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte koppla anställda");
    } finally {
      setLinking(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plan;
    return plan.filter((r) => [r.fortnox_name, r.makrilltrade_name, r.employee_number, r.pnr_last4]
      .filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [plan, search]);

  const counts = useMemo(() => ({
    missing: plan.filter((r) => r.action !== "already_linked").length,
    matched: plan.filter((r) => r.action === "link").length,
    noMatch: plan.filter((r) => r.action === "no_match" || r.action === "no_employment").length,
    selected: selected.size,
  }), [plan, selected]);

  const toggle = (number: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(number)) next.delete(number); else next.add(number);
    return next;
  });

  const setChoice = (row: PlanRow, employeeId: string) => {
    setChoices((prev) => ({ ...prev, [row.employee_number]: employeeId }));
    setSelected((prev) => new Set(prev).add(row.employee_number));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">FSAB:s personal från Fortnox</div>
          <div className="text-xs text-muted-foreground">Fortnox är master. Inga ändringar skrivs tillbaka till Fortnox.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={disabled || syncing} onClick={() => void syncEmployees()}>
            {syncing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />}
            Hämta från Fortnox
          </Button>
          <Button size="sm" variant="outline" disabled={disabled || loadingPlan} onClick={() => void refreshPlan()}>
            {loadingPlan ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
            Läs in matchningar
          </Button>
        </div>
      </div>

      {!plan.length ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Klicka på <strong>Hämta från Fortnox</strong> för att börja steg 1.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Saknar koppling: {counts.missing}</Badge>
            <Badge variant="outline">Matchade: {counts.matched}</Badge>
            <Badge variant="outline">Behöver åtgärd: {counts.noMatch}</Badge>
            <Badge variant="outline">Valda: {counts.selected}</Badge>
            <Input className="ml-auto h-8 max-w-xs" placeholder="Sök namn eller nummer…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Personnummer används bara för säker matchning. Endast de fyra sista siffrorna visas.</span>
            <Button size="sm" variant="outline" disabled={counts.matched === 0} onClick={() => setSelected(new Set(plan.filter((r) => r.action === "link").map((r) => r.employee_number)))}>
              <ShieldCheck className="mr-1 h-3 w-3" /> Välj säkra träffar
            </Button>
          </div>

          <div className="divide-y divide-border rounded-md border border-border">
            {filtered.map((row) => {
              const canLink = row.action === "link" || row.action === "no_match";
              const selectedRow = selected.has(row.employee_number);
              const selectedEmployee = employeeById.get(choices[row.employee_number]);
              return (
                <div key={row.employee_number} className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm">
                  <Checkbox checked={selectedRow} disabled={!canLink || !choices[row.employee_number]} onCheckedChange={() => toggle(row.employee_number)} aria-label={`Välj ${row.fortnox_name ?? row.employee_number}`} />
                  <div className="min-w-[180px] flex-1">
                    <div className="font-medium">{row.fortnox_name || "Namnlös i Fortnox"}</div>
                    <div className="font-mono text-xs text-muted-foreground">Fortnox #{row.employee_number}{row.pnr_last4 ? ` · personnummer …${row.pnr_last4}` : ""}</div>
                  </div>
                  <div className="min-w-[220px] flex-1">
                    {canLink ? (
                      <Select value={choices[row.employee_number] ?? ""} onValueChange={(value) => setChoice(row, value)}>
                        <SelectTrigger className="h-8"><SelectValue placeholder="Välj personal i Makrilltrade" /></SelectTrigger>
                        <SelectContent>
                          {employeeOptions.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employeeName(employee)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground"><UserRound className="h-3 w-3" />{row.makrilltrade_name || "Ingen matchning"}</div>
                    )}
                    {selectedEmployee && row.match_method && <div className="mt-1 text-[11px] text-muted-foreground">Förslag via {row.match_method === "pnr" ? "personnummer" : "namn"}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.action === "already_linked" ? "default" : row.action === "link" ? "secondary" : "destructive"}>
                      {row.action === "already_linked" ? <Check className="mr-1 h-3 w-3" /> : row.action === "link" ? <Link2 className="mr-1 h-3 w-3" /> : <X className="mr-1 h-3 w-3" />}
                      {actionLabel[row.action]}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">Kopplingen fyller Fortnox-numret på den aktiva anställningen i {entityName}.</div>
            <Button disabled={linking || selected.size === 0} onClick={() => void linkSelected()}>
              {linking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Link2 className="mr-1 h-4 w-4" />}
              Koppla valda ({selected.size})
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
