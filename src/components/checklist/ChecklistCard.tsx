import { ClipboardCheck, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useDailyChecklist, useToggleChecklistItem, weekdayName } from "@/hooks/useChecklist";

/** Kompakt checklisteruta för Översikt-vyn i butiksportalen. */
export function ChecklistCard({ storeId, onOpenFull }: { storeId: string; onOpenFull?: () => void }) {
  const { data, isLoading } = useDailyChecklist(storeId);
  const toggle = useToggleChecklistItem();

  const items = data?.items ?? [];
  const day = data?.day;
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  const isCompleted = day?.status === "completed";
  const next = items.filter((i) => !i.done).slice(0, 6);
  const visible = next.length > 0 ? next : items.slice(0, 6);

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-heading flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4 text-primary" /> Dagens checklista
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {day ? `${weekdayName(day.checklist_date)} ${day.checklist_date}` : "Laddar…"}
              {isCompleted && " — slutförd"}
            </p>
          </div>
          {onOpenFull && (
            <Button variant="outline" size="sm" onClick={onOpenFull}>
              Öppna <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Progress value={pct} className="h-2" />
          <p className="text-[11px] text-muted-foreground mt-1">
            {doneCount} av {items.length} klara ({pct}%)
          </p>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground">Laddar checklista…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen checklistemall är upplagd.</p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border overflow-hidden">
            {visible.map((item) => (
              <div
                key={item.id}
                className={cn("flex items-center gap-2 px-2.5 py-1.5", item.done && "bg-emerald-500/10")}
              >
                <Checkbox
                  checked={item.done}
                  disabled={isCompleted}
                  onCheckedChange={(v) => toggle.mutate({ id: item.id, done: !!v })}
                  className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                  aria-label={`Markera klar: ${item.task}`}
                />
                <span className="font-mono tabular-nums text-[11px] text-muted-foreground w-10">
                  {item.time_label || "–"}
                </span>
                <span className="text-xs text-foreground truncate flex-1">{item.task}</span>
                <span className="text-[11px] font-semibold text-muted-foreground w-7 text-right">
                  {item.signature || "–"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
