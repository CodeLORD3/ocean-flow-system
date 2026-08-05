import { useMemo, useRef, useState } from "react";
import {
  ImagePlus,
  Trash2,
  Loader2,
  ImageIcon,
  Star,
  Crop,
  SlidersHorizontal,
  Check,
  Heart,
  CalendarDays,
  MessageSquare,
  ListFilter,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useEntityImages,
  useUploadEntityImage,
  useUpdateEntityImage,
  useDeleteEntityImage,
  useSetCoverImage,
  useSetFeaturedImages,
  useMyImageFavorites,
  useToggleImageFavorite,
  type EntityImage,
} from "@/hooks/useEntityImages";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { cn } from "@/lib/utils";
import { focalStyle, focalPercent, focalLabel } from "@/lib/imageFocal";
import { dayKey, dayLabel, initialsOf } from "@/lib/imageMeta";

/** Datum + tid då bilden laddades upp, t.ex. "03-08 10:24". */
function uploadedLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return (
    d.toLocaleDateString("sv-SE", { day: "2-digit", month: "2-digit" }) +
    " " +
    d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
  );
}

type View = { mode: "featured" } | { mode: "favorites" } | { mode: "day"; key: string };

type Props = {
  entityType: string;
  entityId: string;
  title?: string;
  description?: string;
  /** Tillåt uppladdning/borttagning */
  editable?: boolean;
  className?: string;
  /** Antal kolumner i rutnätet */
  columnsClassName?: string;
  /** Visa bara ett begränsat antal bilder i förhandsvyn (t.ex. 4) */
  previewCount?: number;
  /** Visa katalogpanel (arkiv per dag + favoriter) till vänster */
  catalog?: boolean;
};

const DATE_PAGE = 8;

export function EntityImageGallery({
  entityType,
  entityId,
  title = "Bilder",
  description,
  editable = true,
  className,
  columnsClassName = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
  previewCount,
  catalog = false,
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [frontSelection, setFrontSelection] = useState<string[]>([]);
  const [dateLimit, setDateLimit] = useState(DATE_PAGE);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [lastDay, setLastDay] = useState(() => dayKey(new Date().toISOString()));
  const selectDay = (key: string) => {
    setLastDay(key);
    setView({ mode: "day", key });
  };

  const [view, setView] = useState<View>({ mode: "featured" });

  const { data: images = [], isLoading } = useEntityImages(entityType, entityId);
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const upload = useUploadEntityImage();
  const updateImage = useUpdateEntityImage();
  const removeImage = useDeleteEntityImage();
  const setCover = useSetCoverImage();
  const setFeatured = useSetFeaturedImages();
  const toggleFavorite = useToggleImageFavorite();

  const featured = images.filter((i) => i.is_featured);
  const favorites = images.filter((i) => favoriteIds.includes(i.id));

  /** Poolen med utvalda bilder (valfritt antal), sorterad så framsidans bilder ligger först. */
  const pool = useMemo(
    () =>
      featured
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)),
    [featured],
  );

  /** Datum (nycklar) som har bilder, senaste först. */
  const dates = useMemo(() => {
    const map = new Map<string, number>();
    images.forEach((i) => {
      const k = dayKey(i.created_at);
      map.set(k, (map.get(k) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [images]);

  const previewImages: EntityImage[] = previewCount ? pool.slice(0, previewCount) : images;

  /** Aktivt datum i katalogen — styr dagsvyn. */
  const activeDay = view.mode === "day" ? view.key : lastDay;

  const shown: EntityImage[] = useMemo(() => {
    if (!catalog) return previewImages;
    if (view.mode === "favorites") return favorites;
    if (view.mode === "featured") return previewImages;
    return images.filter((i) => dayKey(i.created_at) === view.key);
  }, [catalog, view, images, favorites, previewImages]);

  /** I helskärmsläge bläddrar man genom hela den utvalda poolen, inte bara de synliga. */
  const lightboxImages: EntityImage[] =
    previewCount && (!catalog || view.mode === "featured") && pool.length ? pool : shown;

  const lightboxIndex = lightboxId ? lightboxImages.findIndex((i) => i.id === lightboxId) : -1;

  const openSelect = () => {
    setSelection(featured.map((i) => i.id));
    setFrontSelection(previewImages.map((i) => i.id));
    setSelectOpen(true);
  };

  const toggleSelection = (id: string) => {
    setSelection((prev) => {
      if (prev.includes(id)) {
        setFrontSelection((f) => f.filter((x) => x !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const toggleFront = (id: string) => {
    setFrontSelection((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      const next = [...prev, id];
      return previewCount && next.length > previewCount ? next.slice(-previewCount) : next;
    });
  };


  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (let i = 0; i < files.length; i++) {
        await upload.mutateAsync({
          entityType,
          entityId,
          file: files[i],
          sortOrder: images.length + i,
        });
      }
      toast({ title: "Bild uppladdad", description: `${files.length} bild(er) sparade.` });
      if (catalog) selectDay(dayKey(new Date().toISOString()));
    } catch (e: any) {
      toast({ title: "Kunde inte ladda upp", description: e.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const catalogButton = (
    active: boolean,
    key: string,
    label: string,
    count: number,
    icon?: React.ReactNode,
    onClick?: () => void
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center justify-between gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] transition-colors",
        active
          ? "bg-primary/10 text-primary font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className="font-mono tabular-nums text-[10px] opacity-70">{count}</span>
    </button>
  );

  const emptyText =
    catalog && view.mode === "favorites"
      ? "Inga favoriter ännu — tryck på hjärtat på en bild."
      : catalog && view.mode === "day"
        ? "Inga bilder detta datum."
        : catalog && view.mode === "featured"
          ? "Inga utvalda bilder ännu — välj vilka bilder som ska visas."
          : "Inga bilder ännu";

  /** Snabbmarkering direkt på bilden: lägg till/ta bort ur den utvalda poolen (valfritt antal). */
  const toggleFeatured = (img: EntityImage) => {
    const current = featured.map((i) => i.id);
    const next = img.is_featured ? current.filter((id) => id !== img.id) : [...current, img.id];
    setFeatured.mutate({ entityType, entityId, imageIds: next });
  };


  const grid = (

    <div className={cn("grid gap-2", columnsClassName)}>
      {shown.map((img) => {
        const isFav = favoriteIds.includes(img.id);
        return (
          <Card key={img.id} className="overflow-hidden group relative">
            <button
              type="button"
              onClick={() => setLightboxId(img.id)}
              className="relative block w-full aspect-video bg-muted overflow-hidden"
            >
              <img
                src={img.url}
                alt={img.caption || `${title} bild`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                style={focalStyle(img.focal_point)}
              />
              {/* Uppladdningstidpunkt i nedre vänstra hörnet av bilden */}
              <span className="absolute bottom-1 left-1 rounded bg-background/80 px-1 py-0.5 font-mono tabular-nums text-[9px] text-foreground backdrop-blur pointer-events-none">
                {uploadedLabel(img.created_at)}
              </span>
            </button>

            {img.is_cover && (
              <Badge className="absolute top-1 left-1 h-4 gap-1 px-1.5 text-[9px] pointer-events-none">
                <ImageIcon className="h-2.5 w-2.5" />
                Omslag
              </Badge>
            )}

            {/* Favorit */}
            <button
              type="button"
              aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera bild"}
              onClick={() => toggleFavorite.mutate({ imageId: img.id, favorite: !isFav })}
              className={cn(
                "absolute bottom-1 right-1 h-6 w-6 rounded-full bg-background/85 backdrop-blur flex items-center justify-center border transition-opacity",
                isFav
                  ? "text-rose-500 border-rose-400"
                  : "text-muted-foreground border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
            >
              <Heart className={cn("h-3 w-3", isFav && "fill-current")} />
            </button>

            {editable && (
              <>
                {previewCount ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={img.is_featured ? "Ta bort från utvalda" : "Markera som utvald"}
                        onClick={() => toggleFeatured(img)}
                        className={cn(
                          "absolute top-1 right-8 h-6 w-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center border transition-opacity",
                          img.is_featured
                            ? "text-amber-500 border-amber-400"
                            : "text-muted-foreground border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        )}
                      >
                        <Star className={cn("h-3 w-3", img.is_featured && "fill-current")} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {img.is_featured
                        ? "Utvald bild – klicka för att ta bort"
                        : "Lägg till i utvalda bilder"}
                    </TooltipContent>

                  </Tooltip>
                ) : null}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={img.is_cover ? "Ta bort som omslagsbild" : "Använd som omslagsbild"}
                      onClick={() =>
                        setCover.mutate({
                          entityType,
                          entityId,
                          imageId: img.is_cover ? null : img.id,
                        })
                      }
                      className={cn(
                        "absolute top-1 right-1 h-6 w-6 rounded-full bg-background/80 backdrop-blur flex items-center justify-center border transition-opacity",
                        img.is_cover
                          ? "text-primary border-primary"
                          : "text-muted-foreground border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      )}
                    >
                      <ImageIcon className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {img.is_cover ? "Omslagsbild – klicka för att ta bort" : "Sätt som omslagsbild"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}


            <div className="p-1.5 flex items-center gap-1">
              {/* Uppladdare */}
              <span className="flex min-w-0 flex-1 items-center gap-1">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary">
                  {initialsOf(img.uploaded_by_name)}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {img.uploaded_by_name || "Okänd"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setLightboxId(img.id)}
                aria-label="Öppna kommentarer"
                className="h-5 w-5 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
              >
                <MessageSquare className="h-3 w-3" />
              </button>
              {editable && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-muted-foreground shrink-0"
                      aria-label="Justera beskärning"
                      title={`Beskärning: ${focalLabel(img.focal_point)}`}
                    >
                      <Crop className="h-3 w-3" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-3">
                    <p className="mb-2 text-[11px] font-medium text-muted-foreground">
                      Bildposition: {focalLabel(img.focal_point)}
                    </p>
                    <Slider
                      value={[focalPercent(img.focal_point)]}
                      min={0}
                      max={100}
                      step={1}
                      onValueChange={(v) => updateImage.mutate({ id: img.id, focal_point: String(v[0]) })}
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                      <span>Överkant</span>
                      <span>Nederkant</span>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              {editable && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0"
                  aria-label="Ta bort bild"
                  onClick={() => removeImage.mutate(img.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-heading font-bold text-foreground flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {title}
          </h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {catalog && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={catalogOpen ? "default" : "outline"}
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  aria-pressed={catalogOpen}
                  aria-label={catalogOpen ? "Göm katalog" : "Visa katalog"}
                  onClick={() => setCatalogOpen((v) => !v)}
                >
                  <ListFilter className="h-3 w-3" />
                  Filter
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {catalogOpen ? "Göm katalog" : "Visa katalog (datum & favoriter)"}
              </TooltipContent>
            </Tooltip>
          )}

          {images.length > 0 && (
            <Badge variant="secondary" className="h-6 font-mono tabular-nums text-[10px]">
              {images.length} {images.length === 1 ? "bild" : "bilder"}
            </Badge>
          )}
          {favorites.length > 0 && (
            <Badge
              variant="outline"
              className="h-6 gap-1 font-mono tabular-nums text-[10px] text-rose-500 border-rose-300"
            >
              <Heart className="h-2.5 w-2.5 fill-current" />
              {favorites.length}
            </Badge>
          )}
          {editable && previewCount && images.length > 0 && (
            <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={openSelect}>
              <SlidersHorizontal className="h-3 w-3" />
              Redigera vilka bilder som visas
            </Button>
          )}
          {editable && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={upload.isPending}
              >
                {upload.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImagePlus className="h-3 w-3" />
                )}
                Lägg till bild
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Laddar bilder…</div>
      ) : !catalog && images.length === 0 ? (
        <Card className="p-4 text-center border-dashed">
          <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
          <p className="mt-1 text-xs text-muted-foreground">Inga bilder ännu</p>
        </Card>
      ) : catalog && catalogOpen ? (
        <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">

          {/* Katalog */}
          <Card className="p-2 h-fit">
            <p className="mb-1.5 flex items-center gap-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              Katalog
            </p>
            <div className="space-y-0.5">
              {catalogButton(
                view.mode === "favorites",
                "fav",
                "Favoriter",
                favorites.length,
                <Heart className={cn("h-3 w-3", view.mode === "favorites" && "fill-current")} />,
                () => setView({ mode: "favorites" })
              )}
              {previewCount
                ? catalogButton(
                    view.mode === "featured",
                    "featured",
                    "Utvalda",
                    previewImages.length,

                    <Star className="h-3 w-3" />,
                    () => setView({ mode: "featured" })
                  )
                : null}
              <div className="my-1 border-t" />
              {dates.slice(0, dateLimit).map(([key, count]) =>
                catalogButton(
                  view.mode === "day" && view.key === key,
                  key,
                  dayLabel(key),
                  count,
                  undefined,
                  () => selectDay(key)
                )
              )}
              {dates.length === 0 && (
                <p className="px-2 py-1 text-[10px] text-muted-foreground">Inga datum ännu</p>
              )}
              {/* Dagens datum finns alltid som val även utan bilder */}
              {dates.length > 0 &&
                !dates.some(([k]) => k === dayKey(new Date().toISOString())) &&
                catalogButton(
                  view.mode === "day" && view.key === dayKey(new Date().toISOString()),
                  "today",
                  "Idag",
                  0,
                  undefined,
                  () => selectDay(dayKey(new Date().toISOString()))
                )}
              {dates.length > dateLimit && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-full text-[10px]"
                  onClick={() => setDateLimit((n) => n + DATE_PAGE)}
                >
                  Ladda fler datum
                </Button>
              )}
            </div>
          </Card>

          <div>
            {shown.length === 0 ? (
              <Card className="p-4 text-center border-dashed">
                <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
                <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
              </Card>
            ) : (
              grid
            )}
          </div>
        </div>
      ) : shown.length === 0 ? (
        <Card className="p-4 text-center border-dashed">
          <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
          <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
        </Card>
      ) : (
        grid
      )}


      <ImageLightbox
        images={shown}
        index={lightboxIndex >= 0 ? lightboxIndex : null}
        onIndexChange={(i) => setLightboxId(shown[i]?.id ?? null)}
        onClose={() => setLightboxId(null)}
        title={title}
        editable={editable}
        onSaveCaption={(id, caption) => updateImage.mutate({ id, caption })}
        favoriteIds={favoriteIds}
        onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
      />

      {previewCount && (
        <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-sm">Välj bilder till förhandsvyn</DialogTitle>
              <DialogDescription className="text-xs">
                Markera upp till {previewCount} bilder som ska visas på översiktssidan. Utan val visas de
                senaste automatiskt.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto sm:grid-cols-4">
              {images.map((img) => {
                const active = selection.includes(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => toggleSelection(img.id)}
                    className={cn(
                      "relative aspect-video overflow-hidden rounded-md border-2 bg-muted",
                      active ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    <img
                      src={img.url}
                      alt={img.caption || "Bild"}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      style={focalStyle(img.focal_point)}
                    />
                    {active && (
                      <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {selection.length} / {previewCount} valda
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelection([])}>
                  Rensa val
                </Button>
                <Button
                  size="sm"
                  disabled={setFeatured.isPending}
                  onClick={async () => {
                    try {
                      await setFeatured.mutateAsync({ entityType, entityId, imageIds: selection });
                      setSelectOpen(false);
                      toast({ title: "Förhandsvyn uppdaterad" });
                    } catch (e: any) {
                      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
                    }
                  }}
                >
                  Spara
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Knapp som öppnar galleriet i en dialog – används i täta tabeller/listor. */
export function EntityImagesButton({
  entityType,
  entityId,
  label = "Bilder",
  title,
  description,
}: {
  entityType: string;
  entityId: string;
  label?: string;
  title?: string;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: images = [] } = useEntityImages(entityType, entityId);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 gap-1 text-[10px] text-muted-foreground"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <ImageIcon className="h-3 w-3" />
        {label}
        {images.length > 0 && <span className="font-semibold text-foreground">{images.length}</span>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{title || label}</DialogTitle>
            <DialogDescription className="text-xs">
              {description || "Ladda upp en eller flera bilder"}
            </DialogDescription>
          </DialogHeader>
          <EntityImageGallery
            entityType={entityType}
            entityId={entityId}
            title={title || label}
            columnsClassName="grid-cols-2 sm:grid-cols-3"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
