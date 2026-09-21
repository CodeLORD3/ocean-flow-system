import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  useProductPhotos,
  useRemoveProductImage,
  useSetProductCover,
  type ProductPhoto,
} from "@/hooks/useEntityImages";
import { thumbUrl, THUMB_CARD, THUMB_TILE } from "@/lib/imageThumb";

interface ProductImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string | null;
  productName: string;
  /** Bilden som visas först i listor och beställningar (products.image_url) */
  catalogUrl?: string | null;
}

type Shown = { url: string; caption?: string | null; photo?: ProductPhoto };

/**
 * Bildvisaren för en vara: förstabilden ligger först, sedan alla andra bilder
 * som hör till varan — egna foton, bilder från bildbiblioteket och bilder från
 * orderrader. Här väljer man vilken bild som ska synas först och kan ta bort en
 * bild från varan; bilden ligger kvar i bildbiblioteket.
 */
export function ProductImagesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  catalogUrl,
}: ProductImagesDialogProps) {
  const { data: photos = [] } = useProductPhotos(open ? productId : null);
  const setCover = useSetProductCover();
  const removeImage = useRemoveProductImage();
  const [idx, setIdx] = useState(0);

  const images = useMemo(() => {
    const list: Shown[] = [];
    const byUrl = new Map(photos.map((p) => [p.url, p]));
    if (catalogUrl) list.push({ url: catalogUrl, caption: "Visas först", photo: byUrl.get(catalogUrl) });
    for (const p of photos) {
      if (!list.some((i) => i.url === p.url)) list.push({ url: p.url, caption: p.caption, photo: p });
    }
    return list;
  }, [catalogUrl, photos]);

  useEffect(() => {
    if (open) setIdx(0);
  }, [open, productId]);

  useEffect(() => {
    if (!open || images.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + images.length) % images.length);
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length]);

  const current = images[Math.min(idx, Math.max(images.length - 1, 0))];
  const isCover = !!current && !!catalogUrl && current.url === catalogUrl;

  const makeCover = () => {
    if (!productId || !current) return;
    setCover.mutate(
      { productId, url: current.url },
      {
        onSuccess: () => toast({ title: "Bilden visas nu först på varan" }),
        onError: (e) =>
          toast({ title: "Kunde inte byta förstabild", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const removeCurrent = () => {
    if (!productId || !current) return;
    if (!current.photo) {
      /* Bara katalogadressen, ingen bild i biblioteket — töm förstabilden */
      setCover.mutate(
        { productId, url: "" },
        { onSuccess: () => toast({ title: "Bilden togs bort från varan" }) },
      );
      return;
    }
    removeImage.mutate(
      { productId, photo: current.photo, isCover },
      {
        onSuccess: () => {
          setIdx(0);
          toast({ title: "Bilden togs bort från varan", description: "Den ligger kvar i bildbiblioteket." });
        },
        onError: (e) =>
          toast({ title: "Kunde inte ta bort bilden", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-2">
        {current ? (
          <div className="relative">
            <img
              src={thumbUrl(current.url, THUMB_CARD)}
              alt={current.caption || productName}
              className="h-auto max-h-[70vh] w-full rounded-md object-contain"
              loading="lazy"
              decoding="async"
            />
            {isCover && (
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground shadow-sm">
                <Star className="h-3 w-3 fill-current" /> Visas först
              </span>
            )}
            {images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/80"
                  onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
                  title="Föregående bild"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-background/80"
                  onClick={() => setIdx((i) => (i + 1) % images.length)}
                  title="Nästa bild"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
            <div className="flex items-center justify-between gap-2 px-1 pt-1.5">
              <p className="truncate text-[11px] text-muted-foreground">
                {productName}
                {current.caption ? ` · ${current.caption}` : ""}
              </p>
              <span className="font-mono text-[11px] text-muted-foreground">
                {idx + 1}/{images.length}
              </span>
            </div>

            {productId && (
              <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1.5">
                <Button
                  size="sm"
                  variant={isCover ? "secondary" : "default"}
                  className="h-8 gap-1.5 text-xs"
                  disabled={isCover || setCover.isPending}
                  onClick={makeCover}
                >
                  <Star className={`h-3.5 w-3.5 ${isCover ? "fill-current" : ""}`} />
                  {isCover ? "Visas först på varan" : "Visa den här först"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive"
                  disabled={removeImage.isPending}
                  onClick={removeCurrent}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Ta bort från varan
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Bilden raderas inte — den ligger kvar i bildbiblioteket.
                </span>
              </div>
            )}

            {images.length > 1 && (
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`relative h-12 w-16 shrink-0 overflow-hidden rounded border ${
                      i === idx ? "border-primary" : "border-border opacity-70"
                    }`}
                  >
                    <img
                      src={thumbUrl(img.url, THUMB_TILE)}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {!!catalogUrl && img.url === catalogUrl && (
                      <span className="absolute left-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Star className="h-2.5 w-2.5 fill-current" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-muted-foreground">
            Inga bilder på {productName} ännu.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ProductImagesDialog;
