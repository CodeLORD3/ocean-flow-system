import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, Upload } from "lucide-react";
import { useUploadLibraryImages, type LibraryImage } from "@/hooks/useImageLibrary";
import type { MediaKind } from "@/lib/imageStatus";
import ImageQuickClassify from "./ImageQuickClassify";
import { toast } from "sonner";

/**
 * Fånga verkligheten först, strukturera den sedan: bilderna sparas direkt som
 * oplacerade. Ingen behöver fylla i något för att få fotografera.
 */
export default function AddImageFlow({
  storeId,
  zoneId,
  mediaKind,
  label = "Lägg till bild",
  onUploaded,
  size = "default",
}: {
  storeId?: string | null;
  zoneId?: string | null;
  mediaKind?: MediaKind | null;
  label?: string;
  onUploaded?: (ids: string[]) => void;
  size?: "sm" | "default";
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadLibraryImages();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [fresh, setFresh] = useState<LibraryImage[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);

  async function handle(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setProgress({ done: 0, total: list.length });
    try {
      const ids = await upload.mutateAsync({
        files: list,
        storeId,
        zoneId,
        mediaKind: mediaKind ?? null,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      toast.success(
        list.length === 1 ? "Bilden är sparad" : `${list.length} bilder sparade`,
        { description: "Du kan sortera dem nu eller senare." },
      );
      onUploaded?.(ids);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ladda upp");
    } finally {
      setProgress(null);
      setFresh([]);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => void handle(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handle(e.target.files)}
      />
      <Button
        size={size}
        onClick={() => cameraRef.current?.click()}
        disabled={upload.isPending}
      >
        <Camera className="mr-2 h-4 w-4" />
        {progress ? `Sparar ${progress.done}/${progress.total}…` : label}
      </Button>
      <Button
        size={size}
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={upload.isPending}
        title="Välj bilder från enheten"
      >
        <Upload className="h-4 w-4" />
      </Button>
      <ImageQuickClassify
        images={fresh}
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        defaultStoreId={storeId}
      />
    </div>
  );
}
