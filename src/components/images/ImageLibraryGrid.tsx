import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { STATUS_CLASS, STATUS_LABEL, mediaKindLabel } from "@/lib/imageStatus";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import type { LibraryImage } from "@/hooks/useImageLibrary";

/**
 * Rutnät med miniatyrer. Markering: klick öppnar, Skift+klick markerar intervall,
 * Ctrl/Cmd+klick markerar enstaka.
 */
export default function ImageLibraryGrid({
  images,
  selectedIds,
  onSelectedChange,
  onOpen,
}: {
  images: LibraryImage[];
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onOpen: (index: number) => void;
}) {
  const lastIndex = useRef<number | null>(null);

  function click(e: React.MouseEvent, index: number) {
    const id = images[index].id;
    if (e.shiftKey && lastIndex.current !== null) {
      e.preventDefault();
      const [a, b] = [lastIndex.current, index].sort((x, y) => x - y);
      const range = images.slice(a, b + 1).map((i) => i.id);
      onSelectedChange(Array.from(new Set([...selectedIds, ...range])));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      lastIndex.current = index;
      onSelectedChange(
        selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
      );
      return;
    }
    lastIndex.current = index;
    if (selectedIds.length > 0) {
      onSelectedChange(
        selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
      );
      return;
    }
    onOpen(index);
  }

  if (images.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Inga bilder här ännu.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {images.map((img, i) => {
        const selected = selectedIds.includes(img.id);
        return (
          <button
            key={img.id}
            type="button"
            onClick={(e) => click(e, i)}
            className={`group relative overflow-hidden rounded-lg border text-left transition ${
              selected ? "ring-2 ring-primary" : "hover:opacity-95"
            }`}
          >
            <img
              src={thumbUrl(img.url, THUMB_TILE)}
              alt={img.title || img.caption || "Bild"}
              className="aspect-[4/5] w-full object-cover"
              loading="lazy"
              decoding="async"
            />
            <span className="absolute left-1.5 top-1.5">
              <Badge className={`${STATUS_CLASS[img.status]} text-[10px]`}>
                {STATUS_LABEL[img.status]}
              </Badge>
            </span>
            <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[11px] text-white">
              <StaffFace name={img.uploaded_by_name} className="h-5 w-5 text-[9px]" />
              <span className="min-w-0 flex-1 truncate">
                {img.title || mediaKindLabel(img.media_kind)}
              </span>
            </span>
            {selected && (
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
