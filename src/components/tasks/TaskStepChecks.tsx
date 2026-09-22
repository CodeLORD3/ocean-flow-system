import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/lib/taskGuide";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useClearStepCheck, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";

/** Kort rubrik ur stegtexten — samma princip som stegkorten. */
function stepTitle(text: string): string {
  const first = text.split(/[.!?]/)[0]?.split(",")[0]?.trim() || text.trim();
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** UTFÖRA — varje steg bockas av i tur och ordning. */
export function TaskStepChecks({
  checklistItemId,
  steps,
  locked = false,
  onLockedClick,
}: {
  checklistItemId: string;
  steps: GuideStep[];
  /** Innan uppgiften är startad går stegen inte att bocka av. */
  locked?: boolean;
  onLockedClick?: () => void;
}) {
  const { data: staff } = useCurrentStaff();
  const { data: checks = [] } = useTaskPrepChecks(checklistItemId);
  const setStep = useSetStepCheck();
  const clearStep = useClearStepCheck();

  if (steps.length === 0) return null;
  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));

  return (
    <Card className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide">Bocka av stegen</p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 font-mono text-xs tabular-nums",
            doneNos.size === steps.length ? "bg-emerald-500/10 text-emerald-700" : "bg-muted",
          )}
        >
          {doneNos.size} av {steps.length} klara
        </span>
      </div>
      {locked && (
        <p className="text-sm text-muted-foreground">
          Starta uppgiften först — tryck på ett steg så startar den.
        </p>
      )}
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const no = i + 1;
          const done = doneNos.has(no);
          return (
            <button
              key={no}
              type="button"
              onClick={() =>
                locked
                  ? onLockedClick?.()
                  : done
                  ? clearStep.mutate({ checklistItemId, stepNo: no })
                  : setStep.mutate({
                      checklistItemId,
                      stepNo: no,
                      stepTitle: stepTitle(s.text || `Steg ${no}`),
                      staffId: staff?.id ?? null,
                    })
              }
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-2 text-left",
                done ? "border-emerald-500/30 bg-emerald-500/5" : "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-sm tabular-nums",
                  done ? "border-emerald-600 bg-emerald-600 text-white" : "text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : no}
              </span>
              <span className={cn("min-w-0 flex-1 text-sm", done && "text-muted-foreground line-through")}>
                {stepTitle(s.text || `Steg ${no}`)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
