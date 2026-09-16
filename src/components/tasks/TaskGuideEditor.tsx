import { useEffect, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { useUploadGuideImage } from "@/hooks/useGuideImage";
import { cleanGuide, EMPTY_GUIDE, type TaskGuide } from "@/lib/taskGuide";

/** Bildknapp: laddar upp en bild och ger tillbaka adressen. */
function PickImage({
  taskId,
  label = "Lägg till bild",
  onPicked,
}: {
  taskId: string;
  label?: string;
  onPicked: (url: string) => void;
}) {
  const upload = useUploadGuideImage();
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.currentTarget.value = "";
          if (!file) return;
          try {
            const url = await upload.mutateAsync({ file, taskId });
            onPicked(url);
          } catch (err: any) {
            toast({ title: "Kunde inte ladda upp bilden", description: err.message, variant: "destructive" });
          }
        }}
      />
      <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
        <Camera className="h-4 w-4" /> {upload.isPending ? "Laddar upp…" : label}
      </span>
    </label>
  );
}

/**
 * Redigerar arbetsbeskrivningen för en uppgift: målet med bilder, varorna som
 * behövs med bilder, och stegen med en bild per steg. Kan fyllas i när som
 * helst efter att uppgiften skapats.
 */
export function TaskGuideEditor({
  taskId,
  value,
  onSave,
  saving,
}: {
  taskId: string;
  value: TaskGuide;
  onSave: (guide: TaskGuide | null) => void;
  saving?: boolean;
}) {
  const [guide, setGuide] = useState<TaskGuide>(value ?? EMPTY_GUIDE);
  useEffect(() => setGuide(value ?? EMPTY_GUIDE), [taskId, value]);

  const patch = (p: Partial<TaskGuide>) => setGuide((g) => ({ ...g, ...p }));

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium">Godkänt läge</label>
        <Textarea
          value={guide.goal}
          onChange={(e) => patch({ goal: e.target.value })}
          placeholder="Ex: Disken rengjord, ny isbädd, kyl 0–2 °C."
          className="min-h-[70px]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {guide.goalImages.map((url) => (
            <div key={url} className="relative">
              <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => patch({ goalImages: guide.goalImages.filter((u) => u !== url) })}
                className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
          <PickImage taskId={taskId} onPicked={(url) => patch({ goalImages: [...guide.goalImages, url] })} />
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Utrustning och material</label>
        <p className="mb-2 text-xs text-muted-foreground">
          Plockas fram innan momentet startar. Bild på förpackningen gör att rätt medel eller redskap används varje gång.
        </p>
        <div className="space-y-2">
          {guide.materials.map((m, i) => (
            <div key={i} className="flex items-center gap-2">
              {m.image ? (
                <img src={thumbUrl(m.image, THUMB_TILE)} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <div className="h-12 w-12 rounded bg-muted" />
              )}
              <Input
                value={m.name}
                placeholder="Vara eller redskap"
                onChange={(e) =>
                  patch({ materials: guide.materials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })
                }
              />
              <PickImage
                taskId={taskId}
                label={m.image ? "Byt bild" : "Bild"}
                onPicked={(url) =>
                  patch({ materials: guide.materials.map((x, j) => (j === i ? { ...x, image: url } : x)) })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => patch({ materials: guide.materials.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => patch({ materials: [...guide.materials, { name: "", image: null }] })}
          >
            <Plus className="mr-1 h-4 w-4" /> Lägg till rad
          </Button>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Arbetsgång</label>
        <p className="mb-2 text-xs text-muted-foreground">
          Ett moment per rad, i den ordning de ska utföras. Börja med verbet och håll det på en rad.
        </p>
        <div className="space-y-3">
          {guide.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
              <div className="flex-1 space-y-2">
                <Textarea
                  value={s.text}
                  placeholder={
                    i === 0
                      ? "Ex: Flytta all vara till kylrum och kontrollera temperaturen."
                      : "Ex: Skölj disken, rengör med angivet medel och torka av."
                  }
                  onChange={(e) =>
                    patch({ steps: guide.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })
                  }
                  className="min-h-[52px]"
                />
                <div className="flex items-center gap-2">
                  {s.image && <img src={thumbUrl(s.image, THUMB_TILE)} alt="" className="h-16 w-16 rounded object-cover" />}
                  <PickImage
                    taskId={taskId}
                    label={s.image ? "Byt bild" : "Bild på hur man gör"}
                    onPicked={(url) => patch({ steps: guide.steps.map((x, j) => (j === i ? { ...x, image: url } : x)) })}
                  />
                  {s.image && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => patch({ steps: guide.steps.map((x, j) => (j === i ? { ...x, image: null } : x)) })}
                    >
                      Ta bort bilden
                    </Button>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => patch({ steps: guide.steps.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => patch({ steps: [...guide.steps, { text: "", image: null }] })}>
            <Plus className="mr-1 h-4 w-4" /> Lägg till steg
          </Button>
        </div>
      </div>

      <Button disabled={saving} onClick={() => onSave(cleanGuide(guide))}>
        Spara beskrivningen
      </Button>
    </div>
  );
}
