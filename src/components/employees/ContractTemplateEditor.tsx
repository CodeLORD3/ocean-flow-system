import { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useContractTemplates, useSaveContractTemplate, type ContractSection } from "@/hooks/useEmploymentContracts";

const FIELDS = "{{bolag}} {{orgnr}} {{namn}} {{personnummer}} {{adress}} {{befattning}} {{butik}} {{anstallningsform}} {{startdatum}} {{slutdatum_text}} {{provanstallning_text}} {{sysselsattning}} {{lon}} {{ob_text}} {{semesterdagar}} {{avtalsomrade}}";

/** Redigera mallen för anställningsavtal. Nya avtal utgår från den senaste versionen. */
export function ContractTemplateEditor() {
  const { toast } = useToast();
  const { data: templates = [] } = useContractTemplates();
  const save = useSaveContractTemplate();
  const tpl = templates[0];
  const [sections, setSections] = useState<ContractSection[]>([]);
  useEffect(() => { if (tpl) setSections(tpl.sections); }, [tpl]);
  if (!tpl) return <p className="text-sm text-muted-foreground">Ingen mall finns.</p>;

  const set = (i: number, p: Partial<ContractSection>) => setSections((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: number) => setSections((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{tpl.name} <span className="font-mono text-xs text-muted-foreground">version {tpl.version}</span></p>
      <p className="text-xs text-muted-foreground">Mallen är ett förslag och behöver granskas innan den används. Fält som fylls i automatiskt: {FIELDS}</p>
      {sections.map((s, i) => (
        <div key={s.id + i} className="space-y-1 rounded border border-border p-2">
          <div className="flex items-center gap-1">
            <Input className="h-8 flex-1 text-sm font-semibold" value={s.title} onChange={(e) => set(i, { title: e.target.value })} />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} aria-label="Flytta upp"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} aria-label="Flytta ner"><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSections((x) => x.filter((_, j) => j !== i))} aria-label="Ta bort"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          </div>
          <Textarea className="text-sm" rows={Math.max(3, s.body.split("\n").length + 1)} value={s.body} onChange={(e) => set(i, { body: e.target.value })} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setSections((s) => [...s, { id: `avsnitt-${Date.now()}`, title: "Nytt avsnitt", body: "" }])}><Plus className="mr-1 h-4 w-4" /> Lägg till avsnitt</Button>
        <Button size="sm" disabled={save.isPending} onClick={async () => {
          try { await save.mutateAsync({ id: tpl.id, sections, version: tpl.version }); toast({ title: "Mallen är sparad" }); }
          catch (e: any) { toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" }); }
        }}>Spara mallen</Button>
      </div>
    </div>
  );
}
