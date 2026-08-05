import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Heart, MessageCircle, Pencil, Send, Trash2, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/imageMeta";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useAddImageComment,
  useDeleteImageComment,
  useImageComments,
  useUpdateImageComment,
  type EntityImage,
} from "@/hooks/useEntityImages";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

type Props = {
  images: EntityImage[];
  /** Index i images-listan, eller null när galleriet är stängt */
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  title?: string;
  editable?: boolean;
  onSaveCaption?: (id: string, caption: string | null) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (id: string, favorite: boolean) => void;
};

/** Helskärmsgalleri: pilnavigering (desktop), Instagram-liknande swipe-karusell (mobil) och kommentarschatt. */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
  title = "Bild",
  editable = false,
  onSaveCaption,
  favoriteIds = [],
  onToggleFavorite,
}: Props) {
  const open = index !== null && index >= 0 && index < images.length;
  const current = open ? images[index as number] : null;
  const isMobile = useIsMobile();
  const [caption, setCaption] = useState("");
  const [captionEditing, setCaptionEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);
  const { staff } = useStaffAuth();
  const { data: comments = [], isLoading: loadingComments } = useImageComments(current?.id);
  const addComment = useAddImageComment();
  const editComment = useUpdateImageComment();
  const delComment = useDeleteImageComment();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCaption(current?.caption || "");
    setCaptionEditing(false);
    setDraft("");
  }, [current?.id, current?.caption]);

  useEffect(() => {
    if (!open) setCommentsOpen(false);
  }, [open]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments.length, current?.id, commentsOpen]);

  // Buntar kommentarer per person i följd (chatt-stil)
  const groups = useMemo(() => {
    const out: { author: string; userId: string | null; items: typeof comments }[] = [];
    comments.forEach((c) => {
      const last = out[out.length - 1];
      if (last && last.author === c.author_name && last.userId === c.user_id) last.items.push(c);
      else out.push({ author: c.author_name, userId: c.user_id, items: [c] });
    });
    return out;
  }, [comments]);

  const go = (delta: number) => {
    if (index === null || images.length === 0) return;
    const next = (index + delta + images.length) % images.length;
    onIndexChange(next);
  };

  useEffect(() => {
    if (!open || isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, images.length, isMobile]);

  // Håller karusellen i synk när index ändras utifrån (t.ex. öppning)
  useEffect(() => {
    if (!isMobile || !open) return;
    const el = trackRef.current;
    if (!el) return;
    const target = (index as number) * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 4) el.scrollTo({ left: target, behavior: "auto" });
  }, [isMobile, open, index]);

  const onTrackScroll = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (i !== index && i >= 0 && i < images.length) onIndexChange(i);
    }, 90);
  }, [index, images.length, onIndexChange]);

  const saveCaption = () => {
    if (!current || !onSaveCaption) return;
    const v = caption.trim();
    if (v !== (current.caption || "")) onSaveCaption(current.id, v || null);
  };

  const send = async () => {
    const v = draft.trim();
    if (!v || !current) return;
    setDraft("");
    draftRef.current?.focus();
    await addComment.mutateAsync({ imageId: current.id, body: v });
  };

  const saveEdit = async (id: string) => {
    const v = editDraft.trim();
    if (!v || !current) return;
    setEditId(null);
    await editComment.mutateAsync({ id, imageId: current.id, body: v });
  };

  const isFav = !!current && favoriteIds.includes(current.id);

  const commentList = (
    <>
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[180px]">
        {loadingComments ? (
          <p className="text-xs text-muted-foreground">Laddar…</p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">Inga kommentarer ännu — skriv den första.</p>
        ) : (
          groups.map((g, gi) => {
            const mine = !!staff && g.userId === staff.user_id;
            return (
              <div key={gi} className={cn("flex gap-2", mine && "flex-row-reverse")}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
                  {initialsOf(g.author)}
                </span>
                <div className={cn("min-w-0 space-y-1", mine && "items-end flex flex-col")}>
                  <p className="text-[10px] font-medium text-muted-foreground">{g.author}</p>
                  {g.items.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "group relative rounded-lg px-2.5 py-1.5 text-xs break-words max-w-[220px]",
                        mine ? "bg-primary/10 text-foreground" : "bg-muted text-foreground"
                      )}
                    >
                      {editId === c.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editDraft}
                            autoFocus
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveEdit(c.id);
                              } else if (e.key === "Escape") {
                                setEditId(null);
                              }
                            }}
                            className="h-7 text-xs"
                          />
                          <button
                            type="button"
                            aria-label="Spara ändring"
                            onClick={() => void saveEdit(c.id)}
                            className="text-primary"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Avbryt"
                            onClick={() => setEditId(null)}
                            className="text-muted-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          {c.body}
                          <span className="block mt-0.5 text-[9px] text-muted-foreground font-mono tabular-nums">
                            {new Date(c.created_at).toLocaleTimeString("sv-SE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {c.edited_at && (
                            <span className="block text-[9px] italic text-muted-foreground">
                              Redigerad av {c.edited_by_name || "okänd"}{" "}
                              <span className="font-mono tabular-nums not-italic">
                                {new Date(c.edited_at).toLocaleString("sv-SE", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </span>
                          )}
                        </>
                      )}
                      {mine && editId !== c.id && (
                        <div
                          className={cn(
                            "absolute -left-5 top-1 flex-col gap-1",
                            isMobile ? "flex" : "hidden group-hover:flex"
                          )}
                        >
                          <button
                            type="button"
                            aria-label="Redigera kommentar"
                            onClick={() => {
                              setEditId(c.id);
                              setEditDraft(c.body);
                            }}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Ta bort kommentar"
                            onClick={() => current && delComment.mutate({ id: c.id, imageId: current.id })}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t p-2 flex items-center gap-1.5">
        <Input
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          enterKeyHint="send"
          autoComplete="off"
          placeholder="Skriv en kommentar…"
          className={cn("h-9", isMobile ? "text-base" : "h-8 text-xs")}
        />
        <Button
          size="icon"
          className={cn("shrink-0", isMobile ? "h-9 w-9" : "h-8 w-8")}
          aria-label="Skicka kommentar"
          disabled={!draft.trim() || addComment.isPending}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void send()}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>

    </>
  );

  const captionEditedMeta = current?.caption_edited_at ? (
    <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Pencil className="h-2.5 w-2.5 shrink-0" />
      Redigerad av {current.caption_edited_by_name || "okänd"} ·{" "}
      <span className="font-mono tabular-nums">
        {new Date(current.caption_edited_at).toLocaleString("sv-SE", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </p>
  ) : null;

  const captionMeta = current && (
    <div className="space-y-1">
      {editable && captionEditing ? (
        <div className="space-y-1.5">
          <Textarea
            autoFocus
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                saveCaption();
                setCaptionEditing(false);
              } else if (e.key === "Escape") {
                setCaption(current.caption || "");
                setCaptionEditing(false);
              }
            }}
            placeholder="Skriv en bildtext…"
            rows={2}
            className={cn(
              "min-h-[56px] resize-none rounded-xl leading-snug",
              isMobile ? "text-base" : "text-xs"
            )}
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className={cn("text-xs", isMobile ? "h-9" : "h-7")}
              onClick={() => {
                setCaption(current.caption || "");
                setCaptionEditing(false);
              }}
            >
              Avbryt
            </Button>
            <Button
              size="sm"
              className={cn("text-xs", isMobile ? "h-9" : "h-7")}
              disabled={caption.trim() === (current.caption || "")}
              onClick={() => {
                saveCaption();
                setCaptionEditing(false);
              }}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              Spara
            </Button>
          </div>
        </div>
      ) : (
        <div className="group flex items-start gap-1.5">
          <p
            className={cn(
              "min-w-0 flex-1 whitespace-pre-wrap break-words leading-snug",
              current.caption
                ? isMobile
                  ? "text-sm text-foreground"
                  : "text-xs text-foreground"
                : "text-xs italic text-muted-foreground"
            )}
          >
            {current.uploaded_by_name && current.caption && (
              <span className="mr-1.5 font-semibold">{current.uploaded_by_name}</span>
            )}
            {current.caption || (editable ? "Lägg till en bildtext…" : "—")}
          </p>
          {editable && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Redigera bildtext"
              onClick={() => {
                setCaption(current.caption || "");
                setCaptionEditing(true);
              }}
              className={cn(
                "shrink-0 rounded-full text-muted-foreground transition-opacity hover:text-foreground",
                isMobile ? "h-8 w-8" : "h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              )}
            >
              <Pencil className={isMobile ? "h-4 w-4" : "h-3 w-3"} />
            </Button>
          )}
        </div>
      )}
      {captionEditedMeta}
    </div>
  );


  const uploaderMeta = current && (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
        {initialsOf(current.uploaded_by_name)}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {current.uploaded_by_name || "Okänd uppladdare"}
        </p>
        <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
          {new Date(current.created_at).toLocaleString("sv-SE", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );

  // ---------- Mobil: Instagram-liknande swipe-karusell ----------
  if (isMobile) {
    return (
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setCaptionEditing(false);
            onClose();
          }
        }}

      >
        <DialogContent className="max-w-full h-[100dvh] w-screen rounded-none border-0 p-0 gap-0 overflow-hidden bg-background">
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Helskärmsvisning av bilder med kommentarer</DialogDescription>
          </DialogHeader>

          {current && (
            <div className="flex h-full flex-col">
              {/* Karusell – bilderna hänger ihop och snappar */}
              <div className="relative flex-1 min-h-0 bg-black">
                <div
                  ref={trackRef}
                  onScroll={onTrackScroll}
                  className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {images.map((img) => (
                    <div key={img.id} className="h-full w-full shrink-0 snap-center flex items-center justify-center">
                      <img
                        src={img.url}
                        alt={img.caption || title}
                        className="max-h-full w-full object-contain select-none"
                        draggable={false}
                      />
                    </div>
                  ))}
                </div>

                {images.length > 1 && (
                  <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
                    {images.slice(0, 12).map((img, i) => (
                      <span
                        key={img.id}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          i === index ? "w-4 bg-white" : "w-1.5 bg-white/50"
                        )}
                      />
                    ))}
                  </div>
                )}

                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label="Stäng bildfönstret"
                    className="absolute top-2 right-2 z-20 h-10 w-10 rounded-full bg-background/85 text-foreground backdrop-blur border border-border flex items-center justify-center"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </DialogClose>

                <span className="absolute top-2 left-2 rounded bg-background/80 px-2 py-0.5 font-mono tabular-nums text-[11px] text-foreground backdrop-blur">
                  {(index as number) + 1} / {images.length}
                </span>
              </div>

              {/* Bild + bildtext är det viktiga; kommentarer bakom ikon */}
              <div className="shrink-0 border-t p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  {uploaderMeta}
                  <div className="flex items-center gap-1">
                    {onToggleFavorite && (
                      <button
                        type="button"
                        aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera bild"}
                        onClick={() => onToggleFavorite(current.id, !isFav)}
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center",
                          isFav ? "text-rose-500" : "text-muted-foreground"
                        )}
                      >
                        <Heart className={cn("h-5 w-5", isFav && "fill-current")} />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Visa kommentarer"
                      onClick={() => setCommentsOpen(true)}
                      className="relative h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground"
                    >
                      <MessageCircle className="h-5 w-5" />
                      {comments.length > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                          {comments.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
                {captionMeta}
              </div>
            </div>
          )}
        </DialogContent>

        <Sheet open={commentsOpen && open} onOpenChange={setCommentsOpen}>
          <SheetContent side="bottom" className="h-[75dvh] p-0 flex flex-col gap-0">
            <SheetHeader className="px-3 py-2 border-b text-left">
              <SheetTitle className="text-sm">
                Kommentarer{" "}
                <span className="font-mono tabular-nums text-xs text-muted-foreground">({comments.length})</span>
              </SheetTitle>
            </SheetHeader>
            {commentList}
          </SheetContent>
        </Sheet>
      </Dialog>
    );
  }

  // ---------- Desktop ----------
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          saveCaption();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-6xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Helskärmsvisning av bilder med kommentarer</DialogDescription>
        </DialogHeader>

        {current && (
          <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div
                className="relative bg-black/90 flex items-center justify-center select-none"
                onTouchStart={(e) => {
                  const t = e.touches[0];
                  touchStart.current = { x: t.clientX, y: t.clientY };
                }}
                onTouchEnd={(e) => {
                  const s = touchStart.current;
                  touchStart.current = null;
                  if (!s) return;
                  const t = e.changedTouches[0];
                  const dx = t.clientX - s.x;
                  const dy = t.clientY - s.y;
                  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
                }}
              >
                <img
                  src={current.url}
                  alt={current.caption || title}
                  className="max-h-[70vh] w-full object-contain"
                />

                {images.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Föregående bild"
                      onClick={() => go(-1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Nästa bild"
                      onClick={() => go(1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full opacity-80 hover:opacity-100"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </Button>
                  </>
                )}

                {onToggleFavorite && (
                  <button
                    type="button"
                    aria-label={isFav ? "Ta bort favorit" : "Favoritmarkera bild"}
                    onClick={() => onToggleFavorite(current.id, !isFav)}
                    className={cn(
                      "absolute top-2 right-14 h-8 w-8 rounded-full bg-background/85 backdrop-blur border flex items-center justify-center",
                      isFav ? "text-rose-500 border-rose-400" : "text-muted-foreground border-border"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", isFav && "fill-current")} />
                  </button>
                )}

                <DialogClose asChild>
                  <button
                    type="button"
                    aria-label="Stäng bildfönstret"
                    className="absolute top-2 right-2 z-20 h-9 w-9 rounded-full bg-background/85 text-foreground backdrop-blur border border-border flex items-center justify-center hover:bg-background"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </DialogClose>

                <span className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 font-mono tabular-nums text-[11px] text-foreground backdrop-blur">
                  {(index as number) + 1} / {images.length}
                </span>
              </div>

              <div className="p-3 space-y-2 border-t">
                {uploaderMeta}
                {captionMeta}
                <p className="text-[10px] text-muted-foreground">
                  Bläddra med piltangenterna eller swipa på mobil.
                </p>
              </div>
            </div>

            {/* Kommentarschatt */}
            <div className="flex flex-col border-t md:border-t-0 md:border-l max-h-[80vh] md:max-h-none">
              <div className="px-3 py-2 border-b">
                <p className="text-xs font-heading font-bold text-foreground">Kommentarer</p>
                <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
                  {comments.length} {comments.length === 1 ? "kommentar" : "kommentarer"}
                </p>
              </div>
              {commentList}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
