import { useEffect, useState } from "react";
import { AlertTriangle, Camera, MapPin, RotateCcw, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import type { TaskGuide } from "@/lib/taskGuide";
import { uploadTaskStepImage } from "@/lib/taskStepImage";
import type { GuideZone } from "@/components/tasks/TaskGuideEditor";

/**
 * Byt eller ta bort en bild i arbetsbeskrivningen. Den gamla bilden ligger
 * kvar i bildbiblioteket — beskrivningen pekar bara på en ny.
 */
function ImageChange({
  taskId,
  hasImage,
  label,
  onPicked,
  onRemove,
}: {
  taskId: string;
  hasImage: boolean;
  label?: string;
  onPicked: (url: string) => Promise<void> | void;
  onRemove?: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <label>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.currentTarget.value = "";
            if (!file) return;
            setBusy(true);
            try {
              const url = await uploadTaskStepImage(file, taskId);
              await onPicked(url);
              toast({ title: hasImage ? "Bilden är bytt" : "Bilden är tillagd" });
            } catch (err: any) {
              toast({ title: "Kunde inte spara bilden", description: err.message, variant: "destructive" });
            } finally {
              setBusy(false);
            }
          }}
        />
        <span className="inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
          <Camera className="mr-1 h-3.5 w-3.5" />
          {busy ? "Laddar upp …" : hasImage ? "Byt bild" : label ?? "Lägg till bild"}
        </span>
      </label>
      {hasImage && onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={async () => {
            await onRemove();
            toast({ title: "Bilden är borttagen" });
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Ta bort bild
        </Button>
      )}
    </div>
  );
}

/**
 * Visar arbetsbeskrivningen som ett flöde: godkänt läge, hämta fram med plats
 * på kartan, arbetsgången steg för steg, ställ tillbaka och rapportera fel.
 */
export function TaskGuideView({
  guide,
  zones = [],
  onShowOnMap,
  onReport,
  taskId,
  onSaveGuide,
  highlightStep = null,
}: {
  guide: TaskGuide;
  zones?: GuideZone[];
  onShowOnMap?: (zoneId: string) => void;
  onReport?: (materialName?: string) => void;
  /** Uppgiften bilderna laddas upp till. */
  taskId?: string;
  /** Satt när användaren får ändra bilderna i beskrivningen. */
  onSaveGuide?: (next: TaskGuide) => Promise<void> | void;
  /** Steget som ska lysa upp och rullas fram, 1 och uppåt. */
  highlightStep?: number | null;
}) {
  const canEditImages = !!taskId && !!onSaveGuide;
  /* Kommer man från en bild i ett steg ska steget rullas fram och lysa upp. */
  useEffect(() => {
    if (!highlightStep) return;
    const el = document.getElementById(`guide-step-${highlightStep}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStep, guide.steps.length]);
  const saveStepImage = (i: number, url: string | null) =>
    onSaveGuide!({
      ...guide,
      steps: guide.steps.map((s, idx) => (idx === i ? { ...s, image: url, marks: url ? s.marks : [] } : s)),
    });
  const saveMaterialImage = (i: number, url: string | null) =>
    onSaveGuide!({
      ...guide,
      materials: guide.materials.map((m, idx) => (idx === i ? { ...m, image: url } : m)),
    });
  const hasGoal = guide.goal.trim() || guide.goalImages.length > 0;
  const hasMaterials = guide.materials.length > 0;
  const hasSteps = guide.steps.length > 0;
  const hasPutBack = guide.putBack.trim() || guide.putBackImages.length > 0;

  if (!hasGoal && !hasMaterials && !hasSteps && !hasPutBack) return null;

  const zoneOf = (id?: string | null) => (id ? zones.find((z) => z.id === id) ?? null : null);
  const zoneText = (z: GuideZone) => `${z.number ? `${z.number}. ` : ""}${z.name}`;

  return (
    <div className="space-y-5">
      {hasGoal && (
        <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <Target className="h-4 w-4" /> Godkänt läge
          </h3>
          {guide.goal.trim() && <p className="text-sm">{guide.goal}</p>}
          {guide.goalImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {guide.goalImages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-28 w-28 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
          {canEditImages && (
            <ImageChange
              taskId={taskId!}
              hasImage={false}
              label="Lägg till bild på godkänt läge"
              onPicked={(url) => onSaveGuide!({ ...guide, goalImages: [...guide.goalImages, url] })}
            />
          )}
        </section>
      )}

      {hasMaterials && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">1. Hämta fram</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {guide.materials.map((m, i) => {
              const z = zoneOf(m.zoneId);
              return (
                <div key={i} className="flex items-start gap-3 rounded-lg border p-2">
                  {m.image ? (
                    <a href={m.image} target="_blank" rel="noreferrer">
                      <img src={thumbUrl(m.image, THUMB_TILE)} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted text-[10px] text-muted-foreground">
                      Ingen bild
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{m.name}</p>
                    {m.place && <p className="text-xs text-muted-foreground">{m.place}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {z && onShowOnMap && (
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onShowOnMap(z.id)}>
                          <MapPin className="mr-1 h-3.5 w-3.5" /> {zoneText(z)}
                        </Button>
                      )}
                      {onReport && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onReport(m.name)}>
                          <AlertTriangle className="mr-1 h-3.5 w-3.5 text-amber-600" /> Rapportera
                        </Button>
                      )}
                    </div>
                    {canEditImages && (
                      <ImageChange
                        taskId={taskId!}
                        hasImage={!!m.image}
                        onPicked={(url) => saveMaterialImage(i, url)}
                        onRemove={() => saveMaterialImage(i, null)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {hasSteps && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">2. Arbetsgång</h3>
          <ol className="space-y-3">
            {guide.steps.map((s, i) => (
              <li
                key={i}
                id={`guide-step-${i + 1}`}
                className={
                  highlightStep === i + 1
                    ? "flex gap-3 rounded-lg bg-primary/5 p-2 ring-2 ring-primary"
                    : "flex gap-3"
                }
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{s.text}</p>
                  {s.image && (
                    <a href={s.image} target="_blank" rel="noreferrer">
                      <img src={thumbUrl(s.image, THUMB_TILE)} alt="" className="mt-1 h-28 w-28 rounded-lg object-cover" />
                    </a>
                  )}
                  {canEditImages && (
                    <ImageChange
                      taskId={taskId!}
                      hasImage={!!s.image}
                      label="Lägg till stegbild"
                      onPicked={(url) => saveStepImage(i, url)}
                      onRemove={() => saveStepImage(i, null)}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {hasPutBack && (
        <section className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-sky-700">
            <RotateCcw className="h-4 w-4" /> 3. Ställ tillbaka
          </h3>
          {guide.putBack.trim() && <p className="text-sm">{guide.putBack}</p>}
          {guide.putBackImages.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {guide.putBackImages.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
                </a>
              ))}
            </div>
          )}
        </section>
      )}

      {onReport && (
        <Button variant="outline" onClick={() => onReport()} className="w-full sm:w-auto">
          <AlertTriangle className="mr-2 h-4 w-4 text-amber-600" /> Rapportera trasigt eller slut
        </Button>
      )}
    </div>
  );
}
