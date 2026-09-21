import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
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

/** Adressen till stället där bilden ligger, om det finns en sida att gå till. */
export function placeRoute(
  entityType: string,
  entityId: string,
  fromImageId?: string,
): string | null {
  const back = fromImageId ? `&frombild=${fromImageId}` : "";
  switch (entityType) {
    case "zone":
    case "map_zone":
      return `/store-map?zone=${entityId}${back}`;
    case "store":
      return `/organisation?markera=${entityId}${back}`;
    case "resource":
      return `/utrustning?markera=${entityId}${back}`;
    case "product":
      return `/products?markera=${entityId}${back}`;
    case "task":
      return `/uppgifter?markera=${entityId}${back}`;
    default:
      return null;
  }
}

/**
 * Visar vad bilden hör till och låter någon ta bort en koppling. Att ta bort
 * en koppling raderar aldrig bilden — den ligger kvar i biblioteket.
 * Trycker man på ett ställe går man dit bilden ligger.
 */
export default function ImageLinksPanel({
  image,
  onEdit,
  onNavigate,
}: {
  image: LibraryImage;
  onEdit?: () => void;
  /** Körs innan man lämnar sidan, t.ex. för att stänga bilddetaljen. */
  onNavigate?: () => void;
}) {
  const { data: links = [] } = useImageLinks(image.id);
  const { data: names = {} } = useLinkTargetNames(
    links.map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id })),
  );
  const remove = useRemoveImageLink();
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_CLASS[image.status]}>{STATUS_LABEL[image.status]}</Badge>
        <span className="text-xs text-muted-foreground">{mediaKindLabel(image.media_kind)}</span>
        {onEdit && (
          <Button size="sm" variant="outline" className="ml-auto" onClick={onEdit}>
            Kategorisera bilden
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
          {links.map((l) => {
            const route = placeRoute(l.entity_type, l.entity_id, image.id);
            const name = names[`${l.entity_type}:${l.entity_id}`] || "Okänt namn";
            return (
              <li
                key={l.id}
                className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
              >
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {linkTypeLabel(l.entity_type)}
                </span>
                {route ? (
                  <button
                    type="button"
                    onClick={() => {
                      onNavigate?.();
                      navigate(route);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-1 text-left font-medium hover:text-primary hover:underline"
                    title={`Gå till ${name}`}
                  >
                    <span className="min-w-0 truncate">{name}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  </button>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                )}
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
            );
          })}
        </ul>
        </>
      )}
    </div>
  );
}
