import { useEffect, useState } from "react";
import { Camera, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GuideStep } from "@/lib/taskGuide";
import { useCurrentStaff } from "@/hooks/useCurrentStaff";
import { useClearStepCheck, useSetStepCheck, useTaskPrepChecks } from "@/hooks/useTaskPrep";

/** Kort rubrik ur stegtexten. */
function stepTitle(text: string): string {
  const first = text.split(/[.!?]/)[0]?.split(",")[0]?.trim() || text.trim();
  return first.length > 70 ? `${first.slice(0, 67)}…` : first;
}

function Detail({ label, text, tone }: { label: string; text?: string | null; tone: string }) {
  if (!text) return null;
  return (
    <div className={cn("flex flex-col gap-0.5 rounded-md px-3 py-2 sm:flex-row sm:gap-3", tone)}>
      <span className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      <span className="text-sm leading-snug">{text}</span>
    </div>
  );
}

/**
 * Helskärmsläge när uppgiften görs: ett steg i taget, stor bild och knappen
 * "Klar · nästa steg" längst ned. Inget att skrolla runt efter — allt som
 * behövs för steget syns på en gång, i telefon likaväl som på dator.
 */
export function TaskRunFullscreen({
  open,
  onClose,
  checklistItemId,
  taskName,
  steps,
  photoCount,
  requiresPhoto,
  blockedText,
  onAddPhoto,
  onFinish,
}: {
  open: boolean;
  onClose: () => void;
  checklistItemId: string;
  taskName: string;
  steps: GuideStep[];
  photoCount: number;
  requiresPhoto?: boolean | null;
  /** Det som saknas för att få bocka av uppgiften. */
  blockedText?: string;
  onAddPhoto: (file: File) => Promise<void> | void;
  onFinish: () => Promise<void> | void;
}) {
  const { data: staff } = useCurrentStaff();
  const { data: checks = [] } = useTaskPrepChecks(open ? checklistItemId : null);
  const setStep = useSetStepCheck();
  const clearStep = useClearStepCheck();
  const [index, setIndex] = useState(0);

  const doneNos = new Set(checks.filter((c) => c.step_no != null).map((c) => c.step_no as number));

  /** Börja på första steget som inte är gjort. */
  useEffect(() => {
    if (!open) return;
    const firstLeft = steps.findIndex((_s, i) => !doneNos.has(i + 1));
    setIndex(firstLeft === -1 ? Math.max(steps.length - 1, 0) : firstLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, steps.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  if (!open || steps.length === 0) return null;

  const s = steps[Math.min(index, steps.length - 1)];
  const no = Math.min(index, steps.length - 1) + 1;
  const done = doneNos.has(no);
  const last = no === steps.length;
  const allDone = doneNos.size >= steps.length;
  const pct = Math.round((doneNos.size / steps.length) * 100);

  const markAndNext = async () => {
    if (!done) {
      await setStep.mutateAsync({
        checklistItemId,
        stepNo: no,
        stepTitle: stepTitle(s.text || `Steg ${no}`),
        staffId: staff?.id ?? null,
      });
    }
    if (!last) setIndex((i) => i + 1);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Topp: vilken uppgift, vilket steg, och vägen ut */}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{taskName}</p>
          <p className="font-mono text-sm tabular-nums">
            Steg {no} av {steps.length} · {doneNos.size} klara
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng helskärm">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="h-1 bg-muted">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* Steget: bild stort, texten direkt under */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          {s.image && (
            <img
              src={s.image}
              alt={stepTitle(s.text || "")}
              className="max-h-[46vh] w-full rounded-xl object-contain"
            />
          )}
          <h2 className="font-heading text-xl font-bold leading-snug sm:text-2xl">{stepTitle(s.text || `Steg ${no}`)}</h2>
          {s.text && <p className="text-[15px] leading-snug text-muted-foreground">{s.text}</p>}
          <Detail label="Viktigt" text={s.keyPoint} tone="bg-primary/5 text-primary" />
          <Detail label="Varför" text={s.why} tone="bg-muted text-muted-foreground" />
          <Detail label="Säkerhet" text={s.safety} tone="bg-amber-500/10 text-amber-700" />
          <Detail label="HACCP" text={s.haccp} tone="bg-sky-500/10 text-sky-700" />
        </div>
      </div>

      {/* Botten: bläddra, ta bild och bocka av — alltid på samma plats */}
      <div className="space-y-2 border-t bg-card px-3 py-2">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
          <Button
            variant="outline"
            className="h-12 shrink-0 px-3"
            disabled={no === 1}
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            aria-label="Föregående steg"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          {allDone || (done && last) ? (
            <Button
              className="h-12 flex-1 bg-emerald-600 text-base text-white hover:bg-emerald-700"
              onClick={async () => {
                await onFinish();
                onClose();
              }}
            >
              <Check className="mr-2 h-5 w-5" /> MARKERA UPPGIFTEN SOM KLAR
            </Button>
          ) : (
            <Button
              className={cn(
                "h-12 flex-1 text-base",
                done ? "" : "bg-emerald-600 text-white hover:bg-emerald-700",
              )}
              variant={done ? "outline" : "default"}
              onClick={markAndNext}
            >
              {done ? (
                <>
                  Nästa steg <ChevronRight className="ml-2 h-5 w-5" />
                </>
              ) : (
                <>
                  <Check className="mr-2 h-5 w-5" /> Klar {last ? "" : "· nästa steg"}
                </>
              )}
            </Button>
          )}

          {requiresPhoto && (
            <label className="inline-flex shrink-0">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) await onAddPhoto(f);
                }}
              />
              <span
                className={cn(
                  "inline-flex h-12 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted",
                  photoCount === 0 && "border-amber-500/50 text-amber-700",
                )}
              >
                <Camera className="h-5 w-5" /> {photoCount > 0 ? photoCount : "Bild"}
              </span>
            </label>
          )}

          {done && !last && (
            <Button
              variant="ghost"
              className="hidden h-12 shrink-0 px-3 text-xs text-muted-foreground sm:inline-flex"
              onClick={() => clearStep.mutate({ checklistItemId, stepNo: no })}
            >
              Ångra
            </Button>
          )}
        </div>
        {blockedText && <p className="text-center text-xs text-amber-700">{blockedText}</p>}
      </div>
    </div>
  );
}
