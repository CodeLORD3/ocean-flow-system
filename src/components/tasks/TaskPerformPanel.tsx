import { useMemo, useState } from "react";
import { Camera, Check, MapPin, Pause, Play, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { minutesText, PAUSE_REASONS, RUN_STATUS_LABEL, standardMinutes, type RunStatus } from "@/lib/taskStandardTime";
import { missingRequirements, missingText, valueLabel } from "@/lib/taskRequirements";
import {
  useCheckpointResults,
  useFinishTask,
  useLogTaskAfterwards,
  usePauseTask,
  useResumeTask,
  useSaveCheckpoint,
  useStartTask,
  useTaskCheckpoints,
} from "@/hooks/useTaskRun";
import type { ResolvedNeed } from "@/hooks/useResources";
import { NeedsSheet } from "@/components/tasks/NeedsSheet";
import { TaskLiveTimer } from "@/components/tasks/TaskLiveTimer";
import { TaskPrepPanel } from "@/components/tasks/TaskPrepPanel";
import { TaskStepChecks } from "@/components/tasks/TaskStepChecks";
import { TaskRunFullscreen } from "@/components/tasks/TaskRunFullscreen";
import type { GuideStep } from "@/lib/taskGuide";
import { useCheckAllPresent, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";

type PerformTask = {
  id: string;
  task: string;
  done: boolean;
  run_status?: string | null;
  started_at?: string | null;
  actual_minutes?: number | null;
  active_minutes?: number | null;
  paused_minutes?: number | null;
  estimated_minutes?: number | null;
  template_item_id?: string | null;
  requires_photo?: boolean | null;
  requires_note?: boolean | null;
  requires_value?: boolean | null;
  value_label?: string | null;
  completion_note?: string | null;
  completion_value?: number | null;
  important_note?: string | null;
};

/**
 * GENOMFÖR — det läge personalen ser först. Starta uppgiften, bocka
 * kontrollpunkterna, skriv kommentar, lägg till bild och markera klar.
 * Instruktionen ligger i ett annat läge och är aldrig i vägen.
 */
export function TaskPerformPanel({
  task,
  timeLabel,
  areaName,
  photoCount,
  needs,
  storeId,
  guideSteps,
  onShowOnMap,
  onShowAllOnMap,
  onUpdate,
  onAddPhoto,
  onSetStepImage,
  onCompleted,
  onReopen,
  onStarted,
}: {
  task: PerformTask;
  timeLabel?: string | null;
  areaName?: string | null;
  photoCount: number;
  needs: ResolvedNeed[];
  storeId?: string | null;
  /** Stegen i arbetsbeskrivningen som ska bockas av. */
  guideSteps?: GuideStep[];
  onShowOnMap?: (zoneId: string) => void;
  /** Hela vägen på butikskartan. */
  onShowAllOnMap?: () => void;
  /** Vägen som gällde fryses när arbetet startas. */
  onStarted?: () => void;
  onUpdate: (patch: Record<string, unknown>) => void;
  onAddPhoto: (file: File) => Promise<void> | void;
  /** Bilden på ett steg i arbetsbeskrivningen. */
  onSetStepImage?: (stepIndex: number, file: File) => Promise<void> | void;
  /** Körs när uppgiften bockats av — tillbaka till uppgiftsflödet. */
  onCompleted?: () => void;
  onReopen: () => void;
}) {
  const status = (task.run_status ?? "ej_startad") as RunStatus;
  const { data: checkpoints = [] } = useTaskCheckpoints(task.template_item_id ?? null);
  const { data: results = [] } = useCheckpointResults(task.id);
  const saveCheckpoint = useSaveCheckpoint();
  const start = useStartTask();
  const pause = usePauseTask();
  const resume = useResumeTask();
  const finish = useFinishTask();
  const logAfter = useLogTaskAfterwards();
  const checkAll = useCheckAllPresent();
  const setStep = useSetStepCheck();
  const { data: staff } = useCurrentStaff();

  const [pauseReason, setPauseReason] = useState("kund");
  const [needsOpen, setNeedsOpen] = useState(false);
  const [afterOpen, setAfterOpen] = useState(false);
  const [afterMinutes, setAfterMinutes] = useState("");

  const std = standardMinutes(task);
  const missing = missingRequirements(task, { photoCount, checkPhoto: true });
  const checkedIds = useMemo(
    () => new Set(results.filter((r) => r.checked).map((r) => r.checkpoint_id ?? "")),
    [results],
  );
  const missingCheckpoints = checkpoints.filter((c) => c.required && !checkedIds.has(c.id));
  /** Utrustningen måste kontrolleras innan arbetet får bockas av. */
  const { data: prepChecks = [] } = useTaskPrepChecks(task.id);
  const prepCheckedIds = new Set(prepChecks.map((c) => c.requirement_id ?? ""));
  const prepMissing = needs.filter((n) => !prepCheckedIds.has(n.requirement.id));
  const steps = guideSteps ?? [];
  const doneSteps = new Set(prepChecks.filter((c) => c.step_no != null).map((c) => c.step_no));
  const stepsLeft = steps.length > 0 ? steps.length - doneSteps.size : 0;
  /** Alla steg måste vara gjorda — bild/kommentar/mätvärde och kontrollpunkter stoppar också. */
  const blocked = missing.length > 0 || missingCheckpoints.length > 0 || stepsLeft > 0;
  /** Utrustningen bockas av automatiskt när man trycker klar. */
  const autoRest = prepMissing.length;

  /** Helskärmsläget: ett steg i taget när arbetet görs. */
  const [runOpen, setRunOpen] = useState(false);
  const completeTask = async () => {
    try {
      if (prepMissing.length > 0) {
        await checkAll.mutateAsync({
          items: prepMissing.map((n) => ({
            checklistItemId: task.id,
            requirementId: n.requirement.id,
            resourceId: n.resource?.id ?? null,
            itemName: n.resource?.name ?? n.requirement.requirement_name,
            status: "finns" as const,
            staffId: staff?.id ?? null,
          })),
        });
      }
      await finish.mutateAsync({ id: task.id, startedAt: task.started_at ?? null });
      toast({ title: "Uppgiften är klar" });
      /** Tillbaka till flödet så nästa uppgift kan betas av direkt. */
      onCompleted?.();
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  const blockedText = missingCheckpoints.length > 0
    ? `Bocka ${missingCheckpoints.map((c) => c.label.toLowerCase()).join(" och ")} först.`
    : missing.length > 0
      ? missingText(task, missing)
      : autoRest > 0
        ? `${autoRest} rader bockas av när du trycker klar.`
        : undefined;

  if (task.done) {
    return (
      <Card className="space-y-3 p-4">
        <p className="text-lg font-semibold text-emerald-600">Uppgiften är klar</p>
        <div className="space-y-1 font-mono text-sm tabular-nums">
          {task.actual_minutes !== null && task.actual_minutes !== undefined && (
            <p>Total tid {minutesText(task.actual_minutes)}</p>
          )}
          {task.active_minutes !== null && task.active_minutes !== undefined && (
            <p>Aktiv arbetstid {minutesText(task.active_minutes)}</p>
          )}
          {!!task.paused_minutes && <p>Väntetid {minutesText(task.paused_minutes)}</p>}
          {std !== null && <p className="text-muted-foreground">Standardtid {minutesText(std)}</p>}
        </div>
        <Button variant="outline" size="lg" onClick={onReopen}>
          Återöppna
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {areaName && <span>{areaName}</span>}
          {timeLabel && <span>· {timeLabel}</span>}
          {std !== null && (
            <span className="inline-flex items-center gap-1">
              · <Timer className="h-3.5 w-3.5" /> Beräknad tid ca {minutesText(std)}
            </span>
          )}
          <span className={cn("ml-auto rounded px-2 py-0.5 text-xs", status === "pagar" ? "bg-emerald-500/10 text-emerald-600" : status === "pausad" ? "bg-amber-500/10 text-amber-700" : "bg-muted")}>
            {RUN_STATUS_LABEL[status]}
          </span>
        </div>

        {task.important_note && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{task.important_note}</p>
        )}

        {needs.length > 0 && (
          <div className="space-y-2">
            <TaskPrepPanel
              checklistItemId={task.id}
              storeId={storeId}
              needs={needs}
              onShowOnMap={onShowOnMap}
            />
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setNeedsOpen(true)}>
              <MapPin className="mr-1 h-3.5 w-3.5" /> Var finns det?
            </Button>
            <NeedsSheet
              open={needsOpen}
              onOpenChange={setNeedsOpen}
              needs={needs}
              onShowOnMap={onShowOnMap}
              onShowAll={onShowAllOnMap}
            />
          </div>
        )}

        {steps.length > 0 && (
          <TaskStepChecks
            checklistItemId={task.id}
            steps={steps}
            locked={status === "ej_startad"}
            onLockedClick={async () => {
              await start.mutateAsync(task.id);
              onStarted?.();
              toast({ title: "Uppgiften är startad", description: "Bocka av stegen ett i taget." });
            }}
          />
        )}

        {/* Pågående arbete: gå tillbaka in i helskärmsläget */}
        {status !== "ej_startad" && steps.length > 0 && (
          <Button
            className="h-12 w-full text-base font-semibold"
            onClick={() => setRunOpen(true)}
          >
            <Play className="mr-2 h-5 w-5" /> Gör uppgiften steg för steg
          </Button>
        )}

        {status === "ej_startad" && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              className="h-11 px-6 text-sm font-semibold"
              onClick={async () => {
                await start.mutateAsync(task.id);
                onStarted?.();
                if (steps.length > 0) setRunOpen(true);
                toast({ title: "Uppgiften är startad" });
              }}
            >
              <Play className="mr-2 h-4 w-4" /> Starta uppgift
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={() => setAfterOpen((v) => !v)}
            >
              Registrera i efterhand
            </Button>
            {afterOpen && (
              <div className="w-full space-y-2 rounded-lg border p-3">
                <label className="text-sm font-medium">Tog cirka … minuter</label>
                <Input
                  inputMode="numeric"
                  value={afterMinutes}
                  onChange={(e) => setAfterMinutes(e.target.value.replace(/[^0-9]/g, ""))}
                  className="h-14 text-xl"
                />
                <Button
                  size="lg"
                  className="w-full"
                  onClick={async () => {
                    if (blocked) {
                      toast({ title: "Något saknas", description: blockedText, variant: "destructive" });
                      return;
                    }
                    await logAfter.mutateAsync({ id: task.id, minutes: afterMinutes ? Number(afterMinutes) : null });
                    toast({ title: "Arbetet är registrerat" });
                  }}
                >
                  Spara som gjord
                </Button>
              </div>
            )}
          </div>
        )}

        {(status === "pagar" || status === "pausad") && (
          <TaskLiveTimer
            startedAt={task.started_at}
            running={status === "pagar"}
            pausedMinutes={task.paused_minutes}
          />
        )}

        {status === "pausad" && (
          <Button size="lg" className="h-14 w-full" onClick={() => resume.mutate(task.id)}>
            <Play className="mr-2 h-5 w-5" /> Fortsätt
          </Button>
        )}

        {status === "pagar" && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={pauseReason} onValueChange={setPauseReason}>
              <SelectTrigger className="h-12 w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAUSE_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="lg" className="h-12" onClick={() => pause.mutate({ id: task.id, reason: pauseReason })}>
              <Pause className="mr-1 h-4 w-4" /> Pausa
            </Button>
          </div>
        )}
      </Card>

      {checkpoints.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Fyll i när arbetet är klart
          </p>
          {checkpoints.map((c) => (
            <label key={c.id} className="flex min-h-[56px] items-center gap-3 rounded-lg border px-3">
              <Checkbox
                checked={checkedIds.has(c.id)}
                onCheckedChange={(v) =>
                  saveCheckpoint.mutate({ checklistItemId: task.id, checkpointId: c.id, label: c.label, checked: !!v })
                }
                className="h-6 w-6"
              />
              <span className="text-base">{c.label}</span>
              {!c.required && <span className="ml-auto text-xs text-muted-foreground">frivillig</span>}
            </label>
          ))}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        {task.requires_value && (
          <div>
            <label className="text-sm font-medium">{valueLabel(task)}</label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              defaultValue={task.completion_value ?? ""}
              onBlur={(e) => onUpdate({ completion_value: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-14 text-xl"
            />
          </div>
        )}
        <div>
          <label className="text-sm font-medium">Kommentar</label>
          <Textarea
            defaultValue={task.completion_note ?? ""}
            onBlur={(e) => onUpdate({ completion_note: e.target.value.trim() || null })}
            className="min-h-[70px]"
          />
        </div>
        <label className="inline-flex">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.currentTarget.value = "";
              for (const f of files) await onAddPhoto(f);
            }}
          />
          <span className="inline-flex h-14 cursor-pointer items-center gap-2 rounded-md border px-4 text-base hover:bg-muted">
            <Camera className="h-5 w-5" /> Lägg till bild {photoCount > 0 ? `(${photoCount})` : ""}
          </span>
        </label>

      </Card>

      {/* Klarknappen ligger still längst ned — följer inte med vid skroll. */}
      <div className="space-y-1 pt-1">
        <Button
          size="lg"
          disabled={blocked}
          title={blockedText}
          className="h-14 w-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
          onClick={completeTask}
        >
          <Check className="mr-2 h-5 w-5" /> MARKERA SOM KLAR
        </Button>
        {blockedText && <p className="text-center text-xs text-amber-700">{blockedText}</p>}
      </div>

      <TaskRunFullscreen
        open={runOpen}
        onClose={() => setRunOpen(false)}
        checklistItemId={task.id}
        taskName={task.task}
        steps={steps}
        photoCount={photoCount}
        requiresPhoto={task.requires_photo}
        blockedText={blockedText}
        onAddPhoto={onAddPhoto}
        onSetStepImage={onSetStepImage}
        onFinish={completeTask}
        prepMissingCount={prepMissing.length}
        prepNode={
          needs.length > 0 ? (
            <TaskPrepPanel
              checklistItemId={task.id}
              storeId={storeId}
              needs={needs}
              onShowOnMap={onShowOnMap}
            />
          ) : undefined
        }
      />
    </div>
  );
}
