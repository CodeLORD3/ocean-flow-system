import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/EmptyState";
import { ArrowRight, Camera, CheckCircle2, Image as ImageIcon, Info, Link2, MoreVertical, Pencil, Thermometer, Trash2, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bbox, zonePoints } from "@/lib/mapGeometry";
import { toast } from "@/hooks/use-toast";
import { MapComposer } from "@/components/storemap/MapComposer";
import { StatusRing } from "@/components/storemap/StatusRing";
import { MapObjectIcon } from "@/components/storemap/MapObjectIcon";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { dueText, progressFor, STATUS_COLOR, STATUS_LABEL } from "@/lib/mapStatus";
import { useToggleChecklistItem } from "@/hooks/useChecklist";
import {
  useDeleteEntityImage,
  useEntityImages,
  useSetImagePosition,
  useUpdateEntityImage,
  useUploadEntityImage,
} from "@/hooks/useEntityImages";
import { useActivityLogs } from "@/hooks/useActivityLog";
import { useDeviations } from "@/hooks/useFoodSafety";
import { useStaff } from "@/hooks/useStaff";
import { useLinkTaskToMap, type MapObject, type MapObjectType, type MapTask, type MapZone } from "@/hooks/useStoreMap";

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "";

/** Idag, Igår eller datum — samma språk som resten av systemet. */
const dayText = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today.getTime() - 86400000);
  if (same(d, today)) return "Idag";
  if (same(d, yesterday)) return "Igår";
  return d.toLocaleDateString("sv-SE");
};

function ActorAvatar({ name, url }: { name: string; url?: string | null }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <Avatar className="h-5 w-5">
      {url && <AvatarImage src={url} />}
      <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}

export function MapDetailDrawer({
  open,
  onOpenChange,
  storeId,
  portal,
  zone,
  object,
  objectType,
  tasks,
  unlinkedTasks,
  canManage,
  zoneNumber,
  areaLabel,
  inline = false,
  onOpenPage,
  onEditZone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  portal: string;
  zone?: MapZone | null;
  object?: MapObject | null;
  objectType?: MapObjectType | null;
  tasks: MapTask[];
  unlinkedTasks: MapTask[];
  canManage: boolean;
  /** Nummerbrickan som ytan har i kartan och i förteckningen. */
  zoneNumber?: number;
  /** Ytans storlek i kvadratmeter, färdigformaterad. */
  areaLabel?: string | null;
  /** Panelläge: visas som egen kolumn till höger istället för som överlägg. */
  inline?: boolean;
  /** Öppnar områdets egna sida under kartan. */
  onOpenPage?: () => void;
  /** Öppnar panelen där området beskrivs och redigeras. */
  onEditZone?: () => void;
}) {
  const entityType = object ? "map_object" : "map_zone";
  const entityId = object?.id ?? zone?.id ?? "";
  const label = object?.name ?? zone?.name ?? "";

  const toggle = useToggleChecklistItem();
  const link = useLinkTaskToMap();
  const upload = useUploadEntityImage();
  const deleteImage = useDeleteEntityImage();
  const updateImage = useUpdateEntityImage();
  const setPosition = useSetImagePosition();
  const { data: images = [] } = useEntityImages(entityType, entityId || null);
  const { data: logs = [] } = useActivityLogs({ storeId, limit: 300 });
  const { data: deviations = [] } = useDeviations(false);
  const { data: staff = [] } = useStaff(storeId);
  const [tab, setTab] = useState("summary");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openIssues = deviations.filter(
    (d) => (d as { source?: string; source_id?: string }).source === entityType && (d as { source_id?: string }).source_id === entityId,
  );
  const progress = progressFor(tasks, openIssues.length);

  const avatarByName = useMemo(() => {
    const m: Record<string, string> = {};
    (staff as { first_name: string; last_name: string; profile_image_url: string | null }[]).forEach((s) => {
      if (s.profile_image_url) m[`${s.first_name} ${s.last_name}`.toLowerCase()] = s.profile_image_url;
    });
    return m;
  }, [staff]);

  const initialsToName = useMemo(() => {
    const m: Record<string, string> = {};
    (staff as { first_name: string; last_name: string }[]).forEach((s) => {
      const key = `${(s.first_name || "")[0] ?? ""}${(s.last_name || "")[0] ?? ""}`.toUpperCase();
      if (key.trim()) m[key] = `${s.first_name} ${s.last_name}`;
    });
    return m;
  }, [staff]);

  const actorName = (sig?: string | null) => (sig ? (initialsToName[sig.toUpperCase()] ?? sig) : "—");

  /** Aktivitetsflödet aggregerar befintliga händelser — inget dupliceras. */
  const activity = useMemo(() => {
    const rows: { at: string; who: string; text: string; kind: string }[] = [];
    tasks
      .filter((t) => t.done && t.done_at)
      .forEach((t) => rows.push({ at: t.done_at!, who: actorName(t.signature), text: `✓ ${t.task}`, kind: "task" }));
    images.forEach((i) =>
      rows.push({ at: i.created_at, who: i.uploaded_by_name || "—", text: "Lade till en bild", kind: "photo" }),
    );
    logs
      .filter((l) => l.entity_type === entityType && l.entity_id === entityId)
      .forEach((l) =>
        rows.push({
          at: l.created_at,
          who: l.performed_by || "—",
          text: l.action_type === "comment" ? `"${l.description}"` : `${l.action_type === "note" ? "Anmärkning" : "Avvikelse"}: ${l.description}`,
          kind: l.action_type,
        }),
      );
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  }, [tasks, images, logs, entityType, entityId, initialsToName]);

  const activePeople = useMemo(() => {
    const names = new Set<string>();
    tasks.filter((t) => t.done).forEach((t) => names.add(actorName(t.signature)));
    images.forEach((i) => i.uploaded_by_name && names.add(i.uploaded_by_name));
    return [...names].filter((n) => n && n !== "—").slice(0, 6);
  }, [tasks, images, initialsToName]);

  const standard = images.filter((i) => (i as { image_kind?: string }).image_kind === "standard");
  const latest = images.filter((i) => (i as { image_kind?: string }).image_kind !== "standard");

  const addImage = async (file: File, kind: string) => {
    try {
      await upload.mutateAsync({ entityType, entityId, file, imageKind: kind });
      toast({ title: kind === "standard" ? "Standardbild sparad" : "Bild sparad" });
    } catch (e) {
      toast({ title: "Kunde inte ladda upp", description: (e as Error).message, variant: "destructive" });
    }
  };

  /** Högerpil på tangentbordet flyttar fokus till Gå vidare och tänder knappen. */
  const goRef = useRef<HTMLButtonElement | null>(null);
  const [goLit, setGoLit] = useState(false);
  useEffect(() => {
    if (!onOpenPage) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (typing) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        setGoLit(true);
        goRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenPage]);
  useEffect(() => {
    setGoLit(false);
  }, [entityId]);

  const head = (
    <div className="space-y-3">
          {/* pr-10: håller avstånd till panelens stängkryss uppe till höger */}
          <div className="flex items-center gap-3 pr-10">
            {zone && (
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-bold text-white shadow-sm"
                style={{ background: zone.color ?? "hsl(var(--primary))" }}
              >
                {zoneNumber ?? ""}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-xl font-semibold leading-tight">
                {object && <MapObjectIcon icon={objectType?.icon} className="h-4 w-4" />}
                {label}
              </h2>
              {areaLabel && <p className="text-sm text-muted-foreground tabular-nums">{areaLabel}</p>}
              {zone?.zone_kind && (
                <Badge variant="outline" className="mt-1 text-[10px]">{zone.zone_kind}</Badge>
              )}
            </div>
            {onOpenPage && (
              <Button
                ref={goRef}
                size="sm"
                autoFocus
                title="Tryck högerpil och sedan Enter för att gå vidare"
                className={`ml-auto h-8 shrink-0 gap-1 text-xs text-white ring-offset-2 transition hover:opacity-90 focus-visible:ring-2 ${
                  goLit ? "scale-105 animate-pulse ring-2 ring-offset-2" : ""
                }`}
                style={
                  zone?.color
                    ? {
                        background: zone.color,
                        boxShadow: goLit ? `0 0 0 4px ${zone.color}55` : undefined,
                      }
                    : undefined
                }
                onClick={onOpenPage}
              >
                Gå vidare <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          {zone?.description && (
            <p className="whitespace-pre-line rounded-lg bg-muted/60 px-3 py-2 text-sm">{zone.description}</p>
          )}
          {zone && canManage && onEditZone && (
            <Button variant="outline" className="h-10 w-full gap-2 text-sm font-semibold" onClick={onEditZone}>
              <Pencil className="h-4 w-4" /> Redigera området
            </Button>
          )}
          <div className="flex items-center gap-3">
            <StatusRing percent={progress.percent} status={progress.status} size={40} label={`${progress.percent}%`} />
            <div className="space-y-1">
              <Badge variant="outline" className="text-[10px]" style={{ borderColor: STATUS_COLOR[progress.status], color: STATUS_COLOR[progress.status] }}>
                {STATUS_LABEL[progress.status]}
              </Badge>
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {progress.done} / {progress.total} uppgifter
                {progress.openIssues > 0 && ` · ${progress.openIssues} anmärkning`}
              </p>
            </div>
            <div className="flex -space-x-1 ml-auto">
              {activePeople.map((n) => (
                <ActorAvatar key={n} name={n} url={avatarByName[n.toLowerCase()]} />
              ))}
            </div>
          </div>
    </div>
  );


  const body = (
    <>
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1">
            <TabsTrigger value="summary" className="h-7 rounded-md px-3 text-xs">Översikt</TabsTrigger>
            <TabsTrigger value="images" className="h-7 rounded-md px-3 text-xs">Bilder</TabsTrigger>
            <TabsTrigger value="tasks" className="h-7 rounded-md px-3 text-xs">Uppgifter</TabsTrigger>
            <TabsTrigger value="overview" className="h-7 rounded-md px-3 text-xs">Info</TabsTrigger>
            <TabsTrigger value="activity" className="h-7 rounded-md px-3 text-xs">Historik</TabsTrigger>
            <TabsTrigger value="standard" className="h-7 rounded-md px-3 text-xs">Standard</TabsTrigger>
          </TabsList>

          {/* Snabb överblick: statistik, senaste bilderna och det som hänt */}
          <TabsContent value="summary" className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-2">
              {[
                [`${progress.done}/${progress.total}`, "Uppgifter klara"],
                [String(latest.length), "Bilder"],
                [String(openIssues.length), "Öppna anmärkningar"],
                [areaLabel ?? "—", "Yta"],
              ].map(([v, t]) => (
                <div key={t} className="rounded-lg border border-border p-2">
                  <p className="text-[10px] text-muted-foreground">{t}</p>
                  <p className="text-sm font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            {latest.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                 {latest.slice(0, 3).map((i, imageIndex) => (
                   <button
                     key={i.id}
                     type="button"
                     onClick={() => setLightboxIndex(imageIndex)}
                     aria-label={`Öppna bild ${imageIndex + 1} av ${latest.length}`}
                   >
                     <img src={i.url} alt={i.caption ?? label} className="h-16 w-full rounded-md object-cover" />
                   </button>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">Senast gjort här</p>
              {activity.length === 0 && <p className="text-[11px] text-muted-foreground">Inget har hänt ännu.</p>}
              {activity.slice(0, 6).map((a, i) => (
                <div key={i} className="flex items-start justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{a.who}</span> {a.text}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                    {dayText(a.at)} {time(a.at)}
                  </span>
                </div>
              ))}
            </div>

            {tasks.some((t) => !t.done) && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground">Kvar att göra</p>
                {tasks
                  .filter((t) => !t.done)
                  .slice(0, 5)
                  .map((t) => (
                    <p key={t.id} className="truncate text-[11px]">• {t.task}</p>
                  ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="overview" className="space-y-3 pt-3">
            {object && objectType && (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-md border border-border p-2">
                  <p className="text-muted-foreground">Typ</p>
                  <p className="font-medium">{objectType.name}</p>
                </div>
                <div className="rounded-md border border-border p-2">
                  <p className="text-muted-foreground">Kategori</p>
                  <p className="font-medium">{objectType.category}</p>
                </div>
                {objectType.supports_temperature && (
                  <div className="rounded-md border border-border p-2 col-span-2 flex items-center gap-2">
                    <Thermometer className="h-3.5 w-3.5 text-primary" />
                    <span className="text-muted-foreground">
                      {object.control_point_id ? "Kopplad till egenkontrollens mätpunkt" : "Ingen mätpunkt kopplad ännu"}
                    </span>
                  </div>
                )}
              </div>
            )}
            {openIssues.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-destructive">Öppna anmärkningar</p>
                {openIssues.map((d) => (
                  <div key={(d as { id: string }).id} className="rounded-md border border-destructive/40 p-2 text-[11px]">
                    <p className="font-medium">{(d as { title?: string }).title}</p>
                    <p className="text-muted-foreground">{(d as { description?: string }).description}</p>
                  </div>
                ))}
              </div>
            )}
            <Separator />
            <MapComposer target={{ entityType, entityId, label, storeId }} portal={portal} />
          </TabsContent>

          <TabsContent value="tasks" className="space-y-2 pt-3">
            {tasks.length === 0 && (
              <EmptyState title="Inga uppgifter kopplade" description="Koppla en uppgift ur checklistan nedan." />
            )}
            {tasks.map((t) => (
              <label key={t.id} className="flex items-start gap-2 rounded-md border border-border p-2 cursor-pointer">
                <Checkbox
                  checked={t.done}
                  onCheckedChange={(v) => toggle.mutate({ id: t.id, done: !!v })}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs ${t.done ? "line-through text-muted-foreground" : "font-medium"}`}>{t.task}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.done ? `${actorName(t.signature)} · ${time(t.done_at)}` : (dueText(t.time_label, t.done) ?? t.section)}
                  </p>
                </div>
                {t.done && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
              </label>
            ))}

            {canManage && unlinkedTasks.length > 0 && (
              <div className="pt-2 space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Koppla uppgift hit
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {unlinkedTasks.slice(0, 40).map((t) => (
                    <button
                      key={t.id}
                      className="w-full text-left text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted"
                      onClick={() =>
                        link.mutate(
                          object
                            ? { itemId: t.id, mapObjectId: object.id, zoneId: object.zone_id }
                            : { itemId: t.id, zoneId: zone!.id },
                        )
                      }
                    >
                      {t.task}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-2 pt-3">
            {activity.length === 0 && <EmptyState title="Ingen aktivitet idag" description="Händelser visas här när något görs." />}
            {activity.map((a, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <ActorAvatar name={a.who} url={avatarByName[a.who.toLowerCase()]} />
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{a.who}</span> {a.text}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">{time(a.at)}</p>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="images" className="space-y-4 pt-4">
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15">
                <Info className="h-3 w-3 text-primary" />
              </span>
              <span>Välj en bild och tryck sedan på platsen i kartan för att lägga den på en exakt plats i butiken.</span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                Bilder på denna yta {latest.length > 0 && <span className="text-muted-foreground">({latest.length})</span>}
              </p>
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
                      for (const f of files) await addImage(f, "completion");
                    }}
                  />
                </label>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted">
                  <ImageIcon className="h-3.5 w-3.5" /> Från bibliotek
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.currentTarget.value = "";
                      for (const f of files) await addImage(f, "completion");
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
               {latest.map((i, imageIndex) => (
                <div key={i.id} className="overflow-hidden rounded-xl border border-border">
                   <button
                     type="button"
                     className="block w-full"
                     onClick={() => setLightboxIndex(imageIndex)}
                     aria-label={`Öppna bild ${imageIndex + 1} av ${latest.length}`}
                   >
                     <img src={i.url} alt={i.caption ?? label} className="h-28 w-full object-cover" />
                   </button>
                  <div className="flex items-start gap-1 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{i.caption ?? label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {dayText(i.created_at)} {time(i.created_at)} · {i.uploaded_by_name ?? "—"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fler val">
                          <MoreVertical className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        {i.norm_x != null && (
                          <DropdownMenuItem
                            onClick={() =>
                              setPosition.mutate({
                                id: i.id,
                                entityType,
                                entityId,
                                floorPlanId: i.floor_plan_id ?? "",
                                norm: null,
                              })
                            }
                          >
                            Ta bort platsen i kartan
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => updateImage.mutate({ id: i.id, caption: label })}>
                          Döp om till ytans namn
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteImage.mutate(i.id, { onSuccess: () => toast({ title: "Bilden är borttagen" }) })}
                        >
                          Ta bort bilden
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
            {latest.length === 0 && <EmptyState title="Inga bilder ännu" description="Ta ett foto för att dokumentera." />}
             <ImageLightbox
               images={latest}
               index={lightboxIndex}
               onIndexChange={setLightboxIndex}
               onClose={() => setLightboxIndex(null)}
               title={label || "Bilder"}
             />

            {zone && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Placering på ytan</p>
                <div className="rounded-xl border border-border p-3">
                  <svg viewBox="0 0 100 62" className="h-auto w-full">
                    {(() => {
                      const pts = zonePoints(zone);
                      const b = bbox(pts);
                      const norm = pts
                        .map((p) => `${((p.x - b.x) / (b.width || 1)) * 96 + 2},${((p.y - b.y) / (b.height || 1)) * 58 + 2}`)
                        .join(" ");
                      return (
                        <polygon
                          points={norm}
                          fill={zone.color ?? "hsl(var(--primary))"}
                          fillOpacity={0.35}
                          stroke={zone.color ?? "hsl(var(--primary))"}
                          strokeWidth={1}
                        />
                      );
                    })()}
                    {images
                      .filter((i) => i.norm_x != null && i.norm_y != null)
                      .map((i) => (
                        <circle
                          key={i.id}
                          cx={(i.norm_x as number) * 96 + 2}
                          cy={(i.norm_y as number) * 58 + 2}
                          r={1.8}
                          fill={zone.color ?? "hsl(var(--primary))"}
                        />
                      ))}
                  </svg>
                </div>
              </div>
            )}

            {latest.length > 0 && canManage && (
              <Button
                variant="outline"
                className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive/5"
                onClick={() => {
                  latest.forEach((i) => deleteImage.mutate(i.id));
                  toast({ title: `${latest.length} bilder togs bort från ${label}` });
                }}
              >
                <Trash2 className="h-4 w-4" /> Ta bort alla bilder från denna yta
              </Button>
            )}
          </TabsContent>

          <TabsContent value="standard" className="space-y-2 pt-3">
            <p className="text-[11px] text-muted-foreground">Så här ska det se ut.</p>
            {canManage && (
              <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer rounded-md border border-border px-2 py-1">
                <Camera className="h-3.5 w-3.5" /> Sätt standardbild
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && addImage(e.target.files[0], "standard")}
                />
              </label>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-semibold mb-1">STANDARD</p>
                {standard[0] ? (
                  <img src={standard[0].url} alt="Standard" className="w-full h-28 object-cover rounded-md" />
                ) : (
                  <div className="h-28 rounded-md border border-dashed border-border grid place-items-center text-[10px] text-muted-foreground">
                    Ingen standardbild
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-semibold mb-1">SENASTE</p>
                {latest[0] ? (
                  <>
                    <img src={latest[0].url} alt="Senaste" className="w-full h-28 object-cover rounded-md" />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {latest[0].uploaded_by_name} · {time(latest[0].created_at)}
                    </p>
                  </>
                ) : (
                  <div className="h-28 rounded-md border border-dashed border-border grid place-items-center text-[10px] text-muted-foreground">
                    Ingen bild ännu
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-[11px]"
          onClick={() => {
            const next = tasks.find((t) => !t.done);
            if (!next) return toast({ title: "Allt är redan klart här" });
            toggle.mutate({ id: next.id, done: true });
          }}
        >
          ✓ Åtgärd klar
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => setTab("overview")}>
          Kommentar
        </Button>
      </div>
    </>
  );

  /* Panelläge: ligger som egen kolumn till höger, kartan syns hela tiden. */
  if (inline) {
    return (
      <div className="max-h-[78vh] overflow-y-auto rounded-xl border border-border bg-card p-4">
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)} title="Stäng">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {head}
        {body}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="sr-only">{label}</SheetTitle>
          {head}
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
