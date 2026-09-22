import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Camera, Images, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { useUploadGuideImage } from "@/hooks/useGuideImage";
import { cleanGuide, EMPTY_GUIDE, type TaskGuide } from "@/lib/taskGuide";

export type GuideZone = { id: string; name: string; number?: number | null };

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

/** Flera bilder på en gång: varje bild blir ett eget steg. */
function MultiPickImages({ taskId, onPicked }: { taskId: string; onPicked: (urls: string[]) => void }) {
  const upload = useUploadGuideImage();
  return (
    <label className="inline-flex">
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.currentTarget.value = "";
          if (files.length === 0) return;
          const urls: string[] = [];
          for (const file of files) {
            try {
              urls.push(await upload.mutateAsync({ file, taskId }));
            } catch (err: any) {
              toast({ title: "Kunde inte ladda upp bilden", description: err.message, variant: "destructive" });
            }
          }
          if (urls.length > 0) onPicked(urls);
        }}
      />
      <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
        <Images className="h-4 w-4" /> {upload.isPending ? "Laddar upp…" : "Bilder som steg"}
      </span>
    </label>
  );
}

function ImageRow({
  taskId,
  images,
  onChange,
  label,
}: {
  taskId: string;
  images: string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {images.map((url) => (
        <div key={url} className="relative">
          <img src={thumbUrl(url, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => onChange(images.filter((u) => u !== url))}
            className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      ))}
      <PickImage taskId={taskId} label={label} onPicked={(url) => onChange([...images, url])} />
    </div>
  );
}

/**
 * Redigerar arbetsbeskrivningen: godkänt läge, vad man hämtar och var det står
 * på butikskartan, arbetsgången steg för steg med bild, och hur sakerna ställs
 * tillbaka. Kan fyllas i när som helst efter att uppgiften skapats.
 */
export function TaskGuideEditor({
  taskId,
  value,
  onSave,
  saving,
  zones = [],
}: {
  taskId: string;
  value: TaskGuide;
  onSave: (guide: TaskGuide | null) => void;
  saving?: boolean;
  zones?: GuideZone[];
}) {
  const [guide, setGuide] = useState<TaskGuide>(value ?? EMPTY_GUIDE);
  useEffect(() => setGuide(value ?? EMPTY_GUIDE), [taskId, value]);

  const patch = (p: Partial<TaskGuide>) => setGuide((g) => ({ ...g, ...p }));
  const patchMaterial = (i: number, p: Partial<TaskGuide["materials"][number]>) =>
    patch({ materials: guide.materials.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  /** Snabbraden: skriv steget och tryck Enter. */
  const [draft, setDraft] = useState("");
  const addDraft = () => {
    const text = draft.trim();
    if (!text) return;
    setGuide((g) => ({ ...g, steps: [...g.steps, { text, image: null }] }));
    setDraft("");
  };

  /** Flytta ett steg upp eller ner i ordningen. */
  const moveStep = (i: number, dir: -1 | 1) =>
    setGuide((g) => {
      const next = [...g.steps];
      const j = i + dir;
      if (j < 0 || j >= next.length) return g;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...g, steps: next };
    });

  const sections = [
    { n: 1, title: "Godkänt läge" },
    { n: 2, title: "Hämta fram" },
    { n: 3, title: "Arbetsgång" },
    { n: 4, title: "Ställ tillbaka" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sections[0].n}. {sections[0].title}</p>
        <Textarea
          value={guide.goal}
          onChange={(e) => patch({ goal: e.target.value })}
          placeholder="Ex: Golvet torrt och rent, inga fläckar vid disken."
          className="mt-1 min-h-[70px]"
        />
        <ImageRow taskId={taskId} images={guide.goalImages} onChange={(goalImages) => patch({ goalImages })} />
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sections[1].n}. {sections[1].title}</p>
        <p className="mb-2 text-xs text-muted-foreground">Bild på redskapet och var det står på kartan.</p>
        <div className="space-y-3">
          {guide.materials.map((m, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-start gap-3">
                {m.image ? (
                  <img src={thumbUrl(m.image, THUMB_TILE)} alt="" className="h-16 w-16 rounded object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">
                    Ingen bild
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={m.name}
                    placeholder="Redskap eller vara, t.ex. Golvmedel"
                    onChange={(e) => patchMaterial(i, { name: e.target.value })}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Select
                      value={m.zoneId ?? "none"}
                      onValueChange={(v) => patchMaterial(i, { zoneId: v === "none" ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Var finns den?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Ingen yta på kartan</SelectItem>
                        {zones.map((z) => (
                          <SelectItem key={z.id} value={z.id}>
                            {z.number ? `${z.number}. ` : ""}
                            {z.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={m.place ?? ""}
                      placeholder="Exakt plats, t.ex. hyllan över vasken"
                      onChange={(e) => patchMaterial(i, { place: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <PickImage taskId={taskId} label={m.image ? "Byt bild" : "Bild på redskapet"} onPicked={(url) => patchMaterial(i, { image: url })} />
                    <Button variant="ghost" size="sm" onClick={() => patch({ materials: guide.materials.filter((_, j) => j !== i) })}>
                      <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Ta bort
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => patch({ materials: [...guide.materials, { name: "", image: null, zoneId: null, place: "" }] })}
          >
            <Plus className="mr-1 h-4 w-4" /> Lägg till redskap
          </Button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sections[2].n}. {sections[2].title}</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Ett moment per steg. Skriv och tryck Enter, eller lägg in bilder — varje bild blir ett nytt steg.
        </p>

        {/* Snabbrad: skriv steget och tryck Enter, eller lägg in flera bilder på en gång */}
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-dashed p-2">
          <Textarea
            value={draft}
            placeholder="Skriv nästa steg och tryck Enter"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addDraft();
              }
            }}
            className="min-h-[44px] flex-1"
          />
          <div className="flex shrink-0 flex-col gap-2">
            <Button size="sm" onClick={addDraft} disabled={!draft.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Lägg till
            </Button>
            <MultiPickImages
              taskId={taskId}
              onPicked={(urls) =>
                patch({ steps: [...guide.steps, ...urls.map((url) => ({ text: "", image: url }))] })
              }
            />
          </div>
        </div>

        <div className="space-y-3">
          {guide.steps.map((s, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border p-2">
              <div className="flex flex-col items-center gap-1">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold">
                  {i + 1}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === 0}
                  aria-label="Flytta upp"
                  onClick={() => moveStep(i, -1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === guide.steps.length - 1}
                  aria-label="Flytta ner"
                  onClick={() => moveStep(i, 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 space-y-2">
                <Textarea
                  value={s.text}
                  placeholder="Ex: Blanda golvmedel i hinken, 1 kork per 5 liter."
                  onChange={(e) => patch({ steps: guide.steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
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
            <Plus className="mr-1 h-4 w-4" /> Lägg till tomt steg
          </Button>
        </div>
      </div>


      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{sections[3].n}. {sections[3].title}</p>
        <p className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" /> Vart sakerna ska tillbaka, och bild på rätt läge.
        </p>
        <Textarea
          value={guide.putBack}
          onChange={(e) => patch({ putBack: e.target.value })}
          placeholder="Ex: Skölj hinken, häng moppen i städskåpet, golvmedlet på hyllan."
          className="min-h-[60px]"
        />
        <ImageRow taskId={taskId} images={guide.putBackImages} onChange={(putBackImages) => patch({ putBackImages })} />
      </div>

      <Button disabled={saving} onClick={() => onSave(cleanGuide(guide))}>
        Spara beskrivningen
      </Button>
    </div>
  );
}
