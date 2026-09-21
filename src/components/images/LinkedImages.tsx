import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { thumbUrl, THUMB_TILE, THUMB_FULL } from "@/lib/imageThumb";
import { StaffFace } from "@/components/staff/StaffNameAvatar";
import AddImageFlow from "./AddImageFlow";
import ImageLinksPanel from "./ImageLinksPanel";
import ImageActivityTimeline from "./ImageActivityTimeline";
import ImageClassifySheet from "./ImageClassifySheet";
import { useImageLibrary, type LibraryImage } from "@/hooks/useImageLibrary";
import { relationLabel } from "@/lib/imageStatus";
import type { MediaKind } from "@/lib/imageStatus";

/**
 * Bilderna som hör till ett visst ställe — område, sak, produkt eller uppgift.
 * Samma bild kan höra till flera ställen; här visas de som är kopplade hit.
 */
export default function LinkedImages({
  entityType,
  entityId,
  title = "Bilder från biblioteket",
  storeId,
  zoneId,
  mediaKind,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  storeId?: string | null;
  zoneId?: string | null;
  mediaKind?: MediaKind | null;
}) {
  const { data } = useImageLibrary({ entityType, entityId }, 0);
  const images = data?.rows ?? [];
  const [detail, setDetail] = useState<LibraryImage | null>(null);
  const [editing, setEditing] = useState<LibraryImage | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">
          {title} ({images.length})
        </CardTitle>
        <AddImageFlow
          size="sm"
          label="Fota"
          storeId={storeId}
          zoneId={zoneId}
          mediaKind={mediaKind ?? null}
        />
      </CardHeader>
      <CardContent>
        {images.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga bilder är kopplade hit ännu. Fota så hamnar bilden i biblioteket.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setDetail(img)}
                className="relative overflow-hidden rounded-lg border"
              >
                <img
                  src={thumbUrl(img.url, THUMB_TILE)}
                  alt={img.title || "Bild"}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-5 text-[10px] text-white">
                  <StaffFace name={img.uploaded_by_name} className="h-4 w-4 text-[8px]" />
                  <span className="truncate">{img.title || relationLabel(null)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detail?.title || "Bild"}
              {detail?.media_kind && <Badge variant="outline">{detail.media_kind}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <img
                src={thumbUrl(detail.url, THUMB_FULL)}
                alt={detail.title || "Bild"}
                className="max-h-[50vh] w-full rounded-lg object-contain"
              />
              <ImageLinksPanel image={detail} onEdit={() => setEditing(detail)} />
              <div>
                <h3 className="mb-2 text-sm font-semibold">Historik</h3>
                <ImageActivityTimeline mediaId={detail.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImageClassifySheet
        image={editing}
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        defaultStoreId={storeId}
      />
    </Card>
  );
}
