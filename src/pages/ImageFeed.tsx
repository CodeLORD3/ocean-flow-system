import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Images, MessageCircle, Star } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { useImageFeed, type FeedImage } from "@/hooks/useImageFeed";
import { useMyImageFavorites, useToggleImageFavorite } from "@/hooks/useEntityImages";
import { dayKey, dayLabel, initialsOf } from "@/lib/imageMeta";
import { focalStyle } from "@/lib/imageFocal";
import { cn } from "@/lib/utils";

const ALL = "all";

/**
 * Gemensam tidslinje för utvalda bilder från alla butiker, grossisten och admin.
 * Syftet är inspiration: personal på ett ställe ser vad som finns på de andra.
 */
export default function ImageFeed() {
  const { data, isLoading } = useImageFeed();
  const rows = data?.rows ?? [];
  const sources = data?.sources ?? [];
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const toggleFavorite = useToggleImageFavorite();

  const [source, setSource] = useState<string>(ALL);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [lightboxId, setLightboxId] = useState<string | null>(null);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (source !== ALL && r.sourceId !== source) return false;
        if (onlyFavorites && !favoriteIds.includes(r.id)) return false;
        return true;
      }),
    [rows, source, onlyFavorites, favoriteIds],
  );

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

  const lightboxIndex = lightboxId ? visible.findIndex((i) => i.id === lightboxId) : -1;

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
            Utvalda bilder från alla butiker och grossisten, senaste först. Markera en bild med stjärnan i
            &quot;Bilder från butiken&quot; på Översikt för att lägga upp den här.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="h-8 w-[190px] text-xs">
              <SelectValue placeholder="Alla enheter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Alla enheter</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.map((img) => {
                    const isFav = favoriteIds.includes(img.id);
                    return (
                      <div key={img.id} className="group rounded-lg border border-border overflow-hidden bg-card">
                        <button
                          type="button"
                          onClick={() => setLightboxId(img.id)}
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
                            <Badge variant="outline" className="text-[10px] max-w-full truncate">
                              {img.sourceName}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                              {new Date(img.created_at).toLocaleTimeString("sv-SE", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          {img.caption && (
                            <p className="text-[11px] text-foreground line-clamp-2">{img.caption}</p>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground truncate">
                              {img.uploaded_by_name
                                ? `${initialsOf(img.uploaded_by_name)} · ${img.uploaded_by_name}`
                                : "Okänd uppladdare"}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleFavorite.mutate({ imageId: img.id, favorite: !isFav })}
                                aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera"}
                                className={cn(
                                  "h-6 w-6 grid place-items-center rounded-md border border-border",
                                  isFav ? "text-destructive" : "text-muted-foreground hover:text-foreground",
                                )}
                              >
                                <Heart className={cn("h-3 w-3", isFav && "fill-current")} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setLightboxId(img.id)}
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
