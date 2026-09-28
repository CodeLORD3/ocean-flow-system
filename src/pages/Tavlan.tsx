import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAiUppgifter, useSaveAiUppgift, UPPGIFT_STATUS, fmtDateTime, type AiUppgift } from "@/hooks/useAiTeam";
import { AiTriggerAdmin } from "@/components/ai/AiTriggerAdmin";

const ALL = "__alla";
type Draft = Partial<AiUppgift>;

export default function Tavlan() {
  const { data = [], isLoading, error } = useAiUppgifter();
  const save = useSaveAiUppgift();
  const [tilldelad, setTilldelad] = useState(ALL);
  const [draft, setDraft] = useState<Draft | null>(null);

  const personer = Array.from(new Set(data.map((d) => d.tilldelad).filter(Boolean))) as string[];
  const list = data.filter((d) => tilldelad === ALL || d.tilldelad === tilldelad);

  const submit = async () => {
    if (!draft?.uppgift?.trim()) return toast.error("Uppgiften behöver en text.");
    const { id, tilldelad: t, uppgift, prioritet, deadline, underlag, status, resultat } = draft;
    const payload: Draft = id
      ? { id, status, resultat }
      : { tilldelad: t || null, uppgift, prioritet: prioritet ?? 3, deadline: deadline || null, underlag: underlag || null, skapad_av: "vd" };
    try {
      await save.mutateAsync(payload);
      toast.success(id ? "Uppgiften uppdaterad" : "Uppgiften skapad");
      setDraft(null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold mr-auto">Tavlan</h1>
        <Select value={tilldelad} onValueChange={setTilldelad}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Alla tilldelade</SelectItem>
            {personer.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setDraft({ prioritet: 3 })}>Ny uppgift</Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Laddar…</p>}
      {error && <p className="text-sm text-destructive">Kunde inte hämta uppgifter.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(["väntar på vd", "öppen", "pågår", "klar"] as const).map((s) => {
          const col = list
            .filter((d) => (d.status ?? "öppen") === s)
            .sort(
              (a, b) =>
                (a.prioritet ?? 9) - (b.prioritet ?? 9) ||
                (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"),
            );
          return (
            <div key={s} className="rounded-lg border bg-muted/30 p-2 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-medium capitalize">{s}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{col.length}</span>
              </div>
              {col.length === 0 && <p className="text-xs text-muted-foreground px-1">Tomt</p>}
              {col.map((d) => (
                <button key={d.id} onClick={() => setDraft(d)} className="w-full text-left rounded-md border bg-card p-2 hover:border-primary">
                  <div className="text-sm font-medium line-clamp-3">{d.uppgift}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline">P{d.prioritet ?? 3}</Badge>
                    {d.tilldelad && <span>{d.tilldelad}</span>}
                    {d.deadline && <span>Deadline {fmtDateTime(d.deadline)}</span>}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <AiTriggerAdmin />


      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{draft?.id ? "Uppgift" : "Ny uppgift"}</DialogTitle></DialogHeader>
          {draft && (
            draft.id ? (
              <div className="space-y-3">
                <p className="text-sm whitespace-pre-wrap">{draft.uppgift}</p>
                <p className="text-xs text-muted-foreground">
                  {[draft.tilldelad, draft.skapad_av && `av ${draft.skapad_av}`, fmtDateTime(draft.skapad ?? null)].filter(Boolean).join(" · ")}
                </p>
                {draft.underlag && <div><Label>Underlag</Label><p className="text-sm whitespace-pre-wrap">{draft.underlag}</p></div>}
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={draft.status ?? "öppen"} onValueChange={(v) => setDraft({ ...draft, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{UPPGIFT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Resultat</Label>
                  <Textarea className="min-h-[140px]" value={draft.resultat ?? ""} onChange={(e) => setDraft({ ...draft, resultat: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1"><Label>Tilldelad</Label>
                  <Input value={draft.tilldelad ?? ""} onChange={(e) => setDraft({ ...draft, tilldelad: e.target.value })} /></div>
                <div className="space-y-1"><Label>Uppgift</Label>
                  <Textarea value={draft.uppgift ?? ""} onChange={(e) => setDraft({ ...draft, uppgift: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Prioritet (1 högst)</Label>
                    <Input type="number" min={1} max={5} value={draft.prioritet ?? 3} onChange={(e) => setDraft({ ...draft, prioritet: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>Deadline</Label>
                    <Input type="datetime-local" value={draft.deadline ?? ""} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>Underlag</Label>
                  <Textarea value={draft.underlag ?? ""} onChange={(e) => setDraft({ ...draft, underlag: e.target.value })} /></div>
              </div>
            )
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Stäng</Button>
            <Button onClick={submit} disabled={save.isPending}>Spara</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
