import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Images, MessageCircle, Star, Trophy, Flame, ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { useImageFeed, type FeedImage } from "@/hooks/useImageFeed";
import { useMyImageFavorites, useToggleImageFavorite } from "@/hooks/useEntityImages";
import { useAllowedStores, useSwitchStore } from "@/components/StoreSwitcher";
import { useNavigate } from "react-router-dom";
import { dayKey, dayLabel, initialsOf } from "@/lib/imageMeta";
import { focalStyle } from "@/lib/imageFocal";
import { cn } from "@/lib/utils";

const ALL = "all";

/**
 * Gemensam tidslinje för utvalda bilder från alla butiker, grossisten och admin.
 * Syftet är inspiration: personal på ett ställe ser vad som finns på de andra,
 * kan hjärta, kommentera och hoppa vidare in i den andra butikens portal.
 */
export default function ImageFeed() {
  const { data, isLoading } = useImageFeed();
  const rows = data?.rows ?? [];
  const sources = data?.sources ?? [];
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const toggleFavorite = useToggleImageFavorite();
  const allowedStores = useAllowedStores();
  const switchStore = useSwitchStore();
  const navigate = useNavigate();

  const [source, setSource] = useState<string>(ALL);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const list = rows.filter((r) => {
      if (source !== ALL && r.sourceId !== source) return false;
      if (onlyFavorites && !favoriteIds.includes(r.id)) return false;
      return true;
    });
    if (sort === "popular") {
      return [...list].sort(
        (a, b) =>
          b.favoriteCount - a.favoriteCount ||
          b.commentCount - a.commentCount ||
          b.created_at.localeCompare(a.created_at),
      );
    }
    return list;
  }, [rows, source, onlyFavorites, favoriteIds, sort]);

  const days = useMemo(() => {
    const map = new Map<string, FeedImage[]>();
    visible.forEach((img) => {
      const key = dayKey(img.created_at);
      const list = map.get(key);
      if (list) list.push(img);
      else map.set(key, [img]);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [visible]);

  /** Topplista: mest hjärtade bilderna senaste 30 dagarna */
  const topImages = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    return rows
      .filter((r) => new Date(r.created_at).getTime() >= since && r.favoriteCount > 0)
      .sort((a, b) => b.favoriteCount - a.favoriteCount || b.commentCount - a.commentCount)
      .slice(0, 6);
  }, [rows]);

  /** Mest aktiva enheter senaste 7 dagarna */
  const activeSources = useMemo(
    () =>
      [...sources]
        .filter((s) => s.recentCount > 0 || s.favoriteCount > 0)
        .sort((a, b) => b.recentCount - a.recentCount || b.favoriteCount - a.favoriteCount)
        .slice(0, 6),
    [sources],
  );

  const allowedIds = useMemo(() => new Set(allowedStores.map((s: any) => s.id)), [allowedStores]);
  const peek = (id: string, name: string) => {
    switchStore(id, name);
    navigate("/organisation");
  };

  const lightboxIndex = lightboxId ? visible.findIndex((i) => i.id === lightboxId) : -1;
  const activeSource = sources.find((s) => s.id === source);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 sm:space-y-5 max-w-full overflow-x-hidden"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-base sm:text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <Images className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <span className="truncate">Bildflöde</span>
          </h1>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Utvalda bilder från alla butiker och grossisten. Markera en bild med stjärnan i
            &quot;Bilder från butiken&quot; på Översikt för att lägga upp den här.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-md border border-border overflow-hidden">
            <Button
              size="sm"
              variant={sort === "latest" ? "default" : "ghost"}
              className="h-8 rounded-none text-xs"
              onClick={() => setSort("latest")}
            >
              <Clock className="h-3.5 w-3.5 mr-1" /> Senaste
            </Button>
            <Button
              size="sm"
              variant={sort === "popular" ? "default" : "ghost"}
              className="h-8 rounded-none text-xs"
              onClick={() => setSort("popular")}
            >
              <Trophy className="h-3.5 w-3.5 mr-1" /> Populärast
            </Button>
          </div>
          <Button
            size="sm"
            variant={onlyFavorites ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setOnlyFavorites((v) => !v)}
          >
            <Heart className={cn("h-3.5 w-3.5 mr-1", onlyFavorites && "fill-current")} />
            Favoriter
          </Button>
        </div>
      </div>

      {/* Enhetsfilter som chips — ett klick för att kika hos en annan butik */}
      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSource(ALL)}
            className={cn(
              "h-7 rounded-full border px-2.5 text-[11px] transition-colors",
              source === ALL
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Alla enheter ({rows.length})
          </button>
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSource(s.id === source ? ALL : s.id)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-[11px] transition-colors flex items-center gap-1",
                s.id === source
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="truncate max-w-[160px]">{s.name}</span>
              <span className="tabular-nums opacity-70">{s.imageCount}</span>
              {s.recentCount > 0 && <Flame className="h-3 w-3 text-amber-500" />}
            </button>
          ))}
          {activeSource && activeSource.kind === "store" && allowedIds.has(activeSource.id) && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => peek(activeSource.id, activeSource.name)}
            >
              Kika in hos {activeSource.name} <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Statusrad: syns direkt om dagens bilder inte hunnit bli utvalda ännu */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-6 gap-1 text-[10px]">
            <Clock className="h-3 w-3" />
            Senaste bilderna: {dayLabel(latestDay)}
          </Badge>
          {latestDay !== dayKey(new Date().toISOString()) && (
            <span>
              Inga bilder är utvalda idag ännu — stjärnmärk dagens bilder i &quot;Bilder från
              butiken&quot; på Översikt så syns de här.
            </span>
          )}
        </div>
      )}


      {/* Topplista + aktivitet */}
      {(topImages.length > 0 || activeSources.length > 0) && !isLoading && (
        <div className="grid gap-3 lg:grid-cols-3">
          {topImages.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="py-2.5">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" /> Mest hjärtade – 30 dagar
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Det som inspirerat mest i organisationen den senaste månaden.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {topImages.map((img, i) => (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => setLightboxId(img.id)}
                      className="relative aspect-square overflow-hidden rounded-md border border-border group"
                      aria-label={`Öppna bild från ${img.sourceName}`}
                    >
                      <img
                        src={img.url}
                        alt={img.caption || `Bild från ${img.sourceName}`}
                        loading="lazy"
                        style={focalStyle(img.focal_point)}
                        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      />
                      <span className="absolute top-1 left-1 h-4 w-4 grid place-items-center rounded-full bg-background/85 text-[9px] font-bold tabular-nums">
                        {i + 1}
                      </span>
                      <span className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/75 to-transparent px-1 py-0.5 flex items-center justify-between text-[9px] text-white">
                        <span className="truncate">{img.sourceName}</span>
                        <span className="flex items-center gap-0.5 tabular-nums shrink-0">
                          <Heart className="h-2.5 w-2.5 fill-current" />
                          {img.favoriteCount}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeSources.length > 0 && (
            <Card>
              <CardHeader className="py-2.5">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  <Flame className="h-4 w-4 text-amber-500" /> Mest aktiva enheter
                </CardTitle>
                <CardDescription className="text-[11px]">Bilder senaste 7 dagarna</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1">
                {activeSources.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSource(s.id)}
                      className="flex-1 truncate text-left hover:underline"
                    >
                      {s.name}
                    </button>
                    <span className="tabular-nums text-muted-foreground">{s.recentCount}</span>
                    <span className="flex items-center gap-0.5 tabular-nums text-muted-foreground">
                      <Heart className="h-3 w-3" />
                      {s.favoriteCount}
                    </span>
                    {s.kind === "store" && allowedIds.has(s.id) && (
                      <button
                        type="button"
                        onClick={() => peek(s.id, s.name)}
                        className="text-primary hover:underline shrink-0"
                        aria-label={`Kika in hos ${s.name}`}
                      >
                        Kika in
                      </button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] w-full rounded-lg" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              bare
              icon={<Star className="h-4 w-4" />}
              title="Inga utvalda bilder än"
              description="När någon markerar en bild som utvald på sin översiktssida hamnar den här för alla att se."
            />
          </CardContent>
        </Card>
      ) : sort === "popular" ? (
        <Card>
          <CardHeader className="py-2.5">
            <CardTitle className="text-sm font-heading flex items-center gap-2">
              Populärast först
              <Badge variant="secondary" className="text-[10px]">
                {visible.length} bild{visible.length === 1 ? "" : "er"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ImageGrid
              items={visible}
              favoriteIds={favoriteIds}
              onOpen={setLightboxId}
              onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
              onPeek={peek}
              allowedIds={allowedIds}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map(([key, items]) => (
            <Card key={key}>
              <CardHeader className="py-2.5">
                <CardTitle className="text-sm font-heading flex items-center gap-2">
                  {dayLabel(key)}
                  <Badge variant="secondary" className="text-[10px]">
                    {items.length} bild{items.length === 1 ? "" : "er"}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {Array.from(new Set(items.map((i) => i.sourceName))).join(" · ")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ImageGrid
                  items={items}
                  favoriteIds={favoriteIds}
                  onOpen={setLightboxId}
                  onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
                  onPeek={peek}
                  allowedIds={allowedIds}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ImageLightbox
        images={visible}
        index={lightboxIndex >= 0 ? lightboxIndex : null}
        onIndexChange={(i) => setLightboxId(visible[i]?.id ?? null)}
        onClose={() => setLightboxId(null)}
        title="Bildflöde"
        favoriteIds={favoriteIds}
        onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
      />
    </motion.div>
  );
}

function ImageGrid({
  items,
  favoriteIds,
  onOpen,
  onToggleFavorite,
  onPeek,
  allowedIds,
}: {
  items: FeedImage[];
  favoriteIds: string[];
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onPeek: (id: string, name: string) => void;
  allowedIds: Set<string>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((img) => {
        const isFav = favoriteIds.includes(img.id);
        return (
          <div key={img.id} className="group rounded-lg border border-border overflow-hidden bg-card">
            <button
              type="button"
              onClick={() => onOpen(img.id)}
              className="block w-full aspect-[4/3] overflow-hidden"
              aria-label={`Öppna bild från ${img.sourceName}`}
            >
              <img
                src={img.url}
                alt={img.caption || `Bild från ${img.sourceName}`}
                loading="lazy"
                style={focalStyle(img.focal_point)}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
              />
            </button>
            <div className="p-2 space-y-1">
              <div className="flex items-center gap-1.5 min-w-0">
                {img.sourceKind === "store" && allowedIds.has(img.sourceId) ? (
                  <button
                    type="button"
                    onClick={() => onPeek(img.sourceId, img.sourceName)}
                    title={`Kika in hos ${img.sourceName}`}
                    className="max-w-full truncate rounded-full border border-border px-1.5 py-0.5 text-[10px] hover:border-primary hover:text-primary transition-colors"
                  >
                    {img.sourceName}
                  </button>
                ) : (
                  <Badge variant="outline" className="text-[10px] max-w-full truncate">
                    {img.sourceName}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                  {new Date(img.created_at).toLocaleTimeString("sv-SE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {img.caption && <p className="text-[11px] text-foreground line-clamp-2">{img.caption}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground truncate">
                  {img.uploaded_by_name
                    ? `${initialsOf(img.uploaded_by_name)} · ${img.uploaded_by_name}`
                    : "Okänd uppladdare"}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(img.id, !isFav)}
                    aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera"}
                    className={cn(
                      "h-6 min-w-6 px-1 grid place-items-center rounded-md border border-border",
                      isFav ? "text-destructive" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
                      <Heart className={cn("h-3 w-3", isFav && "fill-current")} />
                      {img.favoriteCount || ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpen(img.id)}
                    aria-label="Kommentarer"
                    className="h-6 min-w-6 px-1 grid place-items-center rounded-md border border-border text-muted-foreground hover:text-foreground"
                  >
                    <span className="flex items-center gap-0.5 text-[10px] tabular-nums">
                      <MessageCircle className="h-3 w-3" />
                      {img.commentCount || ""}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
