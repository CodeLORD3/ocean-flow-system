import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_PHOTO_ENTITY, useUploadEntityImage } from "@/hooks/useEntityImages";

/**
 * Anteckning och bild på en vara — göms bakom en enda sekundär knapp i
 * räkningen, aldrig en ikonrad.
 */
export default function CountNoteSheet({
  open,
  onOpenChange,
  productId,
  productName,
  note,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  productName: string;
  note: string;
  onSave: (note: string) => void;
}) {
  const [text, setText] = useState(note);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadEntityImage();

  const pickPhoto = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files))
        await upload.mutateAsync({ entityType: PRODUCT_PHOTO_ENTITY, entityId: productId, file });
      toast.success("Bilden är sparad");
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte spara bilden");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setText(note);
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-[360px] gap-4 rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="text-[21px] leading-tight">{productName}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Skriv vad du såg, till exempel trasig förpackning"
          className="min-h-[120px] text-[18px]"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files)}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={upload.isPending}
          className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-[18px] font-semibold active:bg-muted disabled:opacity-50"
        >
          {upload.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Camera className="h-6 w-6" />
          )}
          Ta en bild
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(text);
            onOpenChange(false);
          }}
          className="flex h-16 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[19px] font-semibold text-primary-foreground"
        >
          <Check className="h-6 w-6" /> Spara anteckningen
        </button>
      </DialogContent>
    </Dialog>
  );
}
