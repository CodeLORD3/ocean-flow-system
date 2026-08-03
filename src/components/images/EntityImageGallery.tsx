import { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2, ImageIcon, X, Star, Crop } from "lucide-react";
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
} from "@/hooks/useEntityImages";
import { cn } from "@/lib/utils";
import { focalStyle, focalPercent, focalLabel } from "@/lib/imageFocal";

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
};

export function EntityImageGallery({
  entityType,
  entityId,
  title = "Bilder",
  description,
  editable = true,
  className,
  columnsClassName = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
}: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const { data: images = [], isLoading } = useEntityImages(entityType, entityId);
  const upload = useUploadEntityImage();
  const updateImage = useUpdateEntityImage();
  const removeImage = useDeleteEntityImage();
  const setCover = useSetCoverImage();

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
    } catch (e: any) {
      toast({ title: "Kunde inte ladda upp", description: e.message, variant: "destructive" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-heading font-bold text-foreground flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            {title}
          </h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
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

      {isLoading ? (
        <div className="text-xs text-muted-foreground">Laddar bilder…</div>
      ) : images.length === 0 ? (
        <Card className="p-4 text-center border-dashed">
          <ImageIcon className="h-5 w-5 mx-auto text-muted-foreground/60" />
          <p className="mt-1 text-xs text-muted-foreground">Inga bilder ännu</p>
        </Card>
      ) : (
        <div className={cn("grid gap-2", columnsClassName)}>
          {images.map((img) => (
            <Card key={img.id} className="overflow-hidden group relative">
              <button
                type="button"
                onClick={() => setLightbox(img.url)}
                className="block w-full aspect-video bg-muted overflow-hidden"
              >
                <img
                  src={img.url}
                  alt={img.caption || `${title} bild`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                  style={focalStyle(img.focal_point)}
                />
              </button>
              {/* Uppladdningstidpunkt i nedre vänstra hörnet av bilden */}
              <span className="absolute bottom-[38px] left-1 rounded bg-background/80 px-1 py-0.5 font-mono tabular-nums text-[9px] text-foreground backdrop-blur pointer-events-none">
                {uploadedLabel(img.created_at)}
              </span>
              {img.is_cover && (
                <Badge className="absolute top-1 left-1 h-4 gap-1 px-1.5 text-[9px] pointer-events-none">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Omslag
                </Badge>
              )}

              {editable && (
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
                      <Star className={cn("h-3 w-3", img.is_cover && "fill-current")} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {img.is_cover ? "Omslagsbild – klicka för att ta bort" : "Sätt som omslagsbild"}
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="p-1.5 flex items-center gap-1">
                {editable ? (
                  <Input
                    defaultValue={img.caption || ""}
                    placeholder="Bildtext…"
                    className="h-6 text-[11px] border-transparent hover:border-input focus-visible:border-input px-1.5"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (img.caption || "")) updateImage.mutate({ id: img.id, caption: v || null });
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-muted-foreground truncate flex-1 px-1">
                    {img.caption || "—"}
                  </span>
                )}
                {editable && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground shrink-0"
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
                    className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                    aria-label="Ta bort bild"
                    onClick={() => removeImage.mutate(img.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Förstorad bild</DialogDescription>
          </DialogHeader>
          {lightbox && (
            <img src={lightbox} alt={title} className="w-full h-auto rounded-md object-contain max-h-[80vh]" />
          )}
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
