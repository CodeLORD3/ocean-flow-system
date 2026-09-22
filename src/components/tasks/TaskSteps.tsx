import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Info, MessageSquarePlus, Pencil, Square, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { cleanGuide, parseGuide, type GuideMark, type GuideStep, type TaskGuide } from "@/lib/taskGuide";
import { AnnotatableImage, type ImageRegion, type RegionMark } from "@/components/images/AnnotatableImage";
import { useCreateImprovement } from "@/hooks/useResources";
import { useSaveTaskGuide } from "@/hooks/useTasks";
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
  /** Standarduppgiften, så ändringen följer med kommande dagar. */
  templateItemId?: string | null;
  /** Bara den som får ändra uppgiften ser redigeringen. */
  canEdit?: boolean;
};

/**
 * Överst allmän information, sedan arbetsgången som stegbilder. Tryck på ett
 * steg för att läsa det stort, bläddra med pilarna, ändra texten direkt och
 * markera rutor i bilden för att peka på vad som menas.
 */
export function TaskSteps({
  taskId,
  taskName,
  guide,
  instructions,
  note,
  importantNote,
  storeId,
  templateItemId,
  canEdit = true,
}: Props) {
  const parsed = parseGuide(guide, instructions ?? null);
  const steps: GuideStep[] = parsed.steps;
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const general = [parsed.goal?.trim(), note?.trim()].filter(Boolean) as string[];
  const saveGuide = useSaveTaskGuide();

  const saveStep = async (i: number, patch: Partial<GuideStep>) => {
    const next: TaskGuide = {
      ...parsed,
      steps: parsed.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    };
    try {
      await saveGuide.mutateAsync({ id: taskId, templateItemId, guide: cleanGuide(next) });
    } catch (err: any) {
      toast({ title: "Kunde inte spara", description: err.message, variant: "destructive" });
      throw err;
    }
  };

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
              <div
                key={i}
                className="relative w-40 shrink-0 snap-start overflow-hidden rounded-xl border bg-card transition hover:border-primary/50 hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditOpen(false);
                    setOpenIndex(i);
                  }}
                  className="block w-full text-left"
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
                    {(s.marks?.length ?? 0) > 0 && (
                      <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-background/95 px-1.5 py-0.5 text-[10px] font-medium">
                        <Square className="h-3 w-3" /> {s.marks!.length}
                      </span>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug">
                      {stepTitle(s.text) || "—"}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted-foreground">Tryck för hela beskrivningen</p>
                  </div>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Ändra steg ${i + 1}`}
                    onClick={() => {
                      setEditOpen(true);
                      setOpenIndex(i);
                    }}
                    className="absolute right-1.5 top-1.5 rounded-full bg-background/95 p-1.5 text-muted-foreground shadow hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
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
          canEdit={canEdit}
          startInEdit={editOpen}
          saving={saveGuide.isPending}
          onSaveStep={saveStep}
          onIndex={setOpenIndex}
          onClose={() => {
            setOpenIndex(null);
            setEditOpen(false);
          }}
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
  canEdit,
  startInEdit,
  saving,
  onSaveStep,
  onIndex,
  onClose,
}: {
  taskId: string;
  taskName: string;
  storeId?: string | null;
  steps: GuideStep[];
  index: number;
  canEdit: boolean;
  startInEdit: boolean;
  saving: boolean;
  onSaveStep: (i: number, patch: Partial<GuideStep>) => Promise<void>;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const [edit, setEdit] = useState(startInEdit);
  const [draft, setDraft] = useState({ text: "", keyPoint: "", why: "", safety: "" });
  const [showMarks, setShowMarks] = useState(false);
  const [activeMark, setActiveMark] = useState<string | null>(null);
  const [markMode, setMarkMode] = useState(false);
  const [pending, setPending] = useState<ImageRegion | null>(null);
  const [markLabel, setMarkLabel] = useState("");
  const createImprovement = useCreateImprovement();
  const { staff } = useStaffAuth();

  const marks: GuideMark[] = step?.marks ?? [];

  useEffect(() => {
    setDraft({
      text: step?.text ?? "",
      keyPoint: step?.keyPoint ?? "",
      why: step?.why ?? "",
      safety: step?.safety ?? "",
    });
    setShowMarks(false);
    setActiveMark(null);
    setMarkMode(false);
    setPending(null);
    setMarkLabel("");
  }, [index, step?.text, step?.keyPoint, step?.why, step?.safety]);

  const go = (delta: number) => {
    const next = index + delta;
    if (next >= 0 && next < steps.length) {
      onIndex(next);
      setComment("");
      setCommentOpen(false);
      setEdit(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (edit || markMode || pending) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!step) return null;

  const saveText = async () => {
    await onSaveStep(index, {
      text: draft.text,
      keyPoint: draft.keyPoint,
      why: draft.why,
      safety: draft.safety,
    });
    toast({ title: "Steget är ändrat" });
    setEdit(false);
  };

  const saveMark = async () => {
    if (!pending) return;
    const mark: GuideMark = {
      id: Math.random().toString(36).slice(2),
      region: pending,
      label: markLabel.trim(),
    };
    await onSaveStep(index, { marks: [...marks, mark] });
    setPending(null);
    setMarkLabel("");
    setMarkMode(false);
    setShowMarks(true);
    setActiveMark(mark.id);
    toast({ title: "Markeringen är sparad" });
  };

  const removeMark = async (id: string) => {
    await onSaveStep(index, { marks: marks.filter((m) => m.id !== id) });
    setActiveMark(null);
  };

  const saveComment = async () => {
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

  const visible: RegionMark[] = marks
    .map((m, i) => ({ id: m.id, region: m.region, number: i + 1, label: m.label }))
    .filter((m) => showMarks || m.id === activeMark);
  const active = marks.find((m) => m.id === activeMark) ?? null;

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
          <div className="flex items-center gap-1">
            {canEdit && !edit && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEdit(true)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Ändra text
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Stäng">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex justify-center bg-muted">
          {step.image ? (
            <AnnotatableImage
              src={step.image}
              alt=""
              imgClassName="max-h-[52vh] w-auto object-contain"
              marks={visible}
              markMode={markMode}
              activeId={activeMark}
              onOpenMark={(id) => setActiveMark(id === activeMark ? null : id)}
              onRegion={(r) => setPending(r)}
            />
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Ingen bild</div>
          )}
          {index > 0 && !markMode && (
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Föregående steg"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow hover:bg-background"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {index < steps.length - 1 && !markMode && (
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Nästa steg"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90 p-2 shadow hover:bg-background"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
          {step.image && (
            <div className="absolute bottom-2 right-2 flex gap-1.5">
              {marks.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 text-xs"
                  onClick={() => {
                    setShowMarks((v) => !v);
                    setActiveMark(null);
                  }}
                >
                  {showMarks ? "Avmarkera alla" : `Visa markeringar (${marks.length})`}
                </Button>
              )}
              {canEdit && (
                <Button
                  size="sm"
                  variant={markMode ? "default" : "secondary"}
                  className="h-8 text-xs"
                  onClick={() => {
                    setMarkMode((v) => !v);
                    setPending(null);
                  }}
                >
                  <Square className="mr-1 h-3.5 w-3.5" /> {markMode ? "Klar" : "Markera i bilden"}
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="max-h-[34vh] space-y-3 overflow-y-auto px-4 py-3">
          {pending && (
            <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-[12px] font-medium">Vad menar du med den markerade rutan?</p>
              <Input
                autoFocus
                value={markLabel}
                onChange={(e) => setMarkLabel(e.target.value)}
                placeholder="T.ex. Torka här"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={saveMark}>
                  Spara markering
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                  Avbryt
                </Button>
              </div>
            </div>
          )}

          {active && !pending && (
            <div className="flex items-start gap-3 rounded-lg bg-primary/10 px-3 py-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {marks.findIndex((m) => m.id === active.id) + 1}
              </span>
              <span className="min-w-0 flex-1 text-[14px] leading-5">{active.label || "Markerad del av bilden"}</span>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => removeMark(active.id)}>
                  Ta bort
                </Button>
              )}
            </div>
          )}

          {edit ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                placeholder="Vad ska göras i det här steget?"
                className="min-h-[70px] text-[15px]"
              />
              <Input
                value={draft.keyPoint}
                onChange={(e) => setDraft((d) => ({ ...d, keyPoint: e.target.value }))}
                placeholder="Viktigt"
              />
              <Input
                value={draft.why}
                onChange={(e) => setDraft((d) => ({ ...d, why: e.target.value }))}
                placeholder="Varför"
              />
              <Input
                value={draft.safety}
                onChange={(e) => setDraft((d) => ({ ...d, safety: e.target.value }))}
                placeholder="Säkerhet"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saving} onClick={saveText}>
                  Spara steget
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[16px] font-medium leading-relaxed">{step.text}</p>

              {(step.keyPoint || step.why || step.safety || step.haccp) && (
                <div className="space-y-2">
                  {step.keyPoint && <DetailRow tone="primary" label="Viktigt" text={step.keyPoint} />}
                  {step.why && <DetailRow tone="muted" label="Varför" text={step.why} />}
                  {step.safety && <DetailRow tone="amber" label="Säkerhet" text={step.safety} />}
                  {step.haccp && <DetailRow tone="sky" label="HACCP" text={step.haccp} />}
                </div>
              )}
            </>
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
                <Button size="sm" disabled={!comment.trim() || createImprovement.isPending} onClick={saveComment}>
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

/** Lika uppbyggda rader: färgad etikett till vänster, texten i samma storlek. */
function DetailRow({
  tone,
  label,
  text,
}: {
  tone: "primary" | "muted" | "amber" | "sky";
  label: string;
  text: string;
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    muted: "bg-muted text-muted-foreground",
    amber: "bg-amber-500/10 text-amber-700",
    sky: "bg-sky-500/10 text-sky-700",
  } as const;

  return (
    <div className={`flex items-start gap-3 rounded-lg px-3 py-2 ${tones[tone]}`}>
      <span className="w-[72px] shrink-0 text-[11px] font-semibold uppercase tracking-wide leading-5">{label}</span>
      <span className="min-w-0 flex-1 text-[14px] leading-5 text-foreground">{text}</span>
    </div>
  );
}
