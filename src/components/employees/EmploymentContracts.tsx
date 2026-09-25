import { useMemo, useState } from "react";
import { FileSignature, Plus, Trash2, ArrowUp, ArrowDown, Send, Eye, X, RotateCcw, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployments, employeeDocumentUrl, type Employee } from "@/hooks/useEmployees";
import {
  CONTRACT_STATUS, fillTemplate, useContractAction, useContractTemplates, useCreateContract,
  useDeleteContract, useEmploymentContracts, useUpdateContract, type ContractSection, type EmploymentContract,
} from "@/hooks/useEmploymentContracts";

function useNames() {
  return useQuery({
    queryKey: ["contract-ctx-names"],
    queryFn: async () => {
      const [le, st] = await Promise.all([
        supabase.from("legal_entities").select("legal_entity_id, legal_name, org_nr"),
        supabase.from("stores").select("id, name"),
      ]);
      return { le: (le.data ?? []) as any[], st: (st.data ?? []) as any[] };
    },
  });
}

const fmt = (t: string | null) => (t ? new Date(t).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "");

/** Anställningsavtal på den anställdes profil: skapa, redigera, skicka för BankID. */
export function EmploymentContracts({ employee }: { employee: Employee }) {
  const { toast } = useToast();
  const { data: contracts = [] } = useEmploymentContracts(employee.id);
  const { data: employments = [] } = useEmployments(employee.id);
  const { data: templates = [] } = useContractTemplates();
  const { data: names } = useNames();
  const create = useCreateContract();
  const [employmentId, setEmploymentId] = useState<string>("");
  const [editing, setEditing] = useState<string | null>(null);

  const chosenEmployment = employments.find((e) => e.id === (employmentId || employments[0]?.id)) ?? null;

  const makeDraft = async () => {
    const tpl = templates.find((t) => t.legal_entity_id === chosenEmployment?.legal_entity_id) ?? templates[0];
    if (!tpl) return toast({ title: "Ingen avtalsmall finns", variant: "destructive" });
    const le = names?.le.find((l) => l.legal_entity_id === chosenEmployment?.legal_entity_id);
    const st = names?.st.find((s) => s.id === chosenEmployment?.store_id);
    const sections = fillTemplate(tpl.sections, employee, chosenEmployment, {
      bolag: le?.legal_name ?? "", orgnr: le?.org_nr ?? "", butik: st?.name ?? "",
    });
    try {
      const c = await create.mutateAsync({ employee_id: employee.id, employment_id: chosenEmployment?.id ?? null, template_id: tpl.id, sections });
      setEditing(c.id);
    } catch (e: any) {
      toast({ title: "Avtalet kunde inte skapas", description: e.message, variant: "destructive" });
    }
  };

  const current = contracts.find((c) => c.id === editing);

  if (current) {
    const tpl = templates.find((t) => t.id === current.template_id);
    return <ContractEditor contract={current} templateSections={tpl?.sections ?? []} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        {employments.length > 1 && (
          <Select value={employmentId || employments[0]?.id} onValueChange={setEmploymentId}>
            <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Välj anställning" /></SelectTrigger>
            <SelectContent>
              {employments.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.job_title || "Anställning"} från {e.start_date ?? "okänt datum"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" onClick={makeDraft} disabled={create.isPending}>
          <Plus className="mr-2 h-4 w-4" /> Skapa anställningsavtal
        </Button>
        {employments.length === 0 && (
          <p className="text-xs text-muted-foreground">Lägg in en anställning först, så fylls lön och villkor i automatiskt.</p>
        )}
      </div>

      {contracts.length === 0 && <p className="text-sm text-muted-foreground">Inga avtal ännu.</p>}
      <div className="space-y-2">
        {contracts.map((c) => <ContractRow key={c.id} c={c} onOpen={() => setEditing(c.id)} />)}
      </div>
    </div>
  );
}

function statusTone(s: EmploymentContract["status"]) {
  if (s === "signerat") return "border-emerald-600/40 text-emerald-700";
  if (s === "avbrutet") return "border-destructive/40 text-destructive";
  if (s === "utkast") return "";
  return "border-amber-500/50 text-amber-700";
}

function ContractRow({ c, onOpen }: { c: EmploymentContract; onOpen: () => void }) {
  const { toast } = useToast();
  const openSigned = async () => {
    const url = c.signed_pdf_path ? await employeeDocumentUrl(c.signed_pdf_path) : null;
    if (url) window.open(url, "_blank"); else toast({ title: "Kunde inte öppna filen", variant: "destructive" });
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <FileSignature className="h-4 w-4 shrink-0 text-muted-foreground" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <p className="truncate text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted-foreground">
          Skapat {fmt(c.created_at)}{c.sent_at && ` · skickat ${fmt(c.sent_at)}`}{c.signed_at && ` · signerat ${fmt(c.signed_at)}`}
        </p>
        {c.signatories.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {c.signatories.map((s) => `${s.name}: ${s.signed_at ? "signerat" : "väntar"}`).join(" · ")}
          </p>
        )}
      </button>
      <Badge variant="outline" className={statusTone(c.status)}>{CONTRACT_STATUS[c.status]}</Badge>
      {c.signed_pdf_path && (
        <Button size="icon" variant="ghost" onClick={openSigned} aria-label="Öppna signerat avtal"><Download className="h-4 w-4" /></Button>
      )}
    </div>
  );
}

function ContractEditor({ contract, templateSections, onClose }: { contract: EmploymentContract; templateSections: ContractSection[]; onClose: () => void }) {
  const { toast } = useToast();
  const locked = contract.status !== "utkast";
  const [sections, setSections] = useState<ContractSection[]>(contract.sections);
  const update = useUpdateContract();
  const del = useDeleteContract();
  const action = useContractAction();
  const dirty = useMemo(() => JSON.stringify(sections) !== JSON.stringify(contract.sections), [sections, contract.sections]);

  const set = (i: number, patch: Partial<ContractSection>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: number) => setSections((s) => {
    const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const resetSection = (i: number) => {
    const orig = templateSections.find((t) => t.id === sections[i].id);
    if (orig) set(i, { title: orig.title, body: orig.body });
  };

  const save = async () => {
    await update.mutateAsync({ id: contract.id, sections });
    toast({ title: "Avtalet är sparat" });
  };

  const run = async (a: "send" | "cancel" | "preview" | "refresh") => {
    try {
      if (dirty && !locked) await update.mutateAsync({ id: contract.id, sections });
      const res = await action.mutateAsync({ contract_id: contract.id, action: a });
      if (a === "preview" && res?.url) window.open(res.url, "_blank");
      if (a === "send") toast({ title: "Avtalet är skickat", description: "Båda parter får ett mejl och skriver under med BankID." });
      if (a === "cancel") toast({ title: "Avtalet är avbrutet" });
    } catch (e: any) {
      toast({ title: "Det gick inte", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}><X className="mr-1 h-4 w-4" /> Tillbaka till avtalen</Button>
        <Badge variant="outline" className={statusTone(contract.status)}>{CONTRACT_STATUS[contract.status]}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => run("preview")} disabled={action.isPending}><Eye className="mr-1 h-4 w-4" /> Förhandsvisa PDF</Button>
          {!locked && <Button size="sm" variant="outline" onClick={save} disabled={!dirty || update.isPending}>Spara</Button>}
          {!locked && (
            <Button size="sm" onClick={() => { if (confirm("Skicka avtalet för underskrift? Det går inte att ändra efteråt.")) run("send"); }} disabled={action.isPending}>
              <Send className="mr-1 h-4 w-4" /> Skicka för underskrift
            </Button>
          )}
          {(contract.status === "skickat" || contract.status === "delvis_signerat") && (
            <>
              <Button size="sm" variant="outline" onClick={() => run("refresh")} disabled={action.isPending}><RefreshCw className="mr-1 h-4 w-4" /> Uppdatera status</Button>
              <Button size="sm" variant="destructive" onClick={() => { if (confirm("Avbryta avtalet?")) run("cancel"); }} disabled={action.isPending}>Avbryt avtalet</Button>
            </>
          )}
          {!locked && (
            <Button size="icon" variant="ghost" aria-label="Ta bort utkast" onClick={async () => { if (confirm("Ta bort utkastet?")) { await del.mutateAsync(contract.id); onClose(); } }}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
      {contract.error && <p className="rounded border border-destructive/40 p-2 text-xs text-destructive">{contract.error}</p>}
      {locked && <p className="text-xs text-muted-foreground">Avtalet är skickat och låst. En ändring görs som ett nytt avtal.</p>}

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="text-center text-base font-semibold">{contract.title}</h3>
        {sections.map((s, i) => (
          <div key={s.id + i} className="space-y-1 border-t border-border pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-1">
              <span className="w-6 font-mono text-xs text-muted-foreground">{i + 1}.</span>
              {locked ? <p className="flex-1 text-sm font-semibold">{s.title}</p> : (
                <Input className="h-8 flex-1 text-sm font-semibold" value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
              )}
              {!locked && (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} aria-label="Flytta upp"><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} aria-label="Flytta ner"><ArrowDown className="h-3.5 w-3.5" /></Button>
                  {templateSections.some((t) => t.id === s.id) && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => resetSection(i)} aria-label="Återställ till mallen" title="Återställ till mallens text"><RotateCcw className="h-3.5 w-3.5" /></Button>
                  )}
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSections((x) => x.filter((_, j) => j !== i))} aria-label="Ta bort avsnitt"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </>
              )}
            </div>
            {locked ? <p className="whitespace-pre-wrap pl-7 text-sm">{s.body}</p> : (
              <Textarea className="ml-7 w-[calc(100%-1.75rem)] text-sm" rows={Math.max(3, s.body.split("\n").length + 1)} value={s.body} onChange={(e) => set(i, { body: e.target.value })} />
            )}
          </div>
        ))}
        {!locked && (
          <Button size="sm" variant="outline" onClick={() => setSections((s) => [...s, { id: `eget-${Date.now()}`, title: "Nytt avsnitt", body: "" }])}>
            <Plus className="mr-1 h-4 w-4" /> Lägg till avsnitt
          </Button>
        )}
        <p className="pt-2 text-[11px] text-muted-foreground">{"{{personnummer}}"} fylls i när avtalet skapas som PDF.</p>
      </div>
    </div>
  );
}
