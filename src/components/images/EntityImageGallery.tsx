import { useEffect, useMemo, useRef, useState } from "react";
import {
  ImagePlus,
  Camera,
  ChevronDown,
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
  Search,
  Pencil,

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
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { dayBadgeClass } from "@/lib/dayColor";
import { thumbUrl, THUMB_TILE, THUMB_CARD } from "@/lib/imageThumb";
import {
  useImageGroups,
  useCreateImageGroup,
  useAddImagesToGroup,
  useUpdateImageGroup,
  useDeleteImageGroup,
  useSaveDayDescription,
} from "@/hooks/useImageGroups";
import { FolderPlus, Folder } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

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

type View =
  | { mode: "featured" }
  | { mode: "favorites" }
  | { mode: "day"; key: string }
  | { mode: "group"; id: string };

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
  const cameraRef = useRef<HTMLInputElement>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [selectOpen, setSelectOpen] = useState(false);
  const [selection, setSelection] = useState<string[]>([]);
  const [frontSelection, setFrontSelection] = useState<string[]>([]);
  const [dateLimit, setDateLimit] = useState(DATE_PAGE);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  /** Markeringsläge för att samla bilder i en grupp. */
  const [pickMode, setPickMode] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupDialog, setGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [dayDesc, setDayDesc] = useState<string | null>(null);
  /** Fritextsökning på bildnamn, person och datum. */
  const [search, setSearch] = useState("");
  /** Nyss uppladdade bilder som ska namnges. */
  const [nameIds, setNameIds] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  /** Bild som döps om direkt i rutnätet. */
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");

  const [lastDay, setLastDay] = useState(() => dayKey(new Date().toISOString()));
  const selectDay = (key: string) => {
    setLastDay(key);
    setDayDesc(null);
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

  /** Grupper: dagsgrupper med beskrivning och egna grupper med valda bilder. */
  const { data: groups = [] } = useImageGroups(entityType, entityId);
  const createGroup = useCreateImageGroup();
  const addToGroup = useAddImagesToGroup();
  const updateGroup = useUpdateImageGroup();
  const deleteGroup = useDeleteImageGroup();
  const saveDayDesc = useSaveDayDescription();
  const manualGroups = groups.filter((g) => g.kind !== "day");
  const dayGroups = groups.filter((g) => g.kind === "day");
  const activeGroup = view.mode === "group" ? groups.find((g) => g.id === view.id) : undefined;

  /** Dagens datumnyckel — uppdateras automatiskt när dygnet slår över. */
  const [todayKey, setTodayKey] = useState(() => dayKey(new Date().toISOString()));
  useEffect(() => {
    const tick = () => setTodayKey(dayKey(new Date().toISOString()));
    const id = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);

  /**
   * Utvalda bilder gäller bara för dagens datum. När dygnet slår över hamnar
   * gårdagens bilder i sitt datumfilter och "Utvalda" nollställs — favoriter
   * är det enda filter som alltid följer med.
   */
  const featured = images.filter((i) => i.is_featured && dayKey(i.created_at) === todayKey);
  const favorites = images.filter((i) => favoriteIds.includes(i.id));
  /** Antal bilder som laddats upp idag — styr påminnelsen om stjärnmärkning. */
  const todayImageCount = images.filter((i) => dayKey(i.created_at) === todayKey).length;

  /**
   * Poolen med utvalda bilder (valfritt antal), sorterad så framsidans bilder ligger först.
   * Saknas utvalda bilder för idag visas dagens senaste bilder automatiskt tills
   * någon markerar egna favoriter med stjärnan.
   */
  const pool = useMemo(() => {
    if (featured.length)
      return featured
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
    return images
      .filter((i) => dayKey(i.created_at) === todayKey)
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, previewCount || 4);
  }, [featured, images, todayKey, previewCount]);


  /**
   * Datum i katalogen som en sammanhängande kalender: varje dag från idag och
   * bakåt till den äldsta bilden finns med, även dagar utan bilder.
   */
  const dates = useMemo(() => {
    const counts = new Map<string, number>();
    images.forEach((i) => {
      const k = dayKey(i.created_at);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const keys = Array.from(counts.keys()).sort();
    const oldest = keys[0] || todayKey;
    const out: [string, number][] = [];
    const cursor = new Date(`${todayKey}T12:00:00`);
    const stop = new Date(`${oldest}T12:00:00`);
    // Skydd mot orimligt långa listor (max ~2 år).
    for (let guard = 0; guard < 800 && cursor.getTime() >= stop.getTime(); guard++) {
      const k = dayKey(cursor.toISOString());
      out.push([k, counts.get(k) || 0]);
      cursor.setDate(cursor.getDate() - 1);
    }
    return out;
  }, [images, todayKey]);



  const previewImages: EntityImage[] = previewCount ? pool.slice(0, previewCount) : images;

  /** Aktivt datum i katalogen — styr dagsvyn. */
  const activeDay = view.mode === "day" ? view.key : lastDay;

  /** Sökningen går igenom alla bilder, oavsett vilket filter som är valt. */
  const searchHits: EntityImage[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return images.filter((i) =>
      [i.caption, i.uploaded_by_name, dayLabel(dayKey(i.created_at)), dayKey(i.created_at)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [images, search]);

  const shown: EntityImage[] = useMemo(() => {
    if (search.trim()) return searchHits;
    if (!catalog) return previewImages;
    if (view.mode === "favorites") return favorites;
    if (view.mode === "featured") return previewImages;
    if (view.mode === "group") {
      const g = groups.find((x) => x.id === view.id);
      if (!g) return [];
      return g.imageIds.map((id) => images.find((i) => i.id === id)).filter(Boolean) as EntityImage[];
    }
    return images.filter((i) => dayKey(i.created_at) === view.key);
  }, [catalog, view, images, favorites, previewImages, groups, search, searchHits]);

  /** I helskärmsläge bläddrar man genom hela den utvalda poolen, inte bara de synliga. */
  const lightboxImages: EntityImage[] =
    previewCount && (!catalog || view.mode === "featured") && pool.length ? pool : shown;

  /** Antal tomma platser på framsidan när dagens utvalda bilder saknas. */
  const missingSlots =
    previewCount && (!catalog || view.mode === "featured")
      ? Math.max(0, previewCount - shown.length)
      : 0;

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
      const newIds: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const id = await upload.mutateAsync({
          entityType,
          entityId,
          file: files[i],
          sortOrder: images.length + i,
        });
        if (id) newIds.push(id);
      }
      toast({ title: "Bild uppladdad", description: `${files.length} bild(er) sparade.` });
      if (newIds.length) {
        setNames({});
        setNameIds(newIds);
      }
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
        "w-full flex items-center justify-between gap-1.5 rounded-md px-2 py-2.5 text-left text-xs transition-colors sm:py-1.5 sm:text-[11px]",
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
    catalog && view.mode === "featured" && previewCount
      ? "Inga utvalda bilder för idag — ladda upp dagens bilder och markera dem med stjärnan."
      :
    catalog && view.mode === "favorites"
      ? "Inga favoriter ännu — tryck på hjärtat på en bild."
      : catalog && view.mode === "group"
        ? "Gruppen är tom — markera bilder och samla dem här."
      : catalog && view.mode === "day"
        ? "Inga bilder detta datum."
        : catalog && view.mode === "featured"
          ? "Inga utvalda bilder ännu — välj vilka bilder som ska visas."
          : "Inga bilder ännu";

  /**
   * Snabbmarkering direkt på bilden. Urvalet hanteras per dag, så gamla dagars
   * utvalda bilder ligger kvar i Bildflödet.
   */
  const toggleFeatured = (img: EntityImage) => {
    const day = dayKey(img.created_at);
    const current = images.filter((i) => i.is_featured && dayKey(i.created_at) === day).map((i) => i.id);
    const next = img.is_featured ? current.filter((id) => id !== img.id) : [...current, img.id];
    setFeatured.mutate({ entityType, entityId, day, imageIds: next });
  };

  /** Markera bilder för att samla dem i en grupp. */
  const togglePicked = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const saveGroup = async (existingId?: string) => {
    try {
      if (existingId) {
        await addToGroup.mutateAsync({ groupId: existingId, imageIds: picked, entityType, entityId });
      } else {
        if (!groupName.trim()) {
          toast({ title: "Gruppen behöver ett namn", variant: "destructive" });
          return;
        }
        await createGroup.mutateAsync({
          entityType,
          entityId,
          name: groupName.trim(),
          description: groupDesc.trim() || null,
          imageIds: picked,
        });
      }
      toast({ title: "Bilderna samlade i gruppen" });
      setGroupDialog(false);
      setGroupName("");
      setGroupDesc("");
      setPicked([]);
      setPickMode(false);
    } catch (e: any) {
      toast({ title: "Kunde inte spara gruppen", description: e.message, variant: "destructive" });
    }
  };

  const grid = (

    <div className={cn("grid gap-2", columnsClassName)}>
      {shown.map((img) => {
        const isFav = favoriteIds.includes(img.id);
        return (
          <Card
            key={img.id}
            className={cn(
              "overflow-hidden group relative",
              pickMode && picked.includes(img.id) && "ring-2 ring-primary",
            )}
          >
            <button
              type="button"
              onClick={() => (pickMode ? togglePicked(img.id) : setLightboxId(img.id))}
              className="relative block w-full aspect-video bg-muted overflow-hidden"
            >
              <img
                src={thumbUrl(img.url, THUMB_CARD)}
                alt={img.caption || `${title} bild`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                style={focalStyle(img.focal_point)}
              />
              {/* Uppladdningstidpunkt i nedre vänstra hörnet av bilden */}
              <span className="absolute bottom-1 left-1 rounded bg-background/85 px-1.5 py-0.5 font-mono tabular-nums text-[10px] text-foreground backdrop-blur pointer-events-none sm:text-[9px]">
                {uploadedLabel(img.created_at)}
              </span>
              {pickMode && (
                <span
                  className={cn(
                    "absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background/90",
                    picked.includes(img.id)
                      ? "border-primary text-primary"
                      : "border-border text-transparent",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
              )}
            </button>

            {img.is_cover && (
              <Badge className="absolute top-1 left-1 h-5 gap-1 px-1.5 text-[9px] pointer-events-none sm:h-4">
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
                "absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border bg-background/85 backdrop-blur transition-opacity sm:h-6 sm:w-6",
                isFav
                  ? "text-rose-500 border-rose-400"
                  : "text-muted-foreground border-border sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              )}
            >
              <Heart className={cn("h-4 w-4 sm:h-3 sm:w-3", isFav && "fill-current")} />
            </button>

            {editable && (
              <>
                {previewCount ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={img.is_featured ? "Ta bort från Bildflödet" : "Visa i Bildflödet"}
                        onClick={() => toggleFeatured(img)}
                        className={cn(
                          "absolute top-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background/90 backdrop-blur transition-opacity sm:h-6 sm:w-6",
                          img.is_featured
                            ? "text-amber-500 border-amber-400 ring-2 ring-amber-400/50"
                            : "text-amber-600/80 border-amber-400/60 sm:opacity-70 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        )}
                      >
                        <Star className={cn("h-4 w-4 sm:h-3 sm:w-3", img.is_featured && "fill-current")} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="text-xs">
                      {img.is_featured
                        ? "Visas i Bildflödet – klicka för att ta bort"
                        : "Visa i Bildflödet"}
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
                        "absolute top-1 flex h-8 w-8 items-center justify-center rounded-full border bg-background/85 backdrop-blur transition-opacity sm:h-6 sm:w-6",
                        previewCount ? "right-10 sm:right-8" : "right-1",
                        img.is_cover
                          ? "text-primary border-primary"
                          : "text-muted-foreground border-border sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                      )}
                    >
                      <ImageIcon className="h-4 w-4 sm:h-3 sm:w-3" />
                    </button>

                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {img.is_cover ? "Omslagsbild – klicka för att ta bort" : "Sätt som omslagsbild"}
                  </TooltipContent>
                </Tooltip>
              </>
            )}


            <div className="flex items-center gap-0.5 p-2 sm:p-1.5">
              {/* Uppladdare */}
              <span className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-1">
                <StaffFace
                  name={img.uploaded_by_name}
                  className="h-5 w-5 bg-primary/10 text-[9px] text-primary sm:h-4 sm:w-4 sm:text-[8px]"
                />
                <span className="truncate text-[11px] text-muted-foreground sm:text-[10px]">
                  {img.uploaded_by_name || "Okänd"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setLightboxId(img.id)}
                aria-label="Öppna kommentarer"
                className="flex h-7 w-7 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground sm:h-5 sm:w-5"
              >
                <MessageSquare className="h-4 w-4 sm:h-3 sm:w-3" />
              </button>
              {editable && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground sm:h-5 sm:w-5"
                      aria-label="Justera beskärning"
                      title={`Beskärning: ${focalLabel(img.focal_point)}`}
                    >
                      <Crop className="h-4 w-4 sm:h-3 sm:w-3" />
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
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive sm:h-5 sm:w-5"
                  aria-label="Ta bort bild"
                  onClick={() => removeImage.mutate(img.id)}
                >
                  <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
                </Button>
              )}
            </div>

            {/* Namn på bilden — gör den lätt att hitta med sökningen */}
            <div className="border-t border-border px-2 py-1.5">
              {renameId === img.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        updateImage.mutate({ id: img.id, caption: renameText.trim() || null });
                        setRenameId(null);
                      }
                      if (e.key === "Escape") setRenameId(null);
                    }}
                    placeholder="Namn på bilden"
                    className="h-8 text-xs"
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Spara namn"
                    onClick={() => {
                      updateImage.mutate({ id: img.id, caption: renameText.trim() || null });
                      setRenameId(null);
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!editable}
                  onClick={() => {
                    setRenameText(img.caption ?? "");
                    setRenameId(img.id);
                  }}
                  className="flex w-full items-center gap-1 text-left text-[11px]"
                >
                  <span className={cn("min-w-0 truncate", img.caption ? "font-medium" : "text-muted-foreground")}>
                    {img.caption || (editable ? "Namnge bilden" : "Utan namn")}
                  </span>
                  {editable && <Pencil className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />}
                </button>
              )}
            </div>

          </Card>
        );
      })}

      {/* Tomma platser för dagens saknade bilder */}
      {Array.from({ length: missingSlots }).map((_, i) => (
        <Card
          key={`missing-${i}`}
          className="flex aspect-video flex-col items-center justify-center gap-1 border-2 border-dashed border-destructive/60 bg-destructive/5 p-2 text-center shadow-none"
        >
          <ImageIcon className="h-4 w-4 text-destructive/70" />
          <p className="text-[10px] font-medium leading-tight text-destructive">
            Bild saknas idag
          </p>
        </Card>
      ))}
    </div>
  );

  return (
    <div className={cn("space-y-2", className)}>
      {/* Rubrik + primär uppladdningsknapp */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-sm font-heading font-bold text-foreground flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {editable && (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Kamera: ett foto direkt. Bibliotek: flera bilder ur telefonen. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <Button
              size="sm"
              className="h-10 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
              onClick={() => cameraRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin sm:h-3 sm:w-3" />
              ) : (
                <Camera className="h-4 w-4 sm:h-3 sm:w-3" />
              )}
              Ta foto
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-10 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              <ImageIcon className="h-4 w-4 sm:h-3 sm:w-3" />
              Bibliotek
            </Button>
          </div>
        )}
      </div>

      {/* Verktygsrad — skrollbar på mobil */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {catalog && (
          <Button
            variant={catalogOpen ? "default" : "outline"}
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
            aria-pressed={catalogOpen}
            aria-label={catalogOpen ? "Göm katalog" : "Visa katalog"}
            onClick={() => setCatalogOpen((v) => !v)}
          >
            <ListFilter className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            Filter
          </Button>
        )}

        {images.length > 0 && (
          <div className="relative w-40 shrink-0 sm:w-52">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök bild"
              className="h-9 pl-7 text-xs sm:h-7"
            />
          </div>
        )}

        {search.trim() ? (
          <Badge
            variant="secondary"
            className="h-9 shrink-0 rounded-md px-3 font-mono tabular-nums text-[11px] sm:h-6 sm:px-2 sm:text-[10px]"
          >
            {searchHits.length} träff{searchHits.length === 1 ? "" : "ar"}
          </Badge>
        ) : images.length > 0 ? (
          <Badge
            variant="secondary"
            className="h-9 shrink-0 rounded-md px-3 font-mono tabular-nums text-[11px] sm:h-6 sm:px-2 sm:text-[10px]"
          >
            {images.length} {images.length === 1 ? "bild" : "bilder"}
          </Badge>
        ) : null}
        {favorites.length > 0 && (
          <Badge
            variant="outline"
            className="h-9 shrink-0 gap-1 rounded-md px-3 font-mono tabular-nums text-[11px] text-rose-500 border-rose-300 sm:h-6 sm:px-2 sm:text-[10px]"
          >
            <Heart className="h-3 w-3 fill-current sm:h-2.5 sm:w-2.5" />
            {favorites.length}
          </Badge>
        )}
        {previewCount && featured.length > 0 && (
          <Badge
            variant="outline"
            className="h-9 shrink-0 gap-1 rounded-md px-3 font-mono tabular-nums text-[11px] text-amber-600 border-amber-300 sm:h-6 sm:px-2 sm:text-[10px]"
          >
            <Star className="h-3 w-3 fill-current sm:h-2.5 sm:w-2.5" />
            {featured.length} utvalda idag
          </Badge>
        )}
        {editable && previewCount && images.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
            onClick={openSelect}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            <span className="sm:hidden">Redigera visning</span>
            <span className="hidden sm:inline">Redigera vilka bilder som visas</span>
          </Button>
        )}
        {editable && images.length > 0 && (
          <Button
            variant={pickMode ? "default" : "outline"}
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
            onClick={() => {
              setPickMode((v) => !v);
              setPicked([]);
            }}
          >
            <FolderPlus className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            {pickMode ? "Avbryt val" : "Samla i grupp"}
          </Button>
        )}
        {pickMode && (
          <Button
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-3 text-xs sm:h-7"
            disabled={!picked.length}
            onClick={() => setGroupDialog(true)}
          >
            <Check className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
            Spara grupp ({picked.length})
          </Button>
        )}
      </div>

      {/* Beskrivning för dagen eller gruppen man tittar på */}
      {catalog && editable && view.mode === "day" && (
        <Card className="space-y-1.5 p-2.5">
          <div className="flex items-center gap-2">
            <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold", dayBadgeClass(`${view.key}T12:00:00`))}>
              {dayLabel(view.key)}
            </span>
            <span className="text-[11px] text-muted-foreground">Beskriv dagens bilder</span>
          </div>
          <Textarea
            value={dayDesc ?? dayGroups.find((g) => g.day_key === view.key)?.description ?? ""}
            onChange={(e) => setDayDesc(e.target.value)}
            placeholder="T.ex. Ombyggnad av disken"
            className="min-h-[52px] text-xs"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={dayDesc === null || saveDayDesc.isPending}
              onClick={async () => {
                const key = view.mode === "day" ? view.key : "";
                try {
                  await saveDayDesc.mutateAsync({
                    entityType,
                    entityId,
                    dayKey: key,
                    description: dayDesc ?? "",
                    name: dayLabel(key),
                  });
                  setDayDesc(null);
                  toast({ title: "Beskrivningen sparad" });
                } catch (e: any) {
                  toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
                }
              }}
            >
              Spara beskrivning
            </Button>
          </div>
        </Card>
      )}

      {catalog && activeGroup && (
        <Card className="space-y-1.5 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              {activeGroup.name}
            </span>
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive"
                onClick={async () => {
                  await deleteGroup.mutateAsync({ id: activeGroup.id, entityType, entityId });
                  setView({ mode: "featured" });
                  toast({ title: "Gruppen borttagen — bilderna ligger kvar" });
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Ta bort grupp
              </Button>
            )}
          </div>
          {editable ? (
            <>
              <Textarea
                value={dayDesc ?? activeGroup.description ?? ""}
                onChange={(e) => setDayDesc(e.target.value)}
                placeholder="Beskriv gruppen"
                className="min-h-[52px] text-xs"
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={dayDesc === null || updateGroup.isPending}
                  onClick={async () => {
                    await updateGroup.mutateAsync({
                      id: activeGroup.id,
                      description: dayDesc ?? "",
                      entityType,
                      entityId,
                    });
                    setDayDesc(null);
                    toast({ title: "Beskrivningen sparad" });
                  }}
                >
                  Spara beskrivning
                </Button>
              </div>
            </>
          ) : (
            activeGroup.description && <p className="text-xs text-muted-foreground">{activeGroup.description}</p>
          )}
        </Card>
      )}

      {/* Saknas utvalda bilder för idag? Påminn personalen om stjärnan. */}
      {editable && previewCount && !isLoading && featured.length === 0 && todayImageCount > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-2 border-dashed border-amber-400/60 bg-amber-500/5 p-2.5">
          <p className="flex items-start gap-2 text-xs text-foreground">
            <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              Inga utvalda bilder idag — stjärnmärk de bilder som ska synas i Bildflödet.
              {" "}
              <span className="text-muted-foreground">
                Väljer ingen markeras 4 av dagens bilder automatiskt.
              </span>
            </span>
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5 px-3 text-xs"
            onClick={() => {
              setCatalogOpen(true);
              selectDay(todayKey);
            }}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Visa dagens bilder
          </Button>
        </Card>
      )}



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
            <button
              type="button"
              onClick={() => setCatalogCollapsed((v) => !v)}
              className="mb-1.5 flex w-full items-center justify-between gap-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:pointer-events-none sm:text-[10px]"
            >
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
                Katalog
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform sm:hidden",
                  catalogCollapsed && "-rotate-90"
                )}
              />
            </button>
            <div className={cn("space-y-0.5", catalogCollapsed && "hidden sm:block")}>

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
                    pool.length,

                    <Star className="h-3 w-3" />,
                    () => setView({ mode: "featured" })
                  )

                : null}
              {manualGroups.length > 0 && (
                <>
                  <div className="my-1 border-t" />
                  <p className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Grupper
                  </p>
                  {manualGroups.map((g) =>
                    catalogButton(
                      view.mode === "group" && view.id === g.id,
                      g.id,
                      g.name || "Grupp",
                      g.imageIds.length,
                      <Folder className="h-3 w-3" />,
                      () => {
                        setDayDesc(null);
                        setView({ mode: "group", id: g.id });
                      }
                    )
                  )}
                </>
              )}
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
            {shown.length === 0 && missingSlots === 0 ? (
              <Card className="p-4 text-center border-dashed">
                <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
                <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
              </Card>
            ) : (
              grid
            )}
          </div>
        </div>
      ) : shown.length === 0 && missingSlots === 0 ? (
        <Card className="p-4 text-center border-dashed">
          <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
          <p className="mt-1 text-xs text-muted-foreground">{emptyText}</p>
        </Card>
      ) : (
        grid
      )}


      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex >= 0 ? lightboxIndex : null}
        onIndexChange={(i) => setLightboxId(lightboxImages[i]?.id ?? null)}

        onClose={() => setLightboxId(null)}
        title={title}
        editable={editable}
        onSaveCaption={(id, caption) => updateImage.mutate({ id, caption })}
        favoriteIds={favoriteIds}
        onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
      />

      {previewCount && (
        <Dialog open={selectOpen} onOpenChange={setSelectOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="text-sm">Redigera vilka bilder som visas</DialogTitle>
              <DialogDescription className="text-xs">
                Klicka på en bild för att lägga den i poolen med utvalda bilder (valfritt antal). Tryck
                sedan på stjärnan för att välja vilka {previewCount} som syns först på översiktssidan.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto sm:grid-cols-4">
              {images.map((img) => {
                const active = selection.includes(img.id);
                const front = frontSelection.includes(img.id);
                return (
                  <div
                    key={img.id}
                    className={cn(
                      "relative aspect-video overflow-hidden rounded-md border-2 bg-muted",
                      active ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSelection(img.id)}
                      className="block h-full w-full"
                      aria-label={active ? "Ta bort ur utvalda" : "Lägg till i utvalda"}
                    >
                      <img
                        src={thumbUrl(img.url, THUMB_TILE)}
                        alt={img.caption || "Bild"}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        style={focalStyle(img.focal_point)}
                      />
                    </button>
                    {active && (
                      <span className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                    {active && (
                      <button
                        type="button"
                        onClick={() => toggleFront(img.id)}
                        aria-label={front ? "Ta bort från framsidan" : "Visa på framsidan"}
                        title={front ? "Visas på framsidan" : "Visa på framsidan"}
                        className={cn(
                          "absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full border bg-background/85 backdrop-blur",
                          front ? "text-amber-500 border-amber-400" : "text-muted-foreground border-border"
                        )}
                      >
                        <Star className={cn("h-3 w-3", front && "fill-current")} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground font-mono tabular-nums">
                {selection.length} utvalda · {frontSelection.length} / {previewCount} på framsidan
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelection([]);
                    setFrontSelection([]);
                  }}
                >
                  Rensa val
                </Button>
                <Button
                  size="sm"
                  disabled={setFeatured.isPending || updateImage.isPending}
                  onClick={async () => {
                    try {
                      await setFeatured.mutateAsync({ entityType, entityId, day: todayKey, imageIds: selection });
                      // Framsidans bilder får lägst sorteringsordning så de hamnar först i poolen.
                      const order = frontSelection.filter((id) => selection.includes(id));
                      await Promise.all(
                        selection.map((id) => {
                          const idx = order.indexOf(id);
                          return updateImage.mutateAsync({
                            id,
                            sort_order: idx >= 0 ? idx : 100 + selection.indexOf(id),
                          });
                        }),
                      );
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

      {/* Samla markerade bilder i en grupp */}
      <Dialog open={groupDialog} onOpenChange={setGroupDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Samla {picked.length} bilder i en grupp</DialogTitle>
            <DialogDescription className="text-xs">
              Ny grupp eller lägg bilderna i en grupp som redan finns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Gruppens namn, t.ex. Skada i kylen"
              className="h-9 text-sm"
            />
            <Textarea
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
              placeholder="Beskrivning (valfritt)"
              className="min-h-[60px] text-xs"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={createGroup.isPending}
              onClick={() => saveGroup()}
            >
              <FolderPlus className="mr-1 h-3.5 w-3.5" />
              Skapa grupp
            </Button>
            {manualGroups.length > 0 && (
              <div className="space-y-1 border-t pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Lägg i befintlig grupp
                </p>
                {manualGroups.map((g) => (
                  <Button
                    key={g.id}
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-between text-xs"
                    disabled={addToGroup.isPending}
                    onClick={() => saveGroup(g.id)}
                  >
                    <span className="truncate">{g.name || "Grupp"}</span>
                    <span className="font-mono tabular-nums text-[10px] text-muted-foreground">
                      {g.imageIds.length}
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Namnge nyss uppladdade bilder — gör dem sökbara direkt */}
      <Dialog open={nameIds.length > 0} onOpenChange={(v) => !v && setNameIds([])}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Namnge bilderna</DialogTitle>
            <DialogDescription className="text-xs">
              Ett kort namn gör bilden lätt att söka fram senare, t.ex. "Disken efter städning".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {nameIds.map((id, idx) => {
              const img = images.find((i) => i.id === id);
              return (
                <div key={id} className="flex items-center gap-2">
                  {img && (
                    <img
                      src={thumbUrl(img.url, THUMB_TILE)}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                    />
                  )}
                  <Input
                    autoFocus={idx === 0}
                    value={names[id] ?? ""}
                    onChange={(e) => setNames((p) => ({ ...p, [id]: e.target.value }))}
                    placeholder="Namn på bilden"
                    className="h-10 text-sm"
                  />
                </div>
              );
            })}
            <div className="flex gap-2">
              <Button
                className="h-11 flex-1 text-sm font-semibold"
                onClick={() => {
                  nameIds.forEach((id) => {
                    const n = (names[id] ?? "").trim();
                    if (n) updateImage.mutate({ id, caption: n });
                  });
                  setNameIds([]);
                  setNames({});
                  toast({ title: "Namnen är sparade" });
                }}
              >
                Spara namn
              </Button>
              <Button variant="outline" className="h-11 text-sm" onClick={() => setNameIds([])}>
                Hoppa över
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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
