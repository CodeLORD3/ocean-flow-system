import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { StorageImage } from "@/components/storage/StorageMedia";

/**
 * Miniatyr för ett auktionspartis lådbilder. Antalet visas i hörnet och ett
 * tryck öppnar bilderna i helskärm där man kan bläddra mellan lådorna.
 */
export default function AuctionPhotoStrip({ photos }: { photos: string[] }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const count = photos.length;
  const step = (delta: number) => setIndex((i) => (i + delta + count) % count);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (!count) return;
          setIndex(0);
          setOpen(true);
        }}
        aria-label={count > 1 ? `Visa ${count} bilder` : "Visa bilden"}
        className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
      >
        <StorageImage url={photos[0] ?? null} alt="Lådans lapp" className="h-full w-full object-cover" />
        {count > 1 && (
          <span className="absolute inset-x-0 bottom-0 bg-foreground/70 py-0.5 text-[13px] font-semibold text-background">
            {count} bilder
          </span>
        )}
      </button>

      {open && count > 0 && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-foreground/95">
          <div className="flex items-center justify-between px-3 py-3">
            <span className="text-[18px] font-semibold text-background">
              Bild {index + 1} av {count}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Stäng"
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-background"
            >
              <X className="h-7 w-7" />
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center px-2">
            <StorageImage
              url={photos[index]}
              alt={`Lådans lapp, bild ${index + 1}`}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
          {count > 1 && (
            <div
              className="flex gap-3 px-4 py-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label="Föregående bild"
                className="flex h-16 flex-1 items-center justify-center rounded-2xl bg-background/15 text-background"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label="Nästa bild"
                className="flex h-16 flex-1 items-center justify-center rounded-2xl bg-background/15 text-background"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
