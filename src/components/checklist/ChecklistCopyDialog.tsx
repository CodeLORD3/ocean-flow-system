import { useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useStores } from "@/hooks/useStores";
import {
  ChecklistTemplate,
  useCopyChecklistTemplate,
  useCopyChecklistTask,
} from "@/hooks/useChecklist";

type Props = {
  template: ChecklistTemplate;
  sourceStoreId: string | null;
  /** Sätt för att kopiera en enskild rad istället för hela checklistan. */
  item?: { section: string; task: string; time_label?: string | null; category?: string | null };
  date?: string;
  trigger?: React.ReactNode;
};

export function ChecklistCopyDialog({ template, sourceStoreId, item, date, trigger }: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const { data: stores = [] } = useStores(true);
  const copyTemplate = useCopyChecklistTemplate();
  const copyTask = useCopyChecklistTask();

  const targets = useMemo(
    () => stores.filter((s: any) => s.id !== sourceStoreId),
    [stores, sourceStoreId]
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const busy = copyTemplate.isPending || copyTask.isPending;

  const submit = async () => {
    try {
      if (item) {
        const n = await copyTask.mutateAsync({
          template,
          item,
          targetStoreIds: selected,
          date,
        });
        toast({ title: "Uppgift kopierad", description: `Skickad till ${n} butik(er).` });
      } else {
        const n = await copyTemplate.mutateAsync({
          template,
          sourceStoreId,
          targetStoreIds: selected,
        });
        toast({ title: "Checklista kopierad", description: `Skapad i ${n} butik(er).` });
      }
      setSelected([]);
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Kunde inte kopiera", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <Copy className="h-3.5 w-3.5" /> Kopiera till butik
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? "Vidarebefordra uppgift" : "Kopiera checklista"}</DialogTitle>
          <DialogDescription>
            {item
              ? `"${item.task}" läggs in i "${template.name}" hos valda butiker — även i dagens lista om den är öppen.`
              : `"${template.name}" kopieras med alla sina rader till valda butiker.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border p-2">
          {targets.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">Inga andra butiker tillgängliga.</p>
          ) : (
            targets.map((s: any) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/60"
              >
                <Checkbox checked={selected.includes(s.id)} onCheckedChange={() => toggle(s.id)} />
                <span className="text-sm text-foreground">{s.name}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSelected(selected.length === targets.length ? [] : targets.map((s: any) => s.id))}
          >
            {selected.length === targets.length ? "Avmarkera alla" : "Markera alla"}
          </Button>
          <Label className="text-[11px] text-muted-foreground">{selected.length} valda</Label>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Avbryt</Button>
          <Button size="sm" className="gap-1.5" disabled={busy || selected.length === 0} onClick={submit}>
            <Send className="h-3.5 w-3.5" /> {item ? "Skicka uppgift" : "Kopiera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
