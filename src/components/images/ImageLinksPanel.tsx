import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { useImageLinks, useRemoveImageLink, type LibraryImage } from "@/hooks/useImageLibrary";
import { useLinkTargetNames } from "@/hooks/useImagePickers";
import {
  relationLabel,
  STATUS_CLASS,
  STATUS_LABEL,
  mediaKindLabel,
  linkTypeLabel,
} from "@/lib/imageStatus";
import { toast } from "sonner";

/**
 * Visar vad bilden hör till och låter någon ta bort en koppling. Att ta bort
 * en koppling raderar aldrig bilden — den ligger kvar i biblioteket.
 */
export default function ImageLinksPanel({
  image,
  onEdit,
}: {
  image: LibraryImage;
  onEdit?: () => void;
}) {
  const { data: links = [] } = useImageLinks(image.id);
  const { data: names = {} } = useLinkTargetNames(
    links.map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id })),
  );
  const remove = useRemoveImageLink();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_CLASS[image.status]}>{STATUS_LABEL[image.status]}</Badge>
        <span className="text-xs text-muted-foreground">{mediaKindLabel(image.media_kind)}</span>
        {onEdit && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onEdit}>
            Ändra
          </Button>
        )}
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Bilden är ännu inte kopplad till något. Tryck Ändra för att sortera den.
        </p>
      ) : (
        <>
        <h3 className="text-sm font-semibold">Ligger på dessa ställen</h3>
        <ul className="space-y-1.5">
          {links.map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
            >
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {TYPE_LABEL[l.entity_type] ?? l.entity_type}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {names[`${l.entity_type}:${l.entity_id}`] || "Okänt namn"}
              </span>
              <span className="text-xs text-muted-foreground">{relationLabel(l.relation_type)}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Ta bort kopplingen (bilden ligger kvar)"
                onClick={async () => {
                  try {
                    await remove.mutateAsync({ link: l });
                    toast.success("Kopplingen togs bort. Bilden ligger kvar i biblioteket.");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Kunde inte ta bort");
                  }
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
