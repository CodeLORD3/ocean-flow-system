import { useNavigate } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { useImageLinks } from "@/hooks/useImageLibrary";
import { useLinkTargetNames } from "@/hooks/useImagePickers";
import { linkTypeLabel, relationLabel } from "@/lib/imageStatus";
import { placeRoute } from "@/components/images/ImageLinksPanel";
import { cn } from "@/lib/utils";

/**
 * Visar tydligt var bilden kommer ifrån — uppgift, område, vara eller butik —
 * som klickbara chips. Tryck på en chip och man kommer direkt dit.
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
  const navigate = useNavigate();

  if (links.length === 0) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Källa</p>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => {
          const route = placeRoute(l.entity_type, l.entity_id, imageId);
          const name = names[`${l.entity_type}:${l.entity_id}`] || linkTypeLabel(l.entity_type);
          const inner = (
            <>
              <span className="text-[10px] uppercase tracking-wide opacity-70">
                {linkTypeLabel(l.entity_type)}
              </span>
              <span className="min-w-0 max-w-[16rem] truncate font-medium">{name}</span>
              <span className="text-[10px] opacity-60">{relationLabel(l.relation_type)}</span>
            </>
          );
          const base =
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs bg-card";
          if (!route) {
            return (
              <span key={l.id} className={cn(base, "text-muted-foreground")}>
                {inner}
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
