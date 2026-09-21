import { useEffect, useState } from "react";
import ImageClassifySheet from "./ImageClassifySheet";
import type { LibraryImage } from "@/hooks/useImageLibrary";

/**
 * Snabbläge: en bild i taget. Vänster/höger byter bild, Esc stänger,
 * Enter sparar och går vidare, 1–6 väljer vad bilden visar.
 */
export default function ImageQuickClassify({
  images,
  startIndex = 0,
  open,
  onClose,
  defaultStoreId,
}: {
  images: LibraryImage[];
  startIndex?: number;
  open: boolean;
  onClose: () => void;
  defaultStoreId?: string | null;
}) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") onClose();
      if (typing) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, images.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, images.length, onClose]);

  const image = images[index] ?? null;

  function next() {
    if (index >= images.length - 1) {
      onClose();
      return;
    }
    setIndex((i) => i + 1);
  }

  if (!open || !image) return null;

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full bg-foreground/90 px-3 py-1 text-xs text-background">
        Bild {index + 1} av {images.length} — piltangenter byter, Enter sparar, Esc stänger
      </div>
      <ImageClassifySheet
        image={image}
        open={open}
        onOpenChange={(v) => {
          if (!v) onClose();
        }}
        defaultStoreId={defaultStoreId}
        onSavedNext={next}
      />
    </>
  );
}
