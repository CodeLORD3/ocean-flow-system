import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { STATUS_CLASS, STATUS_LABEL, mediaKindLabel, linkTypeLabel } from "@/lib/imageStatus";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { dayLabel, dayKey } from "@/lib/imageMeta";
import { useImageLinksFor } from "@/hooks/useImageLibrary";
import { useLinkTargetNames } from "@/hooks/useImagePickers";
import type { LibraryImage } from "@/hooks/useImageLibrary";

/**
 * Rutnät med miniatyrer. Varje bild visar vem som lagt ut den, vilken dag,
 * vilket område den är tagen i, vad den heter och dess taggar.
 * Markering: klick öppnar, Skift+klick markerar intervall, Ctrl/Cmd+klick enstaka.
 */
export default function ImageLibraryGrid({
  images,
  selectedIds,
  onSelectedChange,
  onOpen,
  onTagClick,
}: {
  images: LibraryImage[];
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  onOpen: (index: number) => void;
  onTagClick?: (tag: string) => void;
}) {
  const lastIndex = useRef<number | null>(null);
  const ids = useMemo(() => images.map((i) => i.id), [images]);
  const { data: linkMap } = useImageLinksFor(ids);
  const allLinks = useMemo(
    () =>
      Object.values(linkMap ?? {})
        .flat()
        .map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id })),
    [linkMap],
  );
  const { data: names } = useLinkTargetNames(allLinks);

  /** Alla ställen i systemet där bilden ligger — område/butik först. */
  function placesOf(id: string): { key: string; type: string; name: string }[] {
    const links = linkMap?.[id] ?? [];
    const order = ["zone", "store", "resource", "product", "task", "observation", "location"];
    return links
      .map((l) => ({
        key: l.id,
        type: l.entity_type,
        name: names?.[`${l.entity_type}:${l.entity_id}`] || "Okänt namn",
      }))
      .sort((a, b) => {
        const ia = order.indexOf(a.type);
        const ib = order.indexOf(b.type);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
  }

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
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((img, i) => {
        const selected = selectedIds.includes(img.id);
        const places = placesOf(img.id);
        const taken = img.captured_at || img.created_at;
        return (
          <div
            key={img.id}
            role="button"
            tabIndex={0}
            onClick={(e) => click(e, i)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onOpen(i);
            }}
            className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-card text-left transition ${
              selected ? "ring-2 ring-primary" : "hover:border-primary/40"
            }`}
          >
            <div className="relative">
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
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  ✓
                </span>
              )}
            </div>

            <div className="space-y-1.5 px-2 py-2">
              <p className="truncate text-sm font-medium">
                {img.title || img.caption || mediaKindLabel(img.media_kind)}
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <StaffFace name={img.uploaded_by_name} className="h-5 w-5 text-[9px]" />
                <span className="min-w-0 flex-1 truncate">
                  {img.uploaded_by_name || "Äldre bild"}
                </span>
                <span className="whitespace-nowrap tabular-nums">{dayLabel(dayKey(taken))}</span>
              </div>
              {/* Alla ställen i systemet där bilden ligger */}
              {places.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Ligger inte på något ställe än</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {places.slice(0, 3).map((p) => (
                    <span
                      key={p.key}
                      className="max-w-full truncate rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      title={`${linkTypeLabel(p.type)}: ${p.name}`}
                    >
                      {linkTypeLabel(p.type)}: {p.name}
                    </span>
                  ))}
                  {places.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{places.length - 3} till
                    </span>
                  )}
                </div>
              )}
              {img.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {img.tags.slice(0, 3).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onTagClick?.(t);
                      }}
                      className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground hover:bg-primary hover:text-primary-foreground"
                    >
                      {t}
                    </button>
                  ))}
                  {img.tags.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">
                      +{img.tags.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
