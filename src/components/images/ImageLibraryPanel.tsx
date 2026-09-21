import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { thumbUrl, THUMB_FULL } from "@/lib/imageThumb";
import { Search, Heart, MessageCircle, Eye } from "lucide-react";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import { dayKey, dayLabel, dayDateLabel } from "@/lib/imageMeta";
import {
  useImageComments,
  useAddImageComment,
  useMyImageFavorites,
  useToggleImageFavorite,
} from "@/hooks/useEntityImages";
import { useImageEngagement, useImageViewers, useRecordImageView } from "@/hooks/useImageEngagement";

/** Klockslag i svensk form, t.ex. "11:54". */
const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
import ImageLibraryGrid from "./ImageLibraryGrid";
import ImageBulkBar from "./ImageBulkBar";
import ImageClassifySheet from "./ImageClassifySheet";
import ImageQuickClassify from "./ImageQuickClassify";
import ImageLinksPanel from "./ImageLinksPanel";
import ImageActivityTimeline from "./ImageActivityTimeline";
import AddImageFlow from "./AddImageFlow";
import { useImageLibrary, useImageStatusCounts, type LibraryImage } from "@/hooks/useImageLibrary";
import { STATUS_LABEL, type ImageStatus, type MediaKind } from "@/lib/imageStatus";

type TabKey = "all" | MediaKind | "unplaced" | "partial";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "Alla" },
  { key: "area", label: "Områden" },
  { key: "resource", label: "Saker" },
  { key: "product", label: "Produkter" },
  { key: "task", label: "Uppgifter" },
  { key: "observation", label: "Iakttagelser" },
  { key: "unplaced", label: "Oplacerade" },
];

/**
 * Bildbiblioteket: alla bilder på ett ställe, sökbara och sorterbara.
 * En bild laddas upp en gång och kan höra till flera ställen.
 */
export default function ImageLibraryPanel({ storeId }: { storeId?: string | null }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LibraryImage[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<LibraryImage | null>(null);
  const [editing, setEditing] = useState<LibraryImage | null>(null);
  const [quick, setQuick] = useState<ImageStatus | null>(null);
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filter = useMemo(() => {
    const base: {
      status?: ImageStatus | "all";
      mediaKind?: MediaKind | "all";
      search?: string;
      tag?: string;
    } = {
      search: debounced || undefined,
      tag: tag || undefined,
    };
    if (tab === "unplaced") base.status = "unclassified";
    else if (tab === "partial") base.status = "partial";
    else if (tab !== "all") base.mediaKind = tab;
    return base;
  }, [tab, debounced, tag]);

  const { data, isLoading, isFetching } = useImageLibrary(filter, page);
  const { data: counts } = useImageStatusCounts();

  useEffect(() => {
    setPage(0);
    setRows([]);
    setSelected([]);
  }, [tab, debounced, tag]);

  useEffect(() => {
    if (!data) return;
    setRows((prev) => (page === 0 ? data.rows : [...prev, ...data.rows]));
  }, [data, page]);

  // Ctrl/Cmd+A markerar allt synligt, Esc avmarkerar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(rows.map((r) => r.id));
      }
      if (e.key === "Escape") setSelected([]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows]);

  const unplaced = counts?.unclassified ?? 0;
  const partial = counts?.partial ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Sök namn, beskrivning eller bildtext"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <AddImageFlow storeId={storeId} label="Lägg till bild" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              tab === t.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Vald tagg — visar alla bilder med samma tagg */}
      {tag && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Tagg:</span>
          <Badge variant="secondary">{tag}</Badge>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setTag(null)}>
            Rensa
          </Button>
        </div>
      )}


      {/* Diskret arbetsstatus — ingen felmarkering, bara vad som återstår */}
      {(unplaced > 0 || partial > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          {unplaced > 0 && (
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{unplaced}</span> oplacerade
              <Button size="sm" variant="outline" className="h-7" onClick={() => setQuick("unclassified")}>
                Sortera
              </Button>
            </span>
          )}
          {partial > 0 && (
            <span className="flex items-center gap-2">
              <span className="tabular-nums font-medium">{partial}</span> delvis klara
              <Button size="sm" variant="outline" className="h-7" onClick={() => setQuick("partial")}>
                Fortsätt
              </Button>
            </span>
          )}
        </div>
      )}

      {isLoading && rows.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <ImageLibraryGrid
          images={rows}
          selectedIds={selected}
          onSelectedChange={setSelected}
          onOpen={(i) => setDetail(rows[i])}
          onTagClick={(t) => {
            setTag(t);
            setTab("all");
          }}
        />
      )}

      {data?.hasMore && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => setPage((p) => p + 1)} disabled={isFetching}>
            {isFetching ? "Hämtar…" : "Visa fler bilder"}
          </Button>
        </div>
      )}

      <ImageBulkBar selectedIds={selected} onClear={() => setSelected([])} />

      {/* Bilddetalj: bilden, vad den hör till och vem som gjort vad */}
      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.title || "Bild"}
              {detail && <Badge variant="outline">{STATUS_LABEL[detail.status]}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <ImageDetail
              image={detail}
              onEdit={() => setEditing(detail)}
              onClose={() => setDetail(null)}
              onTag={(t) => {
                setTag(t);
                setTab("all");
                setDetail(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ImageClassifySheet
        image={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        defaultStoreId={storeId}
      />

      <QuickRunner status={quick} onClose={() => setQuick(null)} storeId={storeId} />
    </div>
  );
}

/**
 * All information om en bild: vem som lagt ut den, när, vad den heter,
 * var i systemet den ligger (tryck för att gå dit), hjärtan, kommentarer
 * och hur många personer som sett den.
 */
function ImageDetail({
  image,
  onEdit,
  onClose,
  onTag,
}: {
  image: LibraryImage;
  onEdit: () => void;
  onClose: () => void;
  onTag: (tag: string) => void;
}) {
  const { data: counts } = useImageEngagement(image.id);
  const { data: viewers = [] } = useImageViewers(image.id);
  const { data: comments = [] } = useImageComments(image.id);
  const { data: favoriteIds = [] } = useMyImageFavorites();
  const toggleFavorite = useToggleImageFavorite();
  const addComment = useAddImageComment();
  const recordView = useRecordImageView();
  const [body, setBody] = useState("");
  const isFav = favoriteIds.includes(image.id);
  const taken = image.captured_at || image.created_at;

  // Visningen registreras en gång per person och bild.
  useEffect(() => {
    recordView.mutate(image.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image.id]);

  return (
    <div className="space-y-4">
      <img
        src={thumbUrl(image.url, THUMB_FULL)}
        alt={image.title || "Bild"}
        className="max-h-[50vh] w-full rounded-lg object-contain"
      />

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <StaffFace name={image.uploaded_by_name} className="h-7 w-7 text-[10px]" />
        <span className="font-medium text-foreground">
          {image.uploaded_by_name || "Äldre bild"}
        </span>
        <span>·</span>
        <span className="tabular-nums">
          {dayLabel(dayKey(taken))} {dayDateLabel(dayKey(taken))} {timeOf(taken)}
        </span>
      </div>

      {/* Hjärtan, kommentarer och sedda */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={isFav ? "default" : "outline"}
          className="h-8"
          onClick={() => toggleFavorite.mutate({ imageId: image.id, favorite: !isFav })}
        >
          <Heart className={cn("mr-1.5 h-4 w-4", isFav && "fill-current")} />
          <span className="tabular-nums">{counts?.hearts ?? 0}</span>
        </Button>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-muted-foreground">
          <MessageCircle className="h-4 w-4" />
          <span className="tabular-nums">{counts?.comments ?? comments.length}</span> kommentarer
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          <span className="tabular-nums">{counts?.views ?? viewers.length}</span> har sett bilden
        </span>
      </div>

      {viewers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Sett av</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {viewers.slice(0, 12).map((v) => (
              <span key={v.id} title={v.viewer_name ?? "Okänd person"} className="inline-flex items-center">
                <StaffFace name={v.viewer_name} className="h-7 w-7 text-[10px] ring-1 ring-background" />
              </span>
            ))}
            {viewers.length > 12 && (
              <span className="text-xs text-muted-foreground">+{viewers.length - 12} till</span>
            )}
          </div>
        </div>
      )}

      {image.description && <p className="text-sm">{image.description}</p>}
      {image.caption && <p className="text-sm text-muted-foreground">{image.caption}</p>}

      {image.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {image.tags.map((t) => (
            <button key={t} type="button" onClick={() => onTag(t)}>
              <Badge
                variant="secondary"
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground"
              >
                {t}
              </Badge>
            </button>
          ))}
        </div>
      )}

      <ImageLinksPanel image={image} onEdit={onEdit} onNavigate={onClose} />

      {/* Kommentarer på bilden */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Kommentarer</h3>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen har kommenterat bilden än.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2 rounded-md border px-2 py-1.5 text-sm">
                <StaffFace name={c.author_name} className="h-6 w-6 shrink-0 text-[9px]" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {c.author_name || "Okänd"} · {dayLabel(dayKey(c.created_at))} {timeOf(c.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Skriv en kommentar"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && body.trim()) {
                addComment.mutate({ imageId: image.id, body: body.trim() });
                setBody("");
              }
            }}
          />
          <Button
            disabled={!body.trim() || addComment.isPending}
            onClick={() => {
              addComment.mutate({ imageId: image.id, body: body.trim() });
              setBody("");
            }}
          >
            Skicka
          </Button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Historik</h3>
        <ImageActivityTimeline mediaId={image.id} />
      </div>
    </div>
  );
}

/** Hämtar just de bilder som ska sorteras och kör snabbläget. */
function QuickRunner({
  status,
  onClose,
  storeId,
}: {
  status: ImageStatus | null;
  onClose: () => void;
  storeId?: string | null;
}) {
  const { data } = useImageLibrary({ status: status ?? "unclassified" }, 0);
  const images = status ? (data?.rows ?? []) : [];
  if (!status || images.length === 0) return null;
  return (
    <ImageQuickClassify
      images={images}
      open
      onClose={onClose}
      defaultStoreId={storeId}
    />
  );
}
