import { useState } from "react";
import { RotateCcw, Loader2, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useArchivedChecklistTemplates,
  useHiddenChecklistTasks,
  useRestoreChecklistTask,
  useRestoreChecklistTemplate,
  type HiddenChecklistTask,
} from "@/hooks/useChecklist";

/**
 * Admin-verktyg: återställer checklistor och uppgifter som någon råkat ta bort.
 * `templateId`/`dayId` sätts när dialogen öppnas inne i en enskild checklista.
 */
export function ChecklistRestoreDialog({
  storeId,
  templateId,
  dayId,
  triggerLabel = "Återställ borttaget",
  onlyTasks = false,
}: {
  storeId: string;
  templateId?: string | null;
  dayId?: string | null;
  triggerLabel?: string;
  onlyTasks?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { data: archived = [], isLoading: aLoading } = useArchivedChecklistTemplates(storeId, open);
  const { data: hidden = [], isLoading: hLoading } = useHiddenChecklistTasks(storeId, templateId, open);

  const restoreTpl = useRestoreChecklistTemplate();
  const restoreTask = useRestoreChecklistTask();

  const handleRestoreTemplate = async (id: string, name: string) => {
    try {
      await restoreTpl.mutateAsync(id);
      toast.success(`"${name}" återställdes`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte återställa checklistan");
    }
  };

  const handleRestoreTask = async (row: HiddenChecklistTask) => {
    try {
      await restoreTask.mutateAsync({ row, dayId: dayId ?? null });
      toast.success(`"${row.task}" återställdes`);
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte återställa uppgiften");
    }
  };

  const taskList = (
    <div className="space-y-2">
      {hLoading ? (
        <p className="text-xs text-muted-foreground">Laddar…</p>
      ) : hidden.length === 0 ? (
        <p className="text-xs text-muted-foreground">Inga borttagna uppgifter att återställa.</p>
      ) : (
        hidden.map((row) => (
          <div
            key={row.id}
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{row.task}</p>
              <p className="text-[11px] text-muted-foreground">
                {row.section}
                {row.time_label ? ` · ${row.time_label}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 gap-1 text-xs"
              disabled={restoreTask.isPending}
              onClick={() => handleRestoreTask(row)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Återställ
            </Button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
          <ArchiveRestore className="h-3.5 w-3.5" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Återställ borttaget</DialogTitle>
          <DialogDescription>
            Admin kan ta tillbaka checklistor och uppgifter som tagits bort av misstag.
          </DialogDescription>
        </DialogHeader>

        {onlyTasks ? (
          <div className="max-h-[60vh] overflow-y-auto pr-1">{taskList}</div>
        ) : (
          <Tabs defaultValue="lists">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="lists" className="text-xs">
                Checklistor ({archived.length})
              </TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs">
                Uppgifter ({hidden.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="lists" className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
              {aLoading ? (
                <p className="text-xs text-muted-foreground">Laddar…</p>
              ) : archived.length === 0 ? (
                <p className="text-xs text-muted-foreground">Inga borttagna checklistor.</p>
              ) : (
                <div className="space-y-2">
                  {archived.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t.store_id ? "Butikens egen lista" : "Global mall"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 gap-1 text-xs"
                        disabled={restoreTpl.isPending}
                        onClick={() => handleRestoreTemplate(t.id, t.name)}
                      >
                        {restoreTpl.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Återställ
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="tasks" className="mt-3 max-h-[55vh] overflow-y-auto pr-1">
              {taskList}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
