import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  Image as ImageIcon,
  ListChecks,
  Plus,
  Tag as TagIcon,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { StatusRing } from "@/components/storemap/StatusRing";
import { MapComposer } from "@/components/storemap/MapComposer";
import { StaffName } from "@/components/staff/StaffNameAvatar";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { OverviewTaskPanel } from "@/components/storemap/OverviewTaskPanel";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { progressFor, STATUS_COLOR, STATUS_LABEL } from "@/lib/mapStatus";
import { useDeleteEntityImage, useEntityImages, useUploadEntityImage } from "@/hooks/useEntityImages";
import LinkedImages from "@/components/images/LinkedImages";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useDeviations } from "@/hooks/useFoodSafety";
import { normalizeTag, tagsOf } from "@/lib/zoneTree";
import type { MapObject, MapObjectType, MapTask, MapZone } from "@/hooks/useStoreMap";

const dt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("sv-SE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type SectionKey = "uppgifter" | "bilder" | "utrustning" | "avvikelser" | "historik";

/**
 * Ytans egen sida: kartan över just den ytan, ytorna som ligger inuti och allt
 * innehåll samlat i rubriker man hoppar mellan — ett avsnitt i taget så man
 * inte behöver skrolla långt. Data och behörigheter är samma som i resten av
 * systemet.
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
  mapSlot,
  path = [],
  childAreas = [],
  childTasks,
  onOpenZone,
  onAddChild,
  onSaveTags,
  onEditZone,
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
  /** Kartan över just den här ytan, visas högst upp på sidan. */
  mapSlot?: React.ReactNode;
  /** Vägen in: butiken → yta → underyta. Ytan själv ligger sist. */
  path?: MapZone[];
  /** Ytorna som ligger inuti den här ytan. */
  childAreas?: MapZone[];
  childTasks?: (zoneId: string) => MapTask[];
  onOpenZone?: (zoneId: string) => void;
  onAddChild?: (parentZoneId: string) => void;
  onSaveTags?: (tags: string[]) => void;
  /** Öppnar rutan där ytans namn och färg ändras. */
  onEditZone?: (zoneId: string) => void;
  onBack: () => void;
}) {
  const entityType = object ? "map_object" : "map_zone";
  const entityId = object?.id ?? zone?.id ?? "";
  const label = object?.name ?? zone?.name ?? "";
  const color = zone?.color ?? "hsl(var(--primary))";

  const upload = useUploadEntityImage();
  const deleteImage = useDeleteEntityImage();
  const { data: images = [] } = useEntityImages(entityType, entityId || null);
  const { data: logs = [] } = useActivityLogs({ storeId, limit: 300 });
  const { data: deviations = [] } = useDeviations(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [section, setSection] = useState<SectionKey>("uppgifter");
  const [tagDraft, setTagDraft] = useState("");
  const [historyLimit, setHistoryLimit] = useState(12);

  const openIssues = (deviations as { id: string; source?: string; source_id?: string; title?: string; description?: string; created_at?: string }[]).filter(
    (d) => d.source === entityType && d.source_id === entityId,
  );
  const progress = progressFor(tasks, openIssues.length);
  const tags = tagsOf(zone);

  const history = useMemo(() => {
    const rows: { at: string; who: string; text: string }[] = [];
    tasks.filter((t) => t.done && t.done_at).forEach((t) => rows.push({ at: t.done_at!, who: t.signature ?? "—", text: `✓ ${t.task}` }));
    images.forEach((i) => rows.push({ at: i.created_at, who: i.uploaded_by_name ?? "—", text: "Lade till en bild" }));
    logs
      .filter((l) => l.entity_type === entityType && l.entity_id === entityId)
      .forEach((l) => rows.push({ at: l.created_at, who: l.performed_by ?? "—", text: l.description ?? l.action_type }));
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [tasks, images, logs, entityType, entityId]);

  const addImage = async (file: File) => {
    try {
      await upload.mutateAsync({ entityType, entityId, file, imageKind: "completion" });
      toast({ title: "Bild sparad" });
    } catch (e) {
      toast({ title: "Kunde inte ladda upp", description: (e as Error).message, variant: "destructive" });
    }
  };

  const addTag = (raw: string) => {
    const t = normalizeTag(raw);
    setTagDraft("");
    if (!t || tags.includes(t)) return;
    onSaveTags?.([...tags, t]);
  };

  const sections: { key: SectionKey; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "uppgifter", label: "Uppgifter", icon: <ListChecks className="h-3.5 w-3.5" />, count: progress.total },
    { key: "bilder", label: "Bilder", icon: <ImageIcon className="h-3.5 w-3.5" />, count: images.length },
    { key: "utrustning", label: "Utrustning", icon: <Wrench className="h-3.5 w-3.5" /> },
    { key: "avvikelser", label: "Avvikelser", icon: <TriangleAlert className="h-3.5 w-3.5" />, count: openIssues.length },
    { key: "historik", label: "Historik", icon: <ChevronRight className="h-3.5 w-3.5" />, count: history.length },
  ];

  return (
    <div className="space-y-3">
      {/* Vägen in: butiken → yta → underyta. Alltid synlig, alltid tryckbar. */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Kartan
        </Button>
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {i === path.length - 1 ? (
              <span className="font-medium text-foreground">{p.name}</span>
            ) : (
              <button className="hover:underline" onClick={() => onOpenZone?.(p.id)}>
                {p.name}
              </button>
            )}
          </span>
        ))}
      </div>

      {/* Rubrikraden: namn, status och taggar — kompakt, inget skrollande */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
        style={{ borderColor: `${color}55`, background: `${color}14`, borderLeft: `6px solid ${color}` }}
      >
        {zone && (
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-bold text-primary-foreground shadow-sm"
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
            {` · ${progress.done}/${progress.total} klart`}
            {openIssues.length > 0 ? ` · ${openIssues.length} anm.` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {zone && canManage && onEditZone && (
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => onEditZone(zone.id)}>
              <Pencil className="h-4 w-4" /> Namn &amp; färg
            </Button>
          )}
          <StatusRing percent={progress.percent} status={progress.status} size={40} label={`${progress.percent}%`} />
          <Badge variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[progress.status], color: STATUS_COLOR[progress.status] }}>
            {STATUS_LABEL[progress.status]}
          </Badge>
        </div>
      </div>

      {/* Taggar på ytan — egna ord, inga fasta kategorier */}
      {zone && (
        <div className="flex flex-wrap items-center gap-1.5">
          <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {tags.length === 0 && <span className="text-[11px] text-muted-foreground">Inga taggar ännu</span>}
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              {t}
              {onSaveTags && (
                <button aria-label={`Ta bort taggen ${t}`} onClick={() => onSaveTags(tags.filter((x) => x !== t))}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {onSaveTags && (
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag(tagDraft);
                }
              }}
              placeholder="Ny tagg + Enter"
              className="h-7 w-36 text-[11px]"
            />
          )}
        </div>
      )}

      {mapSlot && <div className="overflow-hidden rounded-xl border border-border bg-card">{mapSlot}</div>}

      {/* Ytorna inuti: ett tryck går ett steg längre in */}
      {zone && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Ytor inuti ({childAreas.length})</p>
            {onAddChild && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onAddChild(zone.id)}>
                <Plus className="h-3 w-3" /> Ny yta inuti
              </Button>
            )}
          </div>
          {childAreas.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Inga ytor inuti den här ytan ännu.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {childAreas.map((c) => {
                const ct = childTasks?.(c.id) ?? [];
                const cp = progressFor(ct, 0);
                return (
                  <button
                    key={c.id}
                    onClick={() => onOpenZone?.(c.id)}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-2.5 text-left transition-shadow hover:shadow-md"
                  >
                    <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: c.color ?? "hsl(var(--primary))" }} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{c.name}</span>
                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                        {cp.done}/{cp.total} klart
                        {tagsOf(c).length > 0 ? ` · ${tagsOf(c).slice(0, 2).join(", ")}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Rubriker i stället för en lång sida: ett avsnitt i taget */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {sections.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              section === s.key ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
            }`}
          >
            {s.icon}
            {s.label}
            {s.count != null && <span className="tabular-nums opacity-80">{s.count}</span>}
          </button>
        ))}
      </div>

      {section === "uppgifter" &&
        (tasks.length === 0 ? (
          <EmptyState title="Inga uppgifter" description="Koppla uppgifter till ytan i kartan." />
        ) : (
          <OverviewTaskPanel
            storeId={storeId}
            zones={zone ? [zone] : []}
            objects={object ? [object] : []}
            tasks={tasks}
            day={""}
          />
        ))}

      {section === "bilder" && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm">Bilder på ytan ({images.length})</CardTitle>
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
                  <ImageIcon className="h-3.5 w-3.5" /> Välj bild
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
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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
                        <p className="flex min-w-0 items-center text-[10px] text-muted-foreground">
                          <StaffName name={i.uploaded_by_name} />
                        </p>
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

          {zone?.id && (
            <LinkedImages
              entityType="zone"
              entityId={zone.id}
              title="Bilder från biblioteket"
              storeId={storeId}
              zoneId={zone.id}
              mediaKind="area"
            />
          )}
        </div>
      )}

      {section === "utrustning" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Utrustning &amp; material på ytan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Sakerna och materialet som hör till ytan sköts i registret Utrustning &amp; material — där ligger
              platsen, bilderna och informationen om varje sak.
            </p>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" asChild>
              <a href="/utrustning">
                <Wrench className="h-3.5 w-3.5" /> Öppna Utrustning &amp; material
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {section === "avvikelser" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Avvikelser ({openIssues.length})</CardTitle>
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
      )}

      {section === "historik" && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historik</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {history.length === 0 && <p className="text-xs text-muted-foreground">Ingen historik ännu.</p>}
            {history.slice(0, historyLimit).map((h, i) => (
              <div key={i} className="flex items-start justify-between gap-2 border-b border-border/50 pb-1 text-[11px] last:border-0">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{h.who}</span> {h.text}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{dt(h.at)}</span>
              </div>
            ))}
            {history.length > historyLimit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setHistoryLimit((n) => n + 30)}>
                Visa fler
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
