import { useState } from "react";
import { Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useChecklistTemplates } from "@/hooks/useChecklist";
import { useMakeTaskRecurring, useSetStandardWeekdays, type TaskRow } from "@/hooks/useTasks";

const WEEKDAYS = [
  { iso: 1, label: "Mån" },
  { iso: 2, label: "Tis" },
  { iso: 3, label: "Ons" },
  { iso: 4, label: "Tor" },
  { iso: 5, label: "Fre" },
  { iso: 6, label: "Lör" },
  { iso: 7, label: "Sön" },
];

/**
 * Gör en uppgift återkommande: välj checklista och vilka dagar den ska komma
 * tillbaka. Tomt val betyder varje dag.
 */
export function TaskRecurrencePanel({
  task,
  storeId,
  currentWeekdays,
}: {
  task: TaskRow;
  storeId: string | null;
  currentWeekdays: number[];
}) {
  const { data: templates = [] } = useChecklistTemplates(storeId);
  const makeRecurring = useMakeTaskRecurring();
  const setWeekdays = useSetStandardWeekdays();
  const [days, setDays] = useState<number[]>(currentWeekdays);
  const [templateId, setTemplateId] = useState<string>("auto");

  const toggle = (iso: number) =>
    setDays((d) => (d.includes(iso) ? d.filter((x) => x !== iso) : [...d, iso].sort()));

  const recurring = !!task.template_item_id;

  const save = async () => {
    try {
      if (recurring) {
        await setWeekdays.mutateAsync({ templateItemId: task.template_item_id!, weekdays: days });
        toast({ title: "Dagarna sparade" });
      } else {
        if (!storeId) return;
        await makeRecurring.mutateAsync({
          taskId: task.id,
          storeId,
          templateId: templateId === "auto" ? null : templateId,
          weekdays: days,
        });
        toast({
          title: "Uppgiften är nu återkommande",
          description: days.length === 0 ? "Den kommer tillbaka varje dag." : "Den kommer tillbaka valda dagar.",
        });
      }
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {recurring
          ? "Uppgiften återkommer. Välj vilka dagar den ska finnas."
          : "Lägg uppgiften i en checklista så återkommer den valda dagar."}
      </p>
      {!recurring && (
        <Select value={templateId} onValueChange={setTemplateId}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Välj checklista" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Butikens vanliga checklista</SelectItem>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <div className="flex flex-wrap gap-2">
        {WEEKDAYS.map((d) => {
          const on = days.length === 0 || days.includes(d.iso);
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => toggle(d.iso)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm",
                on && days.includes(d.iso)
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "hover:bg-muted",
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {days.length === 0 ? "Inga dagar valda = varje dag." : `Gäller ${days.length} dagar i veckan.`}
      </p>
      <Button size="lg" className="h-12" onClick={save}>
        <Repeat className="mr-2 h-4 w-4" />
        {recurring ? "Spara dagarna" : "Gör återkommande"}
      </Button>
    </div>
  );
}
