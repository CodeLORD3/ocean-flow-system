import { useState } from "react";
import { AlertTriangle, CheckCircle2, History, ImageIcon, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { STATUS_COLOR } from "@/lib/mapStatus";
import type { EntityImage } from "@/hooks/useEntityImages";
import type { MapObject, MapTask, MapZone } from "@/hooks/useStoreMap";

const clock = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Uppgifter, bilder, avvikelser och historik för hela butiken — samma poster
 * som kartan visar per yta, men samlade i en läsbar lista för den valda dagen.
 */
export function MapListViews({
  view,
  zones,
  objects,
  tasks,
  deviations,
  images,
  versions,
  zoneNumbers,
  onOpenZone,
}: {
  view: string;
  zones: MapZone[];
  objects: MapObject[];
  tasks: MapTask[];
  deviations: { id: string; title?: string; description?: string; source?: string; source_id?: string | null; created_at?: string }[];
  images: EntityImage[];
  versions: { id: string; version: number; created_at: string; published_by_name: string | null }[];
  zoneNumbers: Record<string, number>;
  onOpenZone: (zoneId: string) => void;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const zoneName = (id?: string | null) => zones.find((z) => z.id === id)?.name ?? "Utan yta";
  const zoneColor = (id?: string | null) => zones.find((z) => z.id === id)?.color ?? "hsl(var(--primary))";

  const badge = (zoneId?: string | null) => (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
      style={{ background: zoneColor(zoneId) }}
    >
      {zoneId ? (zoneNumbers[zoneId] ?? "·") : "·"}
    </span>
  );

  if (view === "uppgifter") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ListChecks className="h-4 w-4 text-primary" /> Uppgifter denna dag
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {tasks.length === 0 && <EmptyState title="Inga uppgifter" description="Checklistan för dagen är tom." />}
          {tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => t.zone_id && onOpenZone(t.zone_id)}
              className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left hover:bg-muted"
            >
              {badge(t.zone_id)}
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${t.done ? "text-muted-foreground line-through" : "font-medium"}`}>{t.task}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {zoneName(t.zone_id)}
                  {objects.find((o) => o.id === t.map_object_id) ? ` · ${objects.find((o) => o.id === t.map_object_id)!.name}` : ""}
                  {t.section ? ` · ${t.section}` : ""}
                </p>
              </div>
              {t.done && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}
            </button>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (view === "bilder") {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ImageIcon className="h-4 w-4 text-primary" /> Bilder i butiken ({images.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <EmptyState title="Inga bilder ännu" description="Ta ett foto på en yta eller lägg till bilder från biblioteket." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
               {images.map((i, imageIndex) => (
                <button
                  key={i.id}
                   type="button"
                   onClick={() => setLightboxIndex(imageIndex)}
                  className="overflow-hidden rounded-xl border border-border text-left hover:border-primary"
                   aria-label={`Öppna bild ${imageIndex + 1} av ${images.length}`}
                >
                  <img src={i.url} alt={i.caption ?? zoneName(i.entity_id)} className="h-28 w-full object-cover" />
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs font-medium">{i.caption ?? zoneName(i.entity_id)}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {clock(i.created_at)} · {i.uploaded_by_name ?? "—"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
           <ImageLightbox
             images={images}
             index={lightboxIndex}
             onIndexChange={setLightboxIndex}
             onClose={() => setLightboxIndex(null)}
             title="Bilder i butiken"
             sourceLabelOf={(image) => zoneName(image.entity_id)}
           />
        </CardContent>
      </Card>
    );
  }

  if (view === "avvikelser") {
    const mine = deviations.filter(
      (d) => d.source === "map_zone" || d.source === "map_object",
    );
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4" style={{ color: STATUS_COLOR.red }} /> Avvikelser på kartan ({mine.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {mine.length === 0 && <EmptyState title="Inga avvikelser" description="Inget är anmält på någon yta just nu." />}
          {mine.map((d) => (
            <button
              key={d.id}
              onClick={() => d.source === "map_zone" && d.source_id && onOpenZone(d.source_id)}
              className="flex w-full items-start gap-3 rounded-lg border border-destructive/40 px-3 py-2 text-left hover:bg-destructive/5"
            >
              {badge(d.source === "map_zone" ? d.source_id : objects.find((o) => o.id === d.source_id)?.zone_id)}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{d.title ?? "Avvikelse"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{d.description ?? ""}</p>
                <p className="text-[10px] text-muted-foreground">{clock(d.created_at)}</p>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <History className="h-4 w-4 text-primary" /> Avklarat denna dag
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {tasks.filter((t) => t.done).length === 0 && (
            <EmptyState title="Inget avklarat ännu" description="Avbockade uppgifter hamnar här." />
          )}
          {tasks
            .filter((t) => t.done)
            .map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                {badge(t.zone_id)}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.task}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {zoneName(t.zone_id)} · {clock(t.done_at)} · {t.signature ?? "—"}
                  </p>
                </div>
              </div>
            ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Publicerade versioner av ritningen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {versions.length === 0 && <EmptyState title="Ingen version sparad" description="Publicera kartan för att spara en version." />}
          {versions.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-medium">Version {v.version}</span>
              <span className="text-[11px] text-muted-foreground">
                {clock(v.created_at)} · {v.published_by_name ?? "—"}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
