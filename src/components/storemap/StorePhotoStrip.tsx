import { useMemo, useRef, useState } from "react";
import { Camera, ChevronDown, ImageIcon, LayoutGrid, List, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import {
  useEntityImages,
  useMyImageFavorites,
  useStoreAreaImages,
  useToggleImageFavorite,
  useUpdateEntityImage,
  useUploadEntityImage,
  type EntityImage,
} from "@/hooks/useEntityImages";
import type { MapObject, MapZone } from "@/hooks/useStoreMap";
import { dayBadgeClass } from "@/lib/dayColor";

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

/** Gruppnamn per dag: "Idag", "Igår", annars "Tisdag 16 sep". */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return "Idag";
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (sameDay(d, yest)) return "Igår";
  const weekday = d.toLocaleDateString("sv-SE", { weekday: "long" });
  const date = d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date}`;
}

/**
 * Bildrad högst upp i Översikt — butikens senaste bilder, med filter på
 * område och fotograf. Bilder som tagits från en uppgift bär med sig ytan,
 * så de går att plocka fram per plats och datum.
 */
export function StorePhotoStrip({
  storeId,
  planId,
  planImages,
  zones,
  objects = [],
  onOpenZone,
}: {
  storeId: string;
  planId?: string | null;
  planImages: EntityImage[];
  zones: MapZone[];
  objects?: MapObject[];
  onOpenZone?: (zoneId: string) => void;
}) {
  const { data: storeImages = [] } = useEntityImages("store", storeId);
  const areaIds = useMemo(() => [...zones.map((z) => z.id), ...objects.map((o) => o.id)], [zones, objects]);
  const { data: areaImages = [] } = useStoreAreaImages(areaIds);
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const toggleFavorite = useToggleImageFavorite();
  const upload = useUploadEntityImage();
  const updateImage = useUpdateEntityImage();
  const fileRef = useRef<HTMLInputElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [allOpen, setAllOpen] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<string>("alla");
  const [personFilter, setPersonFilter] = useState<string>("alla");
  /** Visningsläge: stora bilder eller lista med namn. */
  const [layout, setLayout] = useState<"bilder" | "lista">("bilder");

  const zoneById = useMemo(
    () => Object.fromEntries(zones.map((z, i) => [z.id, { zone: z, nr: i + 1 }])),
    [zones]
  );
  /** Ett objekt hör till sin yta, så en bild på en kyl filtreras med ytan. */
  const objectMeta = useMemo(
    () => Object.fromEntries(objects.map((o) => [o.id, { name: o.name, zoneId: o.zone_id }])),
    [objects]
  );

  const zoneIdOf = (img: EntityImage): string | null => {
    if (zoneById[img.entity_id]) return img.entity_id;
    return objectMeta[img.entity_id]?.zoneId ?? null;
  };

  /** Alla bilder, nyast först. */
  const allImagesRaw = useMemo(() => {
    const seen = new Set<string>();
    return [...areaImages, ...planImages, ...storeImages]
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [areaImages, planImages, storeImages]);

  const photographers = useMemo(() => {
    const m = new Map<string, number>();
    allImagesRaw.forEach((i) => {
      const who = i.uploaded_by_name?.trim();
      if (who) m.set(who, (m.get(who) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [allImagesRaw]);

  const zoneCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allImagesRaw.forEach((i) => {
      const key = zoneIdOf(i) ?? "butiken";
      m[key] = (m[key] ?? 0) + 1;
    });
    return m;
  }, [allImagesRaw, zoneById, objectMeta]);

  const allImages = useMemo(
    () =>
      allImagesRaw.filter((i) => {
        const z = zoneIdOf(i);
        if (zoneFilter === "butiken" && z) return false;
        if (zoneFilter !== "alla" && zoneFilter !== "butiken" && z !== zoneFilter) return false;
        if (personFilter !== "alla" && (i.uploaded_by_name?.trim() ?? "") !== personFilter) return false;
        return true;
      }),
    [allImagesRaw, zoneFilter, personFilter, zoneById, objectMeta]
  );

  const images = useMemo(() => allImages.slice(0, 24), [allImages]);

  /** Grupperat per dag, nyaste dagen först. */
  const groups = useMemo(() => {
    const out: { key: string; label: string; badge: string; items: { img: EntityImage; index: number }[] }[] = [];
    allImages.forEach((img, index) => {
      const key = new Date(img.created_at).toDateString();
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push({ img, index });
      else out.push({ key, label: dayLabel(img.created_at), badge: dayBadgeClass(img.created_at), items: [{ img, index }] });
    });
    return out;
  }, [allImages]);

  const labelOf = (img: EntityImage) => {
    const z = zoneById[img.entity_id];
    if (z) return `${z.nr}. ${z.zone.name}`;
    const o = objectMeta[img.entity_id];
    if (o) {
      const parent = o.zoneId ? zoneById[o.zoneId] : null;
      return parent ? `${parent.nr}. ${parent.zone.name} · ${o.name}` : o.name;
    }
    return "Butiken";
  };
  const colorOf = (img: EntityImage) => {
    const z = zoneIdOf(img);
    return z ? zoneById[z]?.zone.color ?? null : null;
  };

  const chip = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
      active ? "border-transparent text-white shadow-sm" : "border-border bg-card hover:bg-muted"
    );

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

  const card = (img: EntityImage, i: number, size: string) => {
    const color = colorOf(img);
    const zoneId = zoneIdOf(img);
    return (
      <button
        key={img.id}
        type="button"
        onClick={() => setIndex(i)}
        onDoubleClick={() => zoneId && onOpenZone?.(zoneId)}
        className={cn(
          "group relative overflow-hidden rounded-lg border border-border bg-muted text-left transition hover:shadow-md",
          size
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
            {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
            {labelOf(img)}
          </p>
          <p className="truncate text-[9px] text-white/75">
            {shortWhen(img.created_at)}
            {img.uploaded_by_name ? ` · ${img.uploaded_by_name}` : ""}
          </p>
        </div>
      </button>
    );
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" /> Senaste bilderna från butiken
          {allImages.length > 0 && <span className="tabular-nums">· {allImages.length}</span>}
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

      {/* Filter: område och fotograf */}
      <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setZoneFilter("alla")}
          className={chip(zoneFilter === "alla")}
          style={zoneFilter === "alla" ? { background: "hsl(var(--primary))" } : undefined}
        >
          Alla platser <span className="tabular-nums opacity-70">{allImagesRaw.length}</span>
        </button>
        {zones
          .filter((z) => (zoneCounts[z.id] ?? 0) > 0)
          .map((z) => {
            const active = zoneFilter === z.id;
            const color = z.color ?? "#1f4d6b";
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setZoneFilter(active ? "alla" : z.id)}
                onDoubleClick={() => onOpenZone?.(z.id)}
                className={chip(active)}
                style={active ? { background: color } : { borderColor: `${color}66`, color }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: active ? "#fff" : color }} />
                {zoneById[z.id]?.nr}. {z.name}
                <span className="tabular-nums opacity-70">{zoneCounts[z.id]}</span>
              </button>
            );
          })}
        {(zoneCounts["butiken"] ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setZoneFilter(zoneFilter === "butiken" ? "alla" : "butiken")}
            className={chip(zoneFilter === "butiken")}
            style={zoneFilter === "butiken" ? { background: "#64748b" } : undefined}
          >
            Butiken <span className="tabular-nums opacity-70">{zoneCounts["butiken"]}</span>
          </button>
        )}
      </div>

      {photographers.length > 1 && (
        <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setPersonFilter("alla")}
            className={chip(personFilter === "alla")}
            style={personFilter === "alla" ? { background: "hsl(var(--primary))" } : undefined}
          >
            Alla fotografer
          </button>
          {photographers.map(([who, n]) => (
            <button
              key={who}
              type="button"
              onClick={() => setPersonFilter(personFilter === who ? "alla" : who)}
              className={chip(personFilter === who)}
              style={personFilter === who ? { background: "#1f4d6b" } : undefined}
            >
              {who} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          ))}
        </div>
      )}

      {images.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
          Inga bilder här — ta en bild på en uppgift eller en yta i butiken så hamnar den här.
        </p>
      ) : (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {images.map((img, i) => card(img, i, "h-28 w-40 shrink-0"))}
        </div>
      )}

      {allOpen && (
        <div className="mt-3 space-y-4 border-t border-border pt-3">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", g.badge)}>{g.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{g.items.length} bilder</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {g.items.map(({ img, index: i }) => card(img, i, "aspect-[4/3]"))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageLightbox
        images={allImages}
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
