import { useLocation, useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useImageLinks } from "@/hooks/useImageLibrary";
import { useImageStepIndex } from "@/hooks/useEntityImages";
import { useLinkTargetNames } from "@/hooks/useImagePickers";
import { linkTypeLabel, relationLabel } from "@/lib/imageStatus";
import { placeRoute } from "@/components/images/ImageLinksPanel";
import { cn } from "@/lib/utils";

/**
 * Visar tydligt var bilden kommer ifrån — uppgift, område, vara eller butik —
 * som klickbara rader. Tryck på en rad och man kommer direkt dit. Är man redan
 * där står det "Du är här" i stället för en länk som inte gör något.
 */
export default function ImageSourceLinks({
  imageId,
  className,
  onNavigate,
}: {
  imageId: string;
  className?: string;
  /** Körs innan man lämnar sidan, t.ex. för att stänga bildvisningen. */
  onNavigate?: () => void;
}) {
  const { data: links = [] } = useImageLinks(imageId);
  const { data: names = {} } = useLinkTargetNames(
    links.map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id })),
  );
  const { data: step = null } = useImageStepIndex(imageId);
  const navigate = useNavigate();
  const location = useLocation();

  if (links.length === 0) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Källa</p>
      <div className="flex min-w-0 flex-col items-stretch gap-1">
        {links.map((l) => {
          let route = placeRoute(l.entity_type, l.entity_id, imageId);
          /* Bilder som tagits i ett steg leder in i just det steget i uppgiften. */
          if (route && l.entity_type === "task" && step) {
            route += `${route.includes("?") ? "&" : "?"}steg=${step}`;
          }
          const name = names[`${l.entity_type}:${l.entity_id}`] || linkTypeLabel(l.entity_type);
          const here = !!route && route.split("?")[0] === location.pathname;
          const inner = (
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {linkTypeLabel(l.entity_type)} · {relationLabel(l.relation_type)}
                {l.entity_type === "task" && step ? ` · steg ${step}` : ""}
              </span>
              <span className="break-words text-xs font-semibold leading-snug">{name}</span>
            </span>
          );
          const base =
            "flex w-full min-w-0 items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-xs";
          if (!route || here) {
            return (
              <span key={l.id} className={cn(base, "text-muted-foreground")}>
                {inner}
                {here && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold">
                    Du är här
                  </span>
                )}
              </span>
            );
          }
          return (
            <button
              key={l.id}
              type="button"
              title={`Gå till ${name}`}
              onClick={() => {
                onNavigate?.();
                navigate(route);
              }}
              className={cn(
                base,
                "text-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary",
              )}
            >
              {inner}
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
