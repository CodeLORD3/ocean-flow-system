import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { useUploadGuideImage } from "@/hooks/useGuideImage";
import { useSaveDeviation } from "@/hooks/useFoodSafety";
import { cn } from "@/lib/utils";

const KINDS = [
  { key: "trasigt", label: "Trasigt" },
  { key: "slut", label: "Slut / tar slut" },
  { key: "byte", label: "Behöver bytas" },
] as const;

/**
 * Rapport från en uppgift: ett redskap är trasigt, en vara är slut eller något
 * behöver bytas. Hamnar som avvikelse på butiken och syns i rapporterna.
 */
export function TaskIssueDialog({
  open,
  onOpenChange,
  taskId,
  taskName,
  storeId,
  materials,
  presetName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  taskId: string;
  taskName: string;
  storeId: string | null;
  materials: string[];
  presetName?: string | null;
}) {
  const [kind, setKind] = useState<string>("trasigt");
  const [thing, setThing] = useState(presetName ?? materials[0] ?? "");
  const [comment, setComment] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const upload = useUploadGuideImage();
  const save = useSaveDeviation();

  const kindLabel = KINDS.find((k) => k.key === kind)?.label ?? kind;

  const submit = async () => {
    if (!thing.trim()) return;
    try {
      await save.mutateAsync({
        title: `${kindLabel}: ${thing.trim()}`,
        description: [
          `${kindLabel} — ${thing.trim()}`,
          `Upptäckt i uppgiften: ${taskName}`,
          comment.trim() || null,
          image ? `Bild: ${image}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        source: "uppgift",
        source_id: taskId,
        store_id: storeId,
      } as any);
      toast({ title: "Rapporterat", description: "Ligger nu som avvikelse på butiken." });
      onOpenChange(false);
      setComment("");
      setImage(null);
    } catch (e: any) {
      toast({ title: "Kunde inte rapportera", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Rapportera</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={cn(
                  "flex-1 rounded-md border px-2 py-2 text-sm transition-colors",
                  kind === k.key ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-sm font-medium">Vad gäller det?</label>
            {materials.length > 0 && (
              <Select value={materials.includes(thing) ? thing : "annat"} onValueChange={(v) => setThing(v === "annat" ? "" : v)}>
                <SelectTrigger className="mb-2">
                  <SelectValue placeholder="Välj" />
                </SelectTrigger>
                <SelectContent>
                  {materials.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                  <SelectItem value="annat">Annat</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Input value={thing} onChange={(e) => setThing(e.target.value)} placeholder="T.ex. Golvmedel" />
          </div>

          <div>
            <label className="text-sm font-medium">Kommentar</label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Kort om vad som hänt eller vad som behövs."
              className="min-h-[60px]"
            />
          </div>

          <div className="flex items-center gap-2">
            {image && <img src={thumbUrl(image, THUMB_TILE)} alt="" className="h-16 w-16 rounded object-cover" />}
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (!file) return;
                  try {
                    setImage(await upload.mutateAsync({ file, taskId }));
                  } catch (err: any) {
                    toast({ title: "Kunde inte ladda upp bilden", description: err.message, variant: "destructive" });
                  }
                }}
              />
              <span className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                <Camera className="h-4 w-4" /> {upload.isPending ? "Laddar upp…" : image ? "Byt bild" : "Ta bild"}
              </span>
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={submit} disabled={!thing.trim() || save.isPending}>
            Skicka rapport
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
