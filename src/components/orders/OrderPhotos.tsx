import { useRef, useState } from "react";
import { Camera, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  useEntityImages,
  useUploadEntityImage,
  useDeleteEntityImage,
  useLinkImageToProduct,
  PRODUCT_PHOTO_ENTITY,
} from "@/hooks/useEntityImages";
import { cn } from "@/lib/utils";

export const ORDER_PHOTO_ENTITY = "shop_order";
export const ORDER_LINE_PHOTO_ENTITY = "shop_order_line";

interface OrderPhotosButtonProps {
  /** "shop_order" för hela ordern, "shop_order_line" för en enskild rad */
  entityType: string;
  entityId: string;
  /** Rubrik i dialogen, t.ex. produktnamn eller ordernummer */
  title: string;
  /** Kompakt läge (ikon utan text) – används i orderrader */
  compact?: boolean;
  /** Om bilden hör till en produkt: gör det möjligt att koppla bilden till produkten */
  productId?: string | null;
  className?: string;
}

/**
 * Egentagna bilder kopplade till en order eller en orderrad.
 * Används för kommunikation mellan beställare och säljare: visa produkten,
 * var varorna står, skador, etiketter m.m.
 */
export function OrderPhotosButton({
  entityType,
  entityId,
  title,
  compact,
  productId,
  className,
}: OrderPhotosButtonProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [pending, setPending] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: images = [] } = useEntityImages(entityType, entityId);
  const upload = useUploadEntityImage();
  const del = useDeleteEntityImage();
  const linkToProduct = useLinkImageToProduct();
  const { data: productImages = [] } = useEntityImages(
    PRODUCT_PHOTO_ENTITY,
    open ? productId : null,
  );
  const linkedUrls = new Set(productImages.map((i) => i.url));

  const handleLink = async (url: string, caption: string | null) => {
    if (!productId) return;
    try {
      await linkToProduct.mutateAsync({ productId, url, caption });
      toast({ title: "Bilden kopplad till produkten" });
    } catch (e: any) {
      toast({ title: "Kunde inte koppla bild", description: e?.message, variant: "destructive" });
    }
  };

  /** Valda filer väntar på att bekräftas med "Lägg till". */
  const pickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    setPending((prev) => [...prev, ...Array.from(files)]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleAdd = async () => {
    if (!pending.length) return;
    try {
      for (const file of pending) {
        await upload.mutateAsync({ entityType, entityId, file, caption: caption || undefined });
      }
      toast({ title: pending.length > 1 ? "Bilderna tillagda" : "Bilden tillagd" });
      setPending([]);
      setCaption("");
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Kunde inte ladda upp", description: e?.message, variant: "destructive" });
    }
  };

  const count = images.length;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={count ? `${count} bild(er)` : "Lägg till bild"}
        className={cn(
          "gap-1 px-1.5",
          compact ? "h-5 text-[10px]" : "h-6 text-xs",
          count ? "text-primary" : "text-muted-foreground",
          className,
        )}
      >
        <Camera className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        {count > 0 && <span className="font-mono">{count}</span>}
        {!compact && count === 0 && <span>Bild</span>}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setPending([]);
            setCaption("");
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-base">Bilder · {title}</DialogTitle>
            <DialogDescription className="text-xs">
              Egentagna bilder för att visa produkt, var varorna står eller annan information.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Bildtext (valfritt)"
              className="h-8 text-xs"
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => pickFiles(e.target.files)}
            />
            <Button
              size="sm"
              className="h-8 gap-1.5 whitespace-nowrap"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
              Ta / välj bild
            </Button>
            <Button
              size="sm"
              variant="default"
              className="h-8 gap-1.5 whitespace-nowrap"
              onClick={handleAdd}
              disabled={!pending.length || upload.isPending}
            >
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Lägg till{pending.length > 1 ? ` (${pending.length})` : ""}
            </Button>
          </div>

          {pending.length > 0 && (
            <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-border p-2">
              {pending.map((f, i) => (
                <div key={`${f.name}-${i}`} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt={f.name}
                    className="h-16 w-16 rounded-md border border-border object-cover"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-background text-destructive shadow"
                    onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}
                    title="Ta bort vald bild"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {count === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Inga bilder ännu. Ta en bild med kameran eller välj en fil.
            </p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
              {images.map((img) => (
                <div key={img.id} className="group relative overflow-hidden rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setZoom(img.url)}
                    className="block aspect-square w-full"
                  >
                    <img
                      src={img.url}
                      alt={img.caption || title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </button>
                  <div className="space-y-0.5 p-1.5">
                    {img.caption && <p className="truncate text-[10px] text-foreground">{img.caption}</p>}
                    <p className="truncate text-[9px] text-muted-foreground">
                      {img.uploaded_by_name || "Okänd"} ·{" "}
                      {new Date(img.created_at).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  {productId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "absolute left-1 top-1 h-6 w-6 bg-background/80 transition",
                        linkedUrls.has(img.url)
                          ? "text-primary"
                          : "text-muted-foreground opacity-0 group-hover:opacity-100",
                      )}
                      onClick={() => handleLink(img.url, img.caption)}
                      title={
                        linkedUrls.has(img.url)
                          ? "Redan kopplad till produkten"
                          : "Koppla bilden till produkten"
                      }
                      disabled={linkedUrls.has(img.url) || linkToProduct.isPending}
                    >
                      <Link2 className="h-3 w-3" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-6 w-6 bg-background/80 text-destructive opacity-0 transition group-hover:opacity-100"
                    onClick={() => del.mutate(img.id)}
                    title="Ta bort bild"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-4xl p-2">
          {zoom && <img src={zoom} alt={title} className="h-auto w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
