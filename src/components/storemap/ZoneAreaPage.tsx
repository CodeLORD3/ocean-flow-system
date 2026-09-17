import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { ArrowLeft, Camera, CheckCircle2, Image as ImageIcon, ListChecks, TriangleAlert } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StatusRing } from "@/components/storemap/StatusRing";
import { MapComposer } from "@/components/storemap/MapComposer";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { OverviewTaskPanel } from "@/components/storemap/OverviewTaskPanel";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { dueText, progressFor, STATUS_COLOR, STATUS_LABEL } from "@/lib/mapStatus";
import { useToggleChecklistItem } from "@/hooks/useChecklist";
import { useDeleteEntityImage, useEntityImages, useUploadEntityImage } from "@/hooks/useEntityImages";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useDeviations } from "@/hooks/useFoodSafety";
import type { MapObject, MapObjectType, MapTask, MapZone } from "@/hooks/useStoreMap";

const dt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Områdets egna sida: ligger under kartan och samlar allt som hör till ytan —
 * statistik, bilder, checklistor, avvikelser och historik. Använder samma
 * data och behörigheter som resten av systemet.
 */
export function ZoneAreaPage({
  storeId,
  portal,
  zone,
  object,
  objectType,
  tasks,
  canManage,
  zoneNumber,
  areaLabel,
  onBack,
}: {
  storeId: string;
  portal: string;
  zone?: MapZone | null;
  object?: MapObject | null;
  objectType?: MapObjectType | null;
  tasks: MapTask[];
  canManage: boolean;
  zoneNumber?: number;
  areaLabel?: string | null;
  onBack: () => void;
}) {
  const entityType = object ? "map_object" : "map_zone";
  const entityId = object?.id ?? zone?.id ?? "";
  const label = object?.name ?? zone?.name ?? "";
  const color = zone?.color ?? "hsl(var(--primary))";

  const toggle = useToggleChecklistItem();
  const upload = useUploadEntityImage();
  const deleteImage = useDeleteEntityImage();
  const { data: images = [] } = useEntityImages(entityType, entityId || null);
  const { data: logs = [] } = useActivityLogs({ storeId, limit: 300 });
  const { data: deviations = [] } = useDeviations(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openIssues = (deviations as { id: string; source?: string; source_id?: string; title?: string; description?: string; created_at?: string }[]).filter(
    (d) => d.source === entityType && d.source_id === entityId,
  );
  const progress = progressFor(tasks, openIssues.length);

  const history = useMemo(() => {
    const rows: { at: string; who: string; text: string }[] = [];
    tasks.filter((t) => t.done && t.done_at).forEach((t) => rows.push({ at: t.done_at!, who: t.signature ?? "—", text: `✓ ${t.task}` }));
    images.forEach((i) => rows.push({ at: i.created_at, who: i.uploaded_by_name ?? "—", text: "Lade till en bild" }));
    logs
      .filter((l) => l.entity_type === entityType && l.entity_id === entityId)
      .forEach((l) => rows.push({ at: l.created_at, who: l.performed_by ?? "—", text: l.description ?? l.action_type }));
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [tasks, images, logs, entityType, entityId]);

  const sections = useMemo(() => {
    const m = new Map<string, MapTask[]>();
    tasks.forEach((t) => m.set(t.section ?? "Övrigt", [...(m.get(t.section ?? "Övrigt") ?? []), t]));
    return [...m.entries()];
  }, [tasks]);

  const addImage = async (file: File) => {
    try {
      await upload.mutateAsync({ entityType, entityId, file, imageKind: "completion" });
      toast({ title: "Bild sparad" });
    } catch (e) {
      toast({ title: "Kunde inte ladda upp", description: (e as Error).message, variant: "destructive" });
    }
  };

  const stat = (icon: React.ReactNode, value: string, text: string) => (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px]">{text}</span></div>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: `${color}55`, background: `${color}14`, borderLeft: `6px solid ${color}` }}
      >
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Tillbaka till kartan
        </Button>
        <div className="flex min-w-0 items-center gap-3">
          {zone && (
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold text-white shadow-sm"
              style={{ background: color }}
            >
              {zoneNumber ?? ""}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-xl font-semibold leading-tight">
              {object && <MapObjectIcon icon={objectType?.icon} className="h-4 w-4" />}
              {label}
            </h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {areaLabel ?? "Ingen yta angiven"}
              {objectType ? ` · ${objectType.name}` : ""}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusRing percent={progress.percent} status={progress.status} size={40} label={`${progress.percent}%`} />
          <Badge variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[progress.status], color: STATUS_COLOR[progress.status] }}>
            {STATUS_LABEL[progress.status]}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {stat(<ListChecks className="h-3.5 w-3.5" />, `${progress.done}/${progress.total}`, "Uppgifter klara")}
        {stat(<ImageIcon className="h-3.5 w-3.5" />, String(images.length), "Bilder")}
        {stat(<TriangleAlert className="h-3.5 w-3.5" />, String(openIssues.length), "Öppna avvikelser")}
        {stat(<CheckCircle2 className="h-3.5 w-3.5" />, dt(history[0]?.at), "Senaste händelse")}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          {tasks.length === 0 ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Checklistor och uppgifter</CardTitle>
              </CardHeader>
              <CardContent>
                <EmptyState title="Inga uppgifter" description="Koppla uppgifter till ytan i kartan." />
              </CardContent>
            </Card>
          ) : (
            <OverviewTaskPanel
              storeId={storeId}
              zones={zone ? [zone] : []}
              objects={object ? [object] : []}
              tasks={tasks}
              day={""}
            />
          )}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Bilder ({images.length})</CardTitle>
            <div className="flex items-center gap-1.5">
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
                <Camera className="h-3.5 w-3.5" /> Ta foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.currentTarget.value = "";
                    for (const f of files) await addImage(f);
                  }}
                />
              </label>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
                <ImageIcon className="h-3.5 w-3.5" /> Bibliotek
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.currentTarget.value = "";
                    for (const f of files) await addImage(f);
                  }}
                />
              </label>
            </div>
          </CardHeader>
          <CardContent>
            {images.length === 0 ? (
              <EmptyState title="Inga bilder ännu" description="Ta ett foto för att dokumentera ytan." />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                 {images.map((i, imageIndex) => (
                  <div key={i.id} className="overflow-hidden rounded-lg border border-border">
                     <button
                       type="button"
                       className="block w-full"
                       onClick={() => setLightboxIndex(imageIndex)}
                       aria-label={`Öppna bild ${imageIndex + 1} av ${images.length}`}
                     >
                       <img src={i.url} alt={i.caption ?? label} className="h-24 w-full object-cover" />
                     </button>
                    <div className="px-2 py-1">
                      <p className="truncate text-[10px] text-muted-foreground">{dt(i.created_at)}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{i.uploaded_by_name ?? "—"}</p>
                      {canManage && (
                        <button
                          className="text-[10px] text-destructive hover:underline"
                          onClick={() => deleteImage.mutate(i.id, { onSuccess: () => toast({ title: "Bilden är borttagen" }) })}
                        >
                          Ta bort
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
             <ImageLightbox
               images={images}
               index={lightboxIndex}
               onIndexChange={setLightboxIndex}
               onClose={() => setLightboxIndex(null)}
               title={label || "Bilder"}
             />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avvikelser</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openIssues.length === 0 ? (
              <p className="text-xs text-muted-foreground">Inga öppna avvikelser på ytan.</p>
            ) : (
              openIssues.map((d) => (
                <div key={d.id} className="rounded-md border border-destructive/40 p-2 text-[11px]">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-muted-foreground">{d.description}</p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{dt(d.created_at)}</p>
                </div>
              ))
            )}
            <Separator />
            <MapComposer target={{ entityType, entityId, label, storeId }} portal={portal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {history.length === 0 && <p className="text-xs text-muted-foreground">Ingen historik ännu.</p>}
            {history.slice(0, 60).map((h, i) => (
              <div key={i} className="flex items-start justify-between gap-2 border-b border-border/50 pb-1 text-[11px] last:border-0">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{h.who}</span> {h.text}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{dt(h.at)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
