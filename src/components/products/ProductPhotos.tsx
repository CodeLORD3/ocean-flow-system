import { useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  PRODUCT_PHOTO_ENTITY,
  useDeleteEntityImage,
  useEntityImages,
  useUploadEntityImage,
} from "@/hooks/useEntityImages";
import { cn } from "@/lib/utils";

interface ProductPhotosGalleryProps {
  productId?: string | null;
  productName?: string;
  /** Dölj uppladdningsknappen (t.ex. i lässlägen) */
  readOnly?: boolean;
  className?: string;
}

/**
 * Egentagna bilder kopplade till en produkt. Bilder kan komma från ordrar
 * (kopplade i orderns bilddialog) eller laddas upp direkt här.
 */
export function ProductPhotosGallery({
  productId,
  productName,
  readOnly,
  className,
}: ProductPhotosGalleryProps) {
  const [zoomIdx, setZoomIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: images = [] } = useEntityImages(PRODUCT_PHOTO_ENTITY, productId);
  const upload = useUploadEntityImage();
  const del = useDeleteEntityImage();

  if (!productId) return null;

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files)) {
        await upload.mutateAsync({ entityType: PRODUCT_PHOTO_ENTITY, entityId: productId, file });
      }
      toast({ title: "Bild uppladdad" });
    } catch (e: any) {
      toast({ title: "Kunde inte ladda upp", description: e?.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Egentagna bilder {images.length > 0 && <span className="font-mono">({images.length})</span>}
        </span>
        {!readOnly && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 gap-1 text-[11px]"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
              Ta bild
            </Button>
          </>
        )}
      </div>

      {images.length === 0 ? (
        <p className="rounded-md border border-dashed border-border py-4 text-center text-[11px] text-muted-foreground">
          Inga egentagna bilder ännu. Bilder från ordrar kan kopplas hit.
        </p>
      ) : (
        <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto sm:grid-cols-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative overflow-hidden rounded-md border border-border"
            >
              <button
                type="button"
                onClick={() => setZoomIdx(images.indexOf(img))}
                className="block aspect-square w-full"
              >
                <img
                  src={img.url}
                  alt={img.caption || productName || "Produktbild"}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
              {img.caption && (
                <p className="truncate px-1 py-0.5 text-[9px] text-muted-foreground">{img.caption}</p>
              )}
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0.5 top-0.5 h-5 w-5 bg-background/80 text-destructive opacity-0 transition group-hover:opacity-100"
                  onClick={() => del.mutate(img.id)}
                  title="Ta bort bild från produkten"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={zoomIdx !== null} onOpenChange={(o) => !o && setZoomIdx(null)}>
        <DialogContent className="max-w-3xl p-2">
          {zoomIdx !== null && images[zoomIdx] && (
            <div className="relative">
              <img
                src={images[zoomIdx].url}
                alt={images[zoomIdx].caption || productName || "Produktbild"}
                className="h-auto max-h-[75vh] w-full rounded-md object-contain"
              />
              {images.length > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/80"
                    onClick={() => setZoomIdx((i) => ((i ?? 0) - 1 + images.length) % images.length)}
                    title="Föregående bild"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/80"
                    onClick={() => setZoomIdx((i) => ((i ?? 0) + 1) % images.length)}
                    title="Nästa bild"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}
              <div className="flex items-center justify-between px-1 pt-1.5">
                <p className="text-[11px] text-muted-foreground">
                  {images[zoomIdx].caption || productName || ""}
                </p>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {zoomIdx + 1}/{images.length}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ProductPhotosGallery;
