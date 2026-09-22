import { useState } from "react";
import { Camera, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { useUploadGuideImage } from "@/hooks/useGuideImage";
import type { TaskGuide } from "@/lib/taskGuide";

export type BuilderStep = TaskGuide["steps"][number];

/**
 * Bygger uppgiftens steg i samma utseende som när uppgiften körs: en stor bild
 * med plustecken, rubrik och information under. Man sparar ett steg i taget och
 * går vidare till nästa — precis som mallen för hur en uppgift ser ut.
 */
export function NewTaskStepsBuilder({
  draftId,
  steps,
  onChange,
}: {
  draftId: string;
  steps: BuilderStep[];
  onChange: (next: BuilderStep[]) => void;
}) {
  const upload = useUploadGuideImage();
  /** Vilket steg som redigeras: ett sparat steg, eller ett nytt (längst bak). */
  const [index, setIndex] = useState(steps.length);
  const [draft, setDraft] = useState<BuilderStep>({ text: "", image: null });

  const editingSaved = index < steps.length;
  const current = editingSaved ? steps[index] : draft;
  const patch = (p: Partial<BuilderStep>) => {
    if (editingSaved) onChange(steps.map((s, j) => (j === index ? { ...s, ...p } : s)));
    else setDraft((d) => ({ ...d, ...p }));
  };

  const filled = Boolean((current.text ?? "").trim() || current.image);

  /** Sparar steget och öppnar ett tomt nytt steg. */
  const saveStep = () => {
    if (!filled) return;
    if (editingSaved) {
      setIndex(steps.length);
      setDraft({ text: "", image: null });
      toast({ title: `Steg ${index + 1} sparat` });
      return;
    }
    onChange([...steps, draft]);
    setDraft({ text: "", image: null });
    setIndex(steps.length + 1);
    toast({ title: `Steg ${steps.length + 1} sparat`, description: "Nu kan du lägga in nästa steg." });
  };

  const removeStep = (i: number) => {
    onChange(steps.filter((_, j) => j !== i));
    setIndex(Math.max(0, steps.length - 1));
    setDraft({ text: "", image: null });
  };

  const stepNumber = editingSaved ? index + 1 : steps.length + 1;

  return (
    <div className="space-y-3">
      {/* Sparade steg: tryck för att redigera igen */}
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1",
                i === index ? "border-primary bg-primary/10" : "",
              )}
            >
              <button
                type="button"
                onClick={() => setIndex(i)}
                className="flex min-w-0 items-center gap-2 text-left"
              >
                {s.image ? (
                  <img src={thumbUrl(s.image, THUMB_TILE)} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                    {i + 1}
                  </span>
                )}
                <span className="max-w-[9rem] truncate text-xs">{s.text?.trim() || `Steg ${i + 1}`}</span>
              </button>
              <button type="button" onClick={() => removeStep(i)} aria-label="Ta bort steget">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIndex(steps.length);
              setDraft({ text: "", image: null });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Nytt steg
          </Button>
        </div>
      )}

      {/* Stegkortet: ser ut som när uppgiften körs */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            Steg {stepNumber}
            {editingSaved ? ` av ${steps.length}` : " (nytt)"}
          </span>
          {editingSaved && <span className="text-xs text-emerald-700">Sparat</span>}
        </div>

        <div className="space-y-3 p-3">
          {/* Plustecknet: här lägger man in bilden */}
          <label className="block cursor-pointer overflow-hidden rounded-lg border bg-muted">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.currentTarget.value = "";
                if (!file) return;
                try {
                  const url = await upload.mutateAsync({ file, taskId: draftId });
                  patch({ image: url, marks: [] });
                } catch (err: any) {
                  toast({ title: "Kunde inte ladda upp bilden", description: err.message, variant: "destructive" });
                }
              }}
            />
            {current.image ? (
              <div className="relative">
                <img src={thumbUrl(current.image, 800)} alt="" className="aspect-[4/3] w-full object-cover" />
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs">
                  <Camera className="h-3.5 w-3.5" /> Tryck för att byta bild
                </span>
              </div>
            ) : (
              <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                <Plus className="h-10 w-10" />
                {upload.isPending ? "Laddar upp …" : "Tryck här för att lägga in bild"}
              </span>
            )}
          </label>

          <Textarea
            value={current.text ?? ""}
            placeholder="Rubrik: vad ska göras i det här steget?"
            onChange={(e) => patch({ text: e.target.value })}
            className="min-h-[52px] resize-none text-lg font-semibold leading-snug"
          />
          <Textarea
            value={current.why ?? ""}
            placeholder="Information: hur gör man, och vad är bra att veta?"
            onChange={(e) => patch({ why: e.target.value })}
            className="min-h-[64px] resize-none text-sm"
          />
          <div className="rounded-md bg-emerald-500/10 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Viktigt</p>
            <Textarea
              value={current.keyPoint ?? ""}
              placeholder="Ex: Inget förvaras utanför skåpen."
              onChange={(e) => patch({ keyPoint: e.target.value })}
              className="min-h-[36px] resize-none border-transparent bg-transparent px-0 text-sm text-emerald-800 shadow-none focus-visible:border-input focus-visible:bg-background focus-visible:px-3"
            />
          </div>

          <Button className="h-11 w-full" disabled={!filled} onClick={saveStep}>
            <Check className="mr-1 h-5 w-5" />
            {editingSaved ? "Klar med steget · nytt steg" : `Spara steg ${stepNumber} · nästa steg`}
          </Button>
        </div>
      </div>
    </div>
  );
}
