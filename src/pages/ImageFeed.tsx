import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Heart,
  MessageCircle,
  Star,
  Trophy,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import ImageLibraryPanel from "@/components/images/ImageLibraryPanel";
import { useImageFeed, type FeedImage } from "@/hooks/useImageFeed";
import { useMyImageFavorites, useToggleImageFavorite } from "@/hooks/useEntityImages";
import { useAllowedStores, useSwitchStore } from "@/components/StoreSwitcher";
import { useNavigate } from "react-router-dom";
import { dayKey, dayLabel, dayDateLabel } from "@/lib/imageMeta";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { focalStyle } from "@/lib/imageFocal";
import { cn } from "@/lib/utils";
import { thumbUrl, THUMB_TILE, THUMB_CARD } from "@/lib/imageThumb";

const ALL = "all";

/** Klockslag i svensk form, t.ex. "11:54". */
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

/** Ett inlägg: en eller flera bilder från samma person, samma ställe, nära i tid. */
type FeedPost = {
  id: string;
  items: FeedImage[];
};

/**
 * Gemensam tidslinje för bilder från alla butiker, grossisten och admin.
 * Bilden är huvudprodukten: stora kort, personen och platsen ovanpå bilden.
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
  const [person, setPerson] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState<"latest" | "popular">("latest");
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  /** Flöde = tidslinjen. Bibliotek = alla bilder, sökbara och sorterbara. */
  const [view, setView] = useState<"feed" | "library">("feed");

  const visible = useMemo(() => {
    const list = rows.filter((r) => {
      if (source !== ALL && r.sourceId !== source) return false;
      if (person && r.uploaded_by_name !== person) return false;
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
  }, [rows, source, person, onlyFavorites, favoriteIds, sort]);

  /** Dagar med inlägg. I "Populärast" visas allt i ett svep utan dagsindelning. */
  const days = useMemo(() => {
    if (sort === "popular") return [["", toPosts(visible, false)]] as [string, FeedPost[]][];
    const map = new Map<string, FeedImage[]>();
    visible.forEach((img) => {
      const key = dayKey(img.created_at);
      const list = map.get(key);
      if (list) list.push(img);
      else map.set(key, [img]);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => [key, toPosts(items, true)] as [string, FeedPost[]]);
  }, [visible, sort]);

  /** Mest hjärtade senaste 30 dagarna — liten remsa högst upp. */
  const topImages = useMemo(() => {
    const since = Date.now() - 30 * 86400000;
    return rows
      .filter((r) => new Date(r.created_at).getTime() >= since && r.favoriteCount > 0)
      .sort(
        (a, b) =>
          b.favoriteCount - a.favoriteCount ||
          b.commentCount - a.commentCount ||
          b.created_at.localeCompare(a.created_at),
      )
      .slice(0, 6);
  }, [rows]);

  const allowedIds = useMemo(() => new Set(allowedStores.map((s: any) => s.id)), [allowedStores]);
  const peek = (id: string, name: string) => {
    switchStore(id, name);
    navigate("/organisation");
  };

  const lightboxIndex = lightboxId ? visible.findIndex((i) => i.id === lightboxId) : -1;
  const activeSource = sources.find((s) => s.id === source);
  const latestDay = rows.length ? dayKey(rows[0].created_at) : "";
  const filtered = source !== ALL || person || onlyFavorites;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-[1400px] space-y-5 overflow-x-hidden"
    >
      {/* Ren header: rubrik och filter som chips */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Bildflöde
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Bilderna från butikerna och grossisten, senaste först.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Chip active={view === "feed"} onClick={() => setView("feed")}>
              Flöde
            </Chip>
            <Chip active={view === "library"} onClick={() => setView("library")}>
              Bibliotek
            </Chip>
            {view === "feed" && (
              <>
                <Chip active={sort === "latest"} onClick={() => setSort("latest")}>
                  <Clock className="h-3.5 w-3.5" /> Senaste
                </Chip>
                <Chip active={sort === "popular"} onClick={() => setSort("popular")}>
                  <Trophy className="h-3.5 w-3.5" /> Populärast
                </Chip>
                <Chip active={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
                  <Heart className={cn("h-3.5 w-3.5", onlyFavorites && "fill-current")} /> Favoriter
                </Chip>
              </>
            )}
          </div>
        </div>

        {view === "feed" && sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={source === ALL} onClick={() => setSource(ALL)}>
              Alla
            </Chip>
            {sources.map((s) => (
              <Chip
                key={s.id}
                active={s.id === source}
                onClick={() => setSource(s.id === source ? ALL : s.id)}
              >
                <span className="max-w-[160px] truncate">{s.name}</span>
              </Chip>
            ))}
          </div>
        )}

        {filtered && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              Visar {visible.length} bild{visible.length === 1 ? "" : "er"}
              {person ? ` av ${person}` : ""}
              {activeSource ? ` från ${activeSource.name}` : ""}
            </span>
            {activeSource?.kind === "store" && allowedIds.has(activeSource.id) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 rounded-full text-xs"
                onClick={() => peek(activeSource.id, activeSource.name)}
              >
                Kika in hos {activeSource.name} <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            )}
            <button
              type="button"
              onClick={() => {
                setSource(ALL);
                setPerson(null);
                setOnlyFavorites(false);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 hover:text-foreground"
            >
              <X className="h-3 w-3" /> Rensa
            </button>
          </div>
        )}
      </div>

      {view === "library" && <ImageLibraryPanel />}

      {view === "feed" && (
      <>
      {/* Mest hjärtade — diskret remsa, bilden först */}
      {topImages.length > 0 && !isLoading && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Trophy className="h-3.5 w-3.5 text-amber-500" /> Mest hjärtade senaste månaden
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {topImages.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxId(img.id)}
                className="group relative aspect-square overflow-hidden rounded-2xl"
                aria-label={`Öppna bild från ${img.sourceName}`}
              >
                <img
                  src={thumbUrl(img.url, THUMB_TILE)}
                  alt={img.caption || `Bild från ${img.sourceName}`}
                  loading="lazy"
                  style={focalStyle(img.focal_point)}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-medium text-white">
                  <span className="truncate">{img.sourceName}</span>
                  <span className="flex shrink-0 items-center gap-0.5 tabular-nums">
                    <Heart className="h-2.5 w-2.5 fill-current" />
                    {img.favoriteCount}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-[20px]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card className="rounded-[20px]">
          <CardContent className="py-10">
            <EmptyState
              bare
              icon={<Star className="h-4 w-4" />}
              title="Inga bilder än"
              description="När någon laddar upp en bild i butiken eller hos grossisten hamnar den här."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {days.map(([key, posts]) => (
            <section key={key || "populart"} className="space-y-4">
              {key ? (
                <div className="sticky top-0 z-10 -mx-1 flex items-center gap-2 bg-background/85 px-1 py-2 backdrop-blur">
                  <h2 className="font-heading text-sm font-bold text-foreground">{dayLabel(key)}</h2>
                  <span className="text-xs text-muted-foreground">{dayDateLabel(key)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {posts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    favoriteIds={favoriteIds}
                    onOpen={setLightboxId}
                    onToggleFavorite={(id, favorite) =>
                      toggleFavorite.mutate({ imageId: id, favorite })
                    }
                    onPerson={(name) => setPerson(name)}
                    onSource={(id) => setSource(id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {!isLoading && rows.length > 0 && latestDay !== dayKey(new Date().toISOString()) && (
        <p className="text-xs text-muted-foreground">Inga bilder är uppladdade idag ännu.</p>
      )}

      <ImageLightbox
        images={visible}
        index={lightboxIndex >= 0 ? lightboxIndex : null}
        onIndexChange={(i) => setLightboxId(visible[i]?.id ?? null)}
        onClose={() => setLightboxId(null)}
        title="Bildflöde"
        sourceLabelOf={(img) => visible.find((v) => v.id === img.id)?.sourceName ?? null}
        favoriteIds={favoriteIds}
        onToggleFavorite={(id, favorite) => toggleFavorite.mutate({ imageId: id, favorite })}
      />
      </>
      )}
    </motion.div>
  );
}

/** Minimalistisk filterchip. */
function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Slår ihop bilder från samma person och samma ställe inom en timme till ett
 * inlägg med carousel. I "Populärast" står varje bild för sig.
 */
function toPosts(items: FeedImage[], group: boolean): FeedPost[] {
  if (!group) return items.map((i) => ({ id: i.id, items: [i] }));
  const posts: FeedPost[] = [];
  items.forEach((img) => {
    const last = posts[posts.length - 1];
    const prev = last?.items[last.items.length - 1];
    const near =
      prev &&
      prev.sourceId === img.sourceId &&
      (prev.uploaded_by_name ?? "") === (img.uploaded_by_name ?? "") &&
      Math.abs(new Date(prev.created_at).getTime() - new Date(img.created_at).getTime()) <= 3600000;
    if (last && near) last.items.push(img);
    else posts.push({ id: img.id, items: [img] });
  });
  return posts;
}

/** Ett inlägg: stor bild, person och plats ovanpå bilden. */
function PostCard({
  post,
  favoriteIds,
  onOpen,
  onToggleFavorite,
  onPerson,
  onSource,
}: {
  post: FeedPost;
  favoriteIds: string[];
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
  onPerson: (name: string) => void;
  onSource: (id: string) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const count = post.items.length;
  const img = post.items[Math.min(idx, count - 1)];
  const isFav = favoriteIds.includes(img.id);
  const name = img.uploaded_by_name;

  const step = (delta: number) => setIdx((v) => Math.min(count - 1, Math.max(0, v + delta)));

  return (
    <article className="group relative overflow-hidden rounded-[20px] bg-muted shadow-sm ring-1 ring-border/60 transition-shadow duration-200 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onOpen(img.id)}
        className="block aspect-[4/5] w-full cursor-pointer overflow-hidden"
        aria-label={`Öppna bild från ${img.sourceName}`}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1);
          setTouchX(null);
        }}
      >
        <img
          src={thumbUrl(img.url, THUMB_CARD)}
          alt={img.caption || `Bild från ${img.sourceName}`}
          loading="lazy"
          style={focalStyle(img.focal_point)}
          className="h-full w-full object-cover transition-transform duration-[220ms] ease-out group-hover:scale-[1.015]"
        />
      </button>

      {/* Överkant: person, plats och klockslag ovanpå bilden */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 bg-gradient-to-b from-black/55 via-black/15 to-transparent p-3 pb-10">
        <button
          type="button"
          onClick={() => name && onPerson(name)}
          className="pointer-events-auto flex min-w-0 items-center gap-2 text-left"
          aria-label={name ? `Visa bilder av ${name}` : "Okänd uppladdare"}
        >
          <StaffFace
            name={name}
            className="h-11 w-11 border border-white/70 text-sm shadow-sm"
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-white drop-shadow">
              {name || "Okänd uppladdare"}
            </span>
            <span className="block truncate text-[11px] text-white/80 drop-shadow">
              {img.sourceName} · {timeOf(img.created_at)}
            </span>
          </span>
        </button>
        {count > 1 && (
          <span className="rounded-full bg-black/45 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white backdrop-blur">
            {idx + 1} / {count}
          </span>
        )}
      </div>

      {/* Pilar vid hover på desktop */}
      {count > 1 && (
        <>
          {idx > 0 && (
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Föregående bild"
              className="absolute left-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 sm:grid"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {idx < count - 1 && (
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Nästa bild"
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 place-items-center rounded-full bg-black/40 p-1.5 text-white opacity-0 backdrop-blur transition-opacity duration-200 group-hover:opacity-100 sm:grid"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      {/* Underkant: bildtext, hjärtan, kommentarer och plats */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/70 via-black/25 to-transparent p-3 pt-10">
        {img.caption && (
          <p className="whitespace-pre-wrap break-words text-sm text-white drop-shadow">{img.caption}</p>
        )}
        <div className="flex items-end justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleFavorite(img.id, !isFav)}
              aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera"}
              className="flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              <Heart className={cn("h-[18px] w-[18px]", isFav && "fill-current text-rose-400")} />
              <span className="tabular-nums">{img.favoriteCount || 0}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpen(img.id)}
              aria-label="Kommentarer"
              className="flex h-9 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
            >
              <MessageCircle className="h-[18px] w-[18px]" />
              <span className="tabular-nums">{img.commentCount || 0}</span>
            </button>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {count > 1 && (
              <span className="flex items-center gap-1">
                {post.items.map((it, i) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Bild ${i + 1}`}
                    className={cn(
                      "pointer-events-auto h-1.5 w-1.5 rounded-full transition-colors",
                      i === idx ? "bg-white" : "bg-white/45",
                    )}
                  />
                ))}
              </span>
            )}
            <button
              type="button"
              onClick={() => onSource(img.sourceId)}
              className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur transition-colors hover:bg-black/60"
            >
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="whitespace-normal text-left leading-tight">{img.sourceName}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
