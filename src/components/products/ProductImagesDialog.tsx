import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useProductPhotos } from "@/hooks/useEntityImages";

interface ProductImagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId?: string | null;
  productName: string;
  /** Katalogbild (products.image_url) visas först om den finns */
  catalogUrl?: string | null;
}

/**
 * Bildvisare för en produkt: katalogbild + alla egentagna bilder
 * (produktkopplade och från orderrader). Bläddra med pilar eller tangentbord.
 */
export function ProductImagesDialog({
  open,
  onOpenChange,
  productId,
  productName,
  catalogUrl,
}: ProductImagesDialogProps) {
  const { data: photos = [] } = useProductPhotos(open ? productId : null);
  const [idx, setIdx] = useState(0);

  const images = useMemo(() => {
    const list: { url: string; caption?: string | null }[] = [];
    if (catalogUrl) list.push({ url: catalogUrl, caption: "Katalogbild" });
    for (const p of photos) {
      if (!list.some((i) => i.url === p.url)) list.push({ url: p.url, caption: p.caption });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-2">
        {current ? (
          <div className="relative">
            <img
              src={current.url}
              alt={current.caption || productName}
              className="h-auto max-h-[75vh] w-full rounded-md object-contain"
            />
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
            {images.length > 1 && (
              <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={img.url}
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`h-12 w-16 shrink-0 overflow-hidden rounded border ${
                      i === idx ? "border-primary" : "border-border opacity-70"
                    }`}
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
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
