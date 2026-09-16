import { useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { EntityImageGallery } from "@/components/images/EntityImageGallery";
import {
  useEntityImages,
  useMyImageFavorites,
  useToggleImageFavorite,
  useUpdateEntityImage,
  useUploadEntityImage,
  type EntityImage,
} from "@/hooks/useEntityImages";
import type { MapZone } from "@/hooks/useStoreMap";

/** "Idag 14:05", "Igår 08:20" eller "12 sep 08:20". */
function shortWhen(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return `Idag ${time}`;
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (sameDay(d, yest)) return `Igår ${time}`;
  return `${d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} ${time}`;
}

/**
 * Bildrad högst upp i Översikt — de senaste bilderna från butiken,
 * både bilder placerade på kartan och bilder på butiken som helhet.
 */
export function StorePhotoStrip({
  storeId,
  planId,
  planImages,
  zones,
  onOpenZone,
}: {
  storeId: string;
  planId?: string | null;
  planImages: EntityImage[];
  zones: MapZone[];
  onOpenZone?: (zoneId: string) => void;
}) {
  const { data: storeImages = [] } = useEntityImages("store", storeId);
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const toggleFavorite = useToggleImageFavorite();
  const upload = useUploadEntityImage();
  const updateImage = useUpdateEntityImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [allOpen, setAllOpen] = useState(false);

  const zoneById = useMemo(
    () => Object.fromEntries(zones.map((z, i) => [z.id, { zone: z, nr: i + 1 }])),
    [zones]
  );

  const images = useMemo(() => {
    const all = [...planImages, ...storeImages];
    const seen = new Set<string>();
    return all
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 24);
  }, [planImages, storeImages]);

  const labelOf = (img: EntityImage) => {
    const z = zoneById[img.entity_id];
    if (z) return `${z.nr}. ${z.zone.name}`;
    return "Butiken";
  };
  const colorOf = (img: EntityImage) => zoneById[img.entity_id]?.zone.color ?? null;

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files)) {
        await upload.mutateAsync({ entityType: "store", entityId: storeId, file, floorPlanId: planId ?? null });
      }
      toast.success(files.length > 1 ? `${files.length} bilder tillagda` : "Bild tillagd");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ladda upp bilden");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> Senaste bilderna från butiken
          {images.length > 0 && <span className="tabular-nums">· {images.length}</span>}
        </p>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 rounded-full px-2.5 text-xs"
            onClick={() => setAllOpen((v) => !v)}
          >
            Alla bilder
            <ChevronDown className={cn("h-3.5 w-3.5 transition", allOpen && "rotate-180")} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
            Ny bild
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Inga bilder än — ta en bild på en yta i butiken så hamnar den här.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {images.map((img, i) => {
            const color = colorOf(img);
            const zoneId = zoneById[img.entity_id] ? img.entity_id : null;
            return (
              <button
                key={img.id}
                type="button"
                onClick={() => setIndex(i)}
                onDoubleClick={() => zoneId && onOpenZone?.(zoneId)}
                className={cn(
                  "group relative h-28 w-40 shrink-0 overflow-hidden rounded-lg border border-border",
                  "bg-muted text-left transition hover:shadow-md"
                )}
                title={img.caption ?? labelOf(img)}
              >
                <img
                  src={img.url}
                  alt={img.caption ?? labelOf(img)}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4">
                  <p className="flex items-center gap-1 truncate text-[10px] font-medium text-white">
                    {color && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    )}
                    {labelOf(img)}
                  </p>
                  <p className="truncate text-[9px] text-white/75">{shortWhen(img.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {allOpen && (
        <div className="mt-3 border-t border-border pt-3">
          <EntityImageGallery
            entityType="store"
            entityId={storeId}
            title="Alla bilder i butiken"
            description="Favoriter, kommentarer, utvalda bilder och arkiv per dag."
            editable
            catalog
          />
        </div>
      )}

      <ImageLightbox
        images={images}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        title="Bild från butiken"
        editable
        onSaveCaption={(id, caption) => updateImage.mutate({ id, caption })}
        favoriteIds={favoriteIds}
        onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
        sourceLabelOf={(img) => labelOf(img)}
      />
    </div>
  );
}
