import { useMemo, useState } from "react";
import { Check, ImageIcon, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useImageArchive } from "@/hooks/useImageArchive";
import type { EntityImage } from "@/hooks/useEntityImages";
import { dayKey, dayLabel } from "@/lib/imageMeta";
import { dayBadgeClass } from "@/lib/dayColor";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kallas med de valda bilderna. */
  onPick: (images: EntityImage[]) => void | Promise<void>;
  title?: string;
  saving?: boolean;
};

/** Sök i bildarkivet och välj en eller flera bilder att återanvända. */
export function ImageArchivePicker({ open, onOpenChange, onPick, title = "Sök i bildarkivet", saving }: Props) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { data: images = [], isLoading } = useImageArchive();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return images;
    return images.filter((i) =>
      [i.caption, i.uploaded_by_name, dayLabel(dayKey(i.created_at)), dayKey(i.created_at)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [images, q]);

  /** Gruppera i dagar: Idag, Igår, sedan veckodag och datum. */
  const days = useMemo(() => {
    const map = new Map<string, EntityImage[]>();
    filtered.forEach((i) => {
      const k = dayKey(i.created_at);
      map.set(k, [...(map.get(k) || []), i]);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const confirm = async () => {
    await onPick(images.filter((i) => picked.includes(i.id)));
    setPicked([]);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked([]);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            Sök på bildtext, person eller dag. Välj en eller flera bilder.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Sök"
            className="h-10 pl-8 text-sm"
          />
        </div>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {isLoading ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Laddar bilder…</p>
          ) : days.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">Inga bilder matchar sökningen.</p>
          ) : (
            days.map(([key, imgs]) => (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[11px] font-semibold",
                      dayBadgeClass(`${key}T12:00:00`),
                    )}
                  >
                    {dayLabel(key)}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {imgs.length}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {imgs.map((img) => {
                    const active = picked.includes(img.id);
                    return (
                      <button
                        key={img.id}
                        type="button"
                        onClick={() => toggle(img.id)}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-md border-2 bg-muted",
                          active ? "border-primary" : "border-transparent opacity-80 hover:opacity-100",
                        )}
                      >
                        <img
                          src={thumbUrl(img.url, THUMB_TILE)}
                          alt={img.caption || "Bild"}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {active && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {picked.length} valda
          </span>
          <Button size="sm" disabled={!picked.length || saving} onClick={confirm}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1 h-3.5 w-3.5" />}
            Lägg till
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ImageArchivePicker;
