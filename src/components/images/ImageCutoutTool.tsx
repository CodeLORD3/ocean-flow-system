import { useState } from "react";
import { Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AnnotatableImage, type ImageRegion } from "@/components/images/AnnotatableImage";
import { usePickResources } from "@/hooks/useImagePickers";
import { useCreateCutout } from "@/hooks/useImageCutouts";

/**
 * Klipp ut en del av bilden till en egen bild.
 *
 * Man fotar en hylla med många saker, markerar en sak i bilden och ger den
 * ett namn. Utsnittet blir en egen bild i biblioteket — och kan samtidigt
 * skapa saken i registret, så att en bättre bild kan läggas till senare.
 * Originalbilden ändras aldrig.
 */
export default function ImageCutoutTool({
  mediaId,
  url,
  alt,
  imgClassName,
  onCreated,
}: {
  mediaId: string;
  url: string;
  alt?: string;
  imgClassName?: string;
  onCreated?: (mediaId: string) => void;
}) {
  const [markMode, setMarkMode] = useState(false);
  const [region, setRegion] = useState<ImageRegion | null>(null);
  const [title, setTitle] = useState("");
  const [asResource, setAsResource] = useState(true);
  const [search, setSearch] = useState("");
  const [existingId, setExistingId] = useState<string | null>(null);
  const { data: matches = [] } = usePickResources(search);
  const create = useCreateCutout();

  const reset = () => {
    setRegion(null);
    setTitle("");
    setExistingId(null);
    setSearch("");
    setMarkMode(false);
  };

  const save = async () => {
    if (!region || !title.trim()) return;
    try {
      const res = await create.mutateAsync({
        sourceMediaId: mediaId,
        sourceUrl: url,
        region,
        title: title.trim(),
        createResource: asResource && !existingId,
        resourceId: existingId,
      });
      toast.success(
        asResource || existingId ? `${title.trim()} finns nu som sak med bild` : "Utsnittet är sparat som egen bild",
      );
      onCreated?.(res.mediaId);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte klippa ut bilden");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <AnnotatableImage
          src={url}
          alt={alt || title || "Bild"}
          imgClassName={cn("max-h-[50vh] w-full rounded-lg object-contain", imgClassName)}
          markMode={markMode}
          marks={
            region
              ? [{ id: "ny", number: 1, region, label: "Markerad del" }]
              : []
          }
          activeId={region ? "ny" : null}
          onRegion={(r) => setRegion(r)}
        />
        <button
          type="button"
          onClick={() => {
            setRegion(null);
            setMarkMode((v) => !v);
          }}
          className={cn(
            "absolute left-2 top-2 z-20 flex h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold backdrop-blur",
            markMode
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background/85 text-foreground",
          )}
        >
          <Scissors className="h-4 w-4" />
          {markMode ? "Dra över saken i bilden" : "Klipp ut en del"}
        </button>
      </div>

      {region && (
        <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ny bild av markeringen
          </p>
          <Input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSearch(e.target.value);
              setExistingId(null);
            }}
            placeholder="Vad är det? T.ex. Hammare"
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={asResource ? "default" : "outline"}
              className="h-8 text-[11px]"
              onClick={() => setAsResource(true)}
            >
              Skapa saken i registret
            </Button>
            <Button
              type="button"
              size="sm"
              variant={asResource ? "outline" : "default"}
              className="h-8 text-[11px]"
              onClick={() => {
                setAsResource(false);
                setExistingId(null);
              }}
            >
              Bara en egen bild
            </Button>
          </div>

          {asResource && title.trim().length > 1 && matches.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">Finns redan — koppla till:</p>
              <div className="flex flex-wrap gap-1.5">
                {matches.slice(0, 8).map((m) => (
                  <Button
                    key={m.id}
                    type="button"
                    size="sm"
                    variant={existingId === m.id ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    onClick={() => {
                      setExistingId(existingId === m.id ? null : m.id);
                      setTitle(m.name);
                    }}
                  >
                    {m.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={reset}>
              Avbryt
            </Button>
            <Button
              size="sm"
              className="h-8 text-[11px]"
              disabled={!title.trim() || create.isPending}
              onClick={() => void save()}
            >
              {create.isPending ? "Sparar…" : "Spara utsnittet"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
