import { ClipboardCheck, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDailyChecklist, weekdayName } from "@/hooks/useChecklist";

/** Kompakt klickbar checklisteruta för Översikt-vyn i butiksportalen. */
export function ChecklistCard({ storeId, onOpenFull }: { storeId: string; onOpenFull?: () => void }) {
  const { data, isLoading } = useDailyChecklist(storeId);

  const items = data?.items ?? [];
  const day = data?.day;
  const doneCount = items.filter((i) => i.done).length;
  const isCompleted = day?.status === "completed";

  return (
    <Card

        role="button"
        tabIndex={0}
        onClick={onOpenFull}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenFull?.();
          }
        }}
        className={cn(
          "shadow-card cursor-pointer transition-all hover:shadow-lg hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex flex-col justify-between gap-2 p-3 md:aspect-square md:p-5",
          isCompleted && "border-emerald-600/50 bg-emerald-500/5",
        )}
      >
        <div className="flex items-start justify-between">
          <ClipboardCheck className={cn("h-5 w-5 md:h-7 md:w-7", isCompleted ? "text-emerald-500" : "text-primary")} />
          <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
        </div>

        <div>
          <h3 className="font-heading text-base md:text-lg text-foreground">Checklista</h3>
          <p className="text-[11px] md:text-xs text-muted-foreground mt-0.5">
            {day ? weekdayName(day.checklist_date) : isLoading ? "Laddar…" : "Dagens checklista"}
          </p>
        </div>

        <div>
          <p className="font-mono tabular-nums text-xl md:text-2xl text-foreground">
            {doneCount} / {items.length}
          </p>
          <p className={cn("text-[11px] md:text-xs mt-0.5", isCompleted ? "text-emerald-500" : "text-muted-foreground")}>
            {isCompleted ? "Slutförd" : "uppgifter klara"}
          </p>
        </div>
    </Card>
  );

}
