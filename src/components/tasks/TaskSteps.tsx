import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, MessageSquarePlus, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { parseGuide, type GuideStep } from "@/lib/taskGuide";
import { useCreateImprovement } from "@/hooks/useResources";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

type Props = {
  taskId: string;
  taskName: string;
  guide: unknown;
  instructions?: string[] | null;
  /** Allmän information som visas överst. */
  note?: string | null;
  importantNote?: string | null;
  storeId?: string | null;
};

/**
 * Överst allmän information, sedan arbetsgången som stegbilder. Tryck på ett
 * steg för att läsa det stort och bläddra med pilarna, och lämna en synpunkt
 * eller förbättring direkt på steget.
 */
export function TaskSteps({ taskId, taskName, guide, instructions, note, importantNote, storeId }: Props) {
  const parsed = parseGuide(guide, instructions ?? null);
  const steps: GuideStep[] = parsed.steps;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const general = [parsed.goal?.trim(), note?.trim()].filter(Boolean) as string[];

  if (general.length === 0 && !importantNote && steps.length === 0) return null;

  return (
    <div className="space-y-3">
      {importantNote && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">{importantNote}</p>
      )}

      {general.length > 0 && (
        <div className="rounded-lg border bg-muted/40 px-3 py-2">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> Allmän information
          </p>
          {general.map((t, i) => (
            <p key={i} className="text-[13px] leading-relaxed">
              {t}
            </p>
          ))}
          {parsed.goalImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {parsed.goalImages.slice(0, 4).map((url) => (
                <img key={url} src={thumbUrl(url, THUMB_TILE)} alt="" className="h-16 w-16 rounded-md object-cover" />
              ))}
            </div>
          )}
        </div>
      )}

      {steps.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Så här gör du · {steps.length} steg
          </p>
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
            {steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setOpenIndex(i)}
                className="w-40 shrink-0 snap-start overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary/50 hover:shadow-sm"
              >
                <div className="relative h-24 w-full bg-muted">
                  {s.image ? (
                    <img src={thumbUrl(s.image, THUMB_TILE)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                      Ingen bild
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/95 text-[11px] font-semibold">
                    {i + 1}
                  </span>
                </div>
                <p className="line-clamp-3 px-2 py-1.5 text-[12px] leading-snug">{s.text || "—"}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {openIndex !== null && (
        <StepViewer
          taskId={taskId}
          taskName={taskName}
          storeId={storeId}
          steps={steps}
          index={openIndex}
          onIndex={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </div>
  );
}

function StepViewer({
  taskId,
  taskName,
  storeId,
  steps,
  index,
  onIndex,
  onClose,
}: {
  taskId: string;
  taskName: string;
  storeId?: string | null;
  steps: GuideStep[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const createImprovement = useCreateImprovement();
  const { staff } = useStaffAuth();

  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < steps.length) {
      onIndex(next);
      setComment("");
      setCommentOpen(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;

  const save = async () => {
    try {
      await createImprovement.mutateAsync({
        storeId: storeId ?? null,
        checklistItemId: taskId,
        observation: `Steg ${index + 1} i ${taskName}: ${comment}`,
        staffId: staff?.id ?? null,
      });
      toast({ title: "Tack! Synpunkten är sparad" });
      setComment("");
      setCommentOpen(false);
    } catch (err: any) {
      toast({ title: "Kunde inte spara", description: err.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl gap-0 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{taskName}</p>
            <p className="font-heading text-base font-semibold">
              Steg {index + 1} av {steps.length}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative bg-muted">
          {step.image ? (
            <img src={step.image} alt="" className="max-h-[52vh] w-full object-contain" />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Ingen bild</div>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Föregående steg"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {index < steps.length - 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Nästa steg"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="max-h-[32vh] space-y-3 overflow-y-auto px-4 py-3">
          <p className="text-[15px] leading-relaxed">{step.text}</p>
          {step.keyPoint && (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-[13px]">
              <span className="font-semibold">Viktigt: </span>
              {step.keyPoint}
            </p>
          )}
          {step.why && <p className="text-[13px] text-muted-foreground">Varför: {step.why}</p>}
          {step.safety && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">Säkerhet: {step.safety}</p>
          )}

          {commentOpen ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Vad kan bli bättre i det här steget?"
                className="min-h-[70px]"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={!comment.trim() || createImprovement.isPending} onClick={save}>
                  Skicka synpunkt
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCommentOpen(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setCommentOpen(true)}>
              <MessageSquarePlus className="mr-1 h-4 w-4" /> Synpunkt eller förbättring
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-2">
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => go(-1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Föregående
          </Button>
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-4 rounded-full ${i === index ? "bg-primary" : "bg-muted"}`}
                aria-hidden
              />
            ))}
          </div>
          <Button variant="ghost" size="sm" disabled={index === steps.length - 1} onClick={() => go(1)}>
            Nästa <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
