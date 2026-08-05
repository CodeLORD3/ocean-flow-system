import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EntityImage } from "@/hooks/useEntityImages";

type Props = {
  images: EntityImage[];
  /** Index i images-listan, eller null när galleriet är stängt */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  title?: string;
  editable?: boolean;
  onSaveCaption?: (id: string, caption: string | null) => void;
};

/** Helskärmsgalleri med pilnavigering (tangentbord) och swipe (mobil). */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title = "Bild",
  editable = false,
  onSaveCaption,
}: Props) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index as number] : null;
  const [caption, setCaption] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCaption(current?.caption || "");
  }, [current?.id, current?.caption]);

  const go = (delta: number) => {
    if (index === null || images.length === 0) return;
    const next = (index + delta + images.length) % images.length;
    onIndexChange(next);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length]);

  const saveCaption = () => {
    if (!current || !onSaveCaption) return;
    const v = caption.trim();
    if (v !== (current.caption || "")) onSaveCaption(current.id, v || null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          saveCaption();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Helskärmsvisning av bilder</DialogDescription>
        </DialogHeader>

        {current && (
          <>
            <div
              className="relative bg-black/90 flex items-center justify-center select-none"
              onTouchStart={(e) => {
                const t = e.touches[0];
                touchStart.current = { x: t.clientX, y: t.clientY };
              }}
              onTouchEnd={(e) => {
                const s = touchStart.current;
                touchStart.current = null;
                if (!s) return;
                const t = e.changedTouches[0];
                const dx = t.clientX - s.x;
                const dy = t.clientY - s.y;
                if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
              }}
            >
              <img
                src={current.url}
                alt={current.caption || title}
                className="max-h-[72vh] w-full object-contain"
              />

              {images.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Föregående bild"
                    onClick={() => go(-1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Nästa bild"
                    onClick={() => go(1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </>
              )}

              <span className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 font-mono tabular-nums text-[11px] text-foreground backdrop-blur">
                {(index as number) + 1} / {images.length}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {editable ? (
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onBlur={saveCaption}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCaption();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="Lägg till kommentar…"
                  className="h-8 text-xs"
                />
              ) : (
                <p className="text-xs text-muted-foreground">{current.caption || "—"}</p>
              )}
              <p className="text-[10px] text-muted-foreground">
                Bläddra med piltangenterna eller swipa på mobil.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
