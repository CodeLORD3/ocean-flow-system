import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Heart, Pencil, Send, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { initialsOf } from "@/lib/imageMeta";
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

/** Helskärmsgalleri med pilnavigering (tangentbord), swipe (mobil) och kommentarschatt. */
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
  const [caption, setCaption] = useState("");
  const [draft, setDraft] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const { staff } = useStaffAuth();
  const { data: comments = [], isLoading: loadingComments } = useImageComments(current?.id);
  const addComment = useAddImageComment();
  const editComment = useUpdateImageComment();
  const delComment = useDeleteImageComment();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCaption(current?.caption || "");
    setDraft("");
  }, [current?.id, current?.caption]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [comments.length, current?.id]);

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
    if (!open) return;
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
  }, [open, index, images.length]);

  const saveCaption = () => {
    if (!current || !onSaveCaption) return;
    const v = caption.trim();
    if (v !== (current.caption || "")) onSaveCaption(current.id, v || null);
  };

  const send = async () => {
    const v = draft.trim();
    if (!v || !current) return;
    setDraft("");
    await addComment.mutateAsync({ imageId: current.id, body: v });
  };

  const isFav = !!current && favoriteIds.includes(current.id);

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
                      "absolute top-2 right-2 h-8 w-8 rounded-full bg-background/85 backdrop-blur border flex items-center justify-center",
                      isFav ? "text-rose-500 border-rose-400" : "text-muted-foreground border-border"
                    )}
                  >
                    <Heart className={cn("h-4 w-4", isFav && "fill-current")} />
                  </button>
                )}

                <span className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 font-mono tabular-nums text-[11px] text-foreground backdrop-blur">
                  {(index as number) + 1} / {images.length}
                </span>
              </div>

              <div className="p-3 space-y-2 border-t">
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
                {editable ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        onBlur={saveCaption}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            saveCaption();
                          }
                        }}
                        placeholder="Bildtext…"
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs"
                        disabled={caption.trim() === (current.caption || "")}
                        onClick={saveCaption}
                      >
                        Spara
                      </Button>
                    </div>
                    {current.caption_edited_at && (
                      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Pencil className="h-2.5 w-2.5" />
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
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">{current.caption || "—"}</p>
                    {current.caption_edited_at && (
                      <p className="text-[10px] text-muted-foreground">
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
                    )}
                  </div>
                )}
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
                              {c.body}
                              <span className="block mt-0.5 text-[9px] text-muted-foreground font-mono tabular-nums">
                                {new Date(c.created_at).toLocaleTimeString("sv-SE", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              {mine && (
                                <button
                                  type="button"
                                  aria-label="Ta bort kommentar"
                                  onClick={() => delComment.mutate({ id: c.id, imageId: current.id })}
                                  className="absolute -left-5 top-1 hidden group-hover:block text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
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
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Skriv en kommentar…"
                  className="h-8 text-xs"
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  aria-label="Skicka kommentar"
                  disabled={!draft.trim() || addComment.isPending}
                  onClick={() => void send()}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
