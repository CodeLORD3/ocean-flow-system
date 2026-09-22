import { useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { STATUS_CLASS, STATUS_LABEL, mediaKindLabel, linkTypeLabel } from "@/lib/imageStatus";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { dayLabel, dayKey, dayDateLabel } from "@/lib/imageMeta";
import { useImageLinksFor } from "@/hooks/useImageLibrary";
import { useLinkTargetNames } from "@/hooks/useImagePickers";
import type { LibraryImage } from "@/hooks/useImageLibrary";

/** Klockslag i svensk form, t.ex. "11:54". */
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

/**
 * Rutnät med miniatyrer, dag för dag. Varje dag får en rubrik till vänster
 * ("Idag", "Igår", datum) och ett streck ut till kanten. Texten ligger i bilden:
 * namn, tid, plats och taggar.
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

  /** Bilderna grupperade per dag, senaste dagen först. */
  const days = useMemo(() => {
    const map = new Map<string, { img: LibraryImage; index: number }[]>();
    images.forEach((img, index) => {
      const key = dayKey(img.captured_at || img.created_at);
      const list = map.get(key);
      if (list) list.push({ img, index });
      else map.set(key, [{ img, index }]);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [images]);

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
    <div className="space-y-6">
      {days.map(([key, items]) => (
        <section key={key || "utan-datum"} className="space-y-3">
          {/* Dagsrubrik till vänster, streck ut till kanten */}
          <div className="sticky top-0 z-10 flex items-center gap-3 bg-background/90 py-2 backdrop-blur">
            <h3 className="font-heading text-sm font-bold text-foreground">{dayLabel(key)}</h3>
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {dayDateLabel(key)}
            </span>
            <span className="h-px flex-1 bg-border" />
            <button
              type="button"
              onClick={() => {
                const dayIds = items.map(({ img }) => img.id);
                const allOn = dayIds.every((id) => selectedIds.includes(id));
                onSelectedChange(
                  allOn
                    ? selectedIds.filter((id) => !dayIds.includes(id))
                    : Array.from(new Set([...selectedIds, ...dayIds])),
                );
              }}
              className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {items.every(({ img }) => selectedIds.includes(img.id))
                ? "Avmarkera dagen"
                : "Markera dagen"}
            </button>
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {items.length} bild{items.length === 1 ? "" : "er"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {items.map(({ img, index }) => {
              const selected = selectedIds.includes(img.id);
              const places = placesOf(img.id);
              const taken = img.captured_at || img.created_at;
              const place = places[0];
              return (
                <div
                  key={img.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => click(e, index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen(index);
                  }}
                  className={`group relative cursor-pointer overflow-hidden rounded-xl bg-muted ring-1 transition ${
                    selected ? "ring-2 ring-primary" : "ring-border/60 hover:ring-primary/40"
                  }`}
                >
                  <img
                    src={thumbUrl(img.url, THUMB_TILE)}
                    alt={img.title || img.caption || "Bild"}
                    className="aspect-[4/5] w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                  />

                  <span className="absolute left-1.5 top-1.5">
                    <Badge className={`${STATUS_CLASS[img.status]} text-[10px]`}>
                      {STATUS_LABEL[img.status]}
                    </Badge>
                  </span>
                  <button
                    type="button"
                    aria-label={selected ? "Avmarkera bilden" : "Markera bilden"}
                    aria-pressed={selected}
                    onClick={(e) => {
                      e.stopPropagation();
                      lastIndex.current = index;
                      onSelectedChange(
                        selected
                          ? selectedIds.filter((x) => x !== img.id)
                          : [...selectedIds, img.id],
                      );
                    }}
                    className={`absolute right-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-[13px] font-semibold transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/70 bg-black/35 text-white opacity-90 backdrop-blur hover:bg-black/55"
                    }`}
                  >
                    {selected ? "✓" : ""}
                  </button>

                  {/* Texten ligger i bilden: namn, tid, plats och namnet på bilden */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-2 pt-8">
                    <div className="flex items-center gap-1.5">
                      <StaffFace
                        name={img.uploaded_by_name}
                        className="h-6 w-6 border border-white/60 text-[9px]"
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-white drop-shadow">
                        {img.uploaded_by_name || "Äldre bild"}
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-white/80">
                        {timeOf(taken)}
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-white drop-shadow">
                      {img.title || img.caption || mediaKindLabel(img.media_kind)}
                    </p>
                    <p className="truncate text-[11px] text-white/85">
                      {place
                        ? `${linkTypeLabel(place.type)}: ${place.name}${
                            places.length > 1 ? ` +${places.length - 1}` : ""
                          }`
                        : "Ligger inte på något ställe än"}
                    </p>
                    {img.tags?.length > 0 && (
                      <div className="pointer-events-auto flex flex-wrap gap-1 pt-0.5">
                        {img.tags.slice(0, 2).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onTagClick?.(t);
                            }}
                            className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white backdrop-blur hover:bg-white/35"
                          >
                            {t}
                          </button>
                        ))}
                        {img.tags.length > 2 && (
                          <span className="text-[10px] text-white/80">+{img.tags.length - 2}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
