import { useRef, useState } from "react";
import { ImagePlus, Trash2, Loader2, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useEntityImages,
  useUploadEntityImage,
  useUpdateEntityImage,
  useDeleteEntityImage,
} from "@/hooks/useEntityImages";
import { cn } from "@/lib/utils";

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
            <Card key={img.id} className="overflow-hidden group">
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
                />
              </button>
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
