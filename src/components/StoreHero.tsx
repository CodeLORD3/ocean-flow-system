import { useRef, useState } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useStores } from "@/hooks/useStores";
import {
  useEntityImages,
  useUploadEntityImage,
  useSetCoverImage,
  useUpdateEntityImage,
  useDeleteEntityImage,
} from "@/hooks/useEntityImages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { focalClass, FOCAL_OPTIONS } from "@/lib/imageFocal";
import { MapPin, Store as StoreIcon, Upload, Images, Pencil, Trash2, Check, X, Loader2, Crop } from "lucide-react";

/**
 * Hero/cover image shown at the top of every page inside a shop portal.
 * Staff with shop/admin access can change, caption or remove the image inline.
 */
export function StoreHero() {
  const { site, activeStoreId, activeStoreName } = useSite();
  const { staff } = useStaffAuth();
  const { data: stores = [] } = useStores();
  const { data: images = [] } = useEntityImages("store", site === "shop" ? activeStoreId : null);

  const upload = useUploadEntityImage();
  const setCover = useSetCoverImage();
  const updateImage = useUpdateEntityImage();
  const deleteImage = useDeleteEntityImage();

  const fileRef = useRef<HTMLInputElement>(null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);

  if (site !== "shop" || !activeStoreId) return null;

  const store = stores.find((s) => s.id === activeStoreId);
  const cover = images.find((img) => img.is_cover) ?? images[0] ?? null;
  const url = cover?.url || store?.logo_url || null;

  const access = staff?.portal_access ?? [];
  const isAdmin = access.includes("admin");
  const allowedIds = new Set<string>([
    ...(staff?.allowed_store_ids ?? []),
    ...(staff?.allowed_store_id ? [staff.allowed_store_id] : []),
  ]);
  const canEdit =
    isAdmin || (access.includes("shop") && (allowedIds.size === 0 || allowedIds.has(activeStoreId)));

  const busy = upload.isPending || setCover.isPending || updateImage.isPending || deleteImage.isPending;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const newId = await upload.mutateAsync({ entityType: "store", entityId: activeStoreId, file });
      if (newId) {
        await setCover.mutateAsync({ entityType: "store", entityId: activeStoreId, imageId: newId });
      }
      toast.success("Omslagsbild uppdaterad");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ladda upp bilden");
    }
  };

  const handleSelect = async (imageId: string) => {
    try {
      await setCover.mutateAsync({ entityType: "store", entityId: activeStoreId, imageId });
      setPickerOpen(false);
      toast.success("Omslagsbild uppdaterad");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte byta bild");
    }
  };

  const handleSaveCaption = async () => {
    if (!cover) return;
    try {
      await updateImage.mutateAsync({ id: cover.id, caption: captionDraft.trim() || null });
      setEditingCaption(false);
      toast.success("Bildtext sparad");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte spara bildtexten");
    }
  };

  const handleFocal = async (focal: string) => {
    if (!cover) return;
    try {
      await updateImage.mutateAsync({ id: cover.id, focal_point: focal });
      setCropOpen(false);
      toast.success("Beskärning uppdaterad");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte spara beskärningen");
    }
  };

  const handleDelete = async () => {
    if (!cover) return;
    try {
      await deleteImage.mutateAsync(cover.id);
      toast.success("Bilden togs bort");
    } catch (e: any) {
      toast.error(e?.message ?? "Kunde inte ta bort bilden");
    }
  };

  return (
    <div className="group relative mb-4 h-28 sm:h-36 lg:h-44 w-full overflow-hidden rounded-lg border border-border bg-muted">
      {url ? (
        <img
          src={url}
          alt={cover?.caption || `Omslagsbild för ${activeStoreName ?? "butiken"}`}
          className={`h-full w-full object-cover ${focalClass(cover?.focal_point)}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <StoreIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/20 to-transparent" />

      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base sm:text-xl font-semibold text-foreground text-outline-white-thin sm:text-outline-white">
            {activeStoreName ?? store?.name ?? "Butik"}
          </h2>
          {editingCaption ? (
            <div className="mt-1 flex items-center gap-1">
              <Input
                value={captionDraft}
                onChange={(e) => setCaptionDraft(e.target.value)}
                placeholder="Bildtext"
                className="h-7 w-48 text-xs"
                autoFocus
              />
              <Button size="icon" variant="secondary" className="h-7 w-7" onClick={handleSaveCaption} disabled={busy}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCaption(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : cover?.caption ? (
            <p className="truncate text-[11px] sm:text-xs text-muted-foreground">{cover.caption}</p>
          ) : (
            (store?.city || store?.address) && (
              <p className="flex items-center gap-1 truncate text-[11px] sm:text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                {[store?.address, store?.city].filter(Boolean).join(", ")}
              </p>
            )
          )}
        </div>
      </div>

      {canEdit && (
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1 text-[11px]"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />} Byt bild
          </Button>

          {images.length > 0 && (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" disabled={busy}>
                  <Images className="h-3 w-3" /> Välj
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-2">
                <p className="mb-2 text-[11px] font-medium text-muted-foreground">Butikens bilder</p>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => handleSelect(img.id)}
                      className={`relative aspect-[4/3] overflow-hidden rounded border transition-colors ${
                        img.id === cover?.id ? "border-primary" : "border-border hover:border-primary/60"
                      }`}
                    >
                      <img src={img.url} alt={img.caption || "Butiksbild"} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {cover && (
            <>
              <Popover open={cropOpen} onOpenChange={setCropOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="secondary" className="h-7 gap-1 text-[11px]" disabled={busy} title="Beskär bilden">
                    <Crop className="h-3 w-3" /> Beskär
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-44 p-2">
                  <p className="mb-2 text-[11px] font-medium text-muted-foreground">Visa del av bilden</p>
                  <div className="flex flex-col gap-1">
                    {FOCAL_OPTIONS.map((opt) => (
                      <Button
                        key={opt.value}
                        size="sm"
                        variant={(cover.focal_point ?? "center") === opt.value ? "default" : "ghost"}
                        className="h-7 justify-start text-[11px]"
                        onClick={() => handleFocal(opt.value)}
                        disabled={busy}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7"
                title="Redigera bildtext"
                onClick={() => {
                  setCaptionDraft(cover.caption ?? "");
                  setEditingCaption(true);
                }}
                disabled={busy}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7 text-destructive"
                title="Ta bort bilden"
                onClick={handleDelete}
                disabled={busy}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
