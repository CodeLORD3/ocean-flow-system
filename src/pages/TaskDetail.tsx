import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  Check,
  Clock,
  Image as ImageIcon,
  MapPin,
  Search,
  Timer,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTabs } from "@/contexts/TabsContext";
import { useStaff } from "@/hooks/useStaff";
import { useFloorPlans, useMapZones } from "@/hooks/useStoreMap";
import { useUploadEntityImage, type EntityImage } from "@/hooks/useEntityImages";
import { ImageLightbox } from "@/components/images/ImageLightbox";
import { ImageArchivePicker } from "@/components/images/ImageArchivePicker";
import { useAttachArchiveImages } from "@/hooks/useImageArchive";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { missingRequirements, missingText, valueLabel } from "@/lib/taskRequirements";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { dayBadgeClass } from "@/lib/dayColor";
import {
  useDeleteTask,
  useSaveTaskGuide,
  useSetTaskDone,
  useTaskHistory,
  useTaskCategories,
  useTaskImages,
  useTaskItem,
  useTaskReferenceImages,
  useUpdateTask,
} from "@/hooks/useTasks";
import { TaskGuideEditor } from "@/components/tasks/TaskGuideEditor";
import { TaskGuideView } from "@/components/tasks/TaskGuideView";
import { TaskIssueDialog } from "@/components/tasks/TaskIssueDialog";
import { parseGuide } from "@/lib/taskGuide";
import { DAYPARTS, durationText, taskTime } from "@/lib/taskTime";
import { workTypeLabel } from "@/lib/workType";
import { TASK_LINKS, taskTarget } from "@/lib/taskLink";
import { useProductionRecipes } from "@/hooks/useProductionRecipes";
import { TaskPerformPanel } from "@/components/tasks/TaskPerformPanel";
import { useTaskCheckpoints } from "@/hooks/useTaskRun";
import { useTaskRoute } from "@/hooks/useTaskRoute";
import { useFreezeRoute } from "@/hooks/useStandardRoute";
import { standardParts } from "@/lib/taskStandardTime";
import { TaskPlanningPanel } from "@/components/tasks/TaskPlanningPanel";
import { CheckpointEditor, RequirementEditor, StandardTimeEditor } from "@/components/tasks/TaskSetupPanels";
import { TaskRecurrencePanel } from "@/components/tasks/TaskRecurrencePanel";
import { useStandardWeekdays } from "@/hooks/useTasks";
import {
  resolveNeeds,
  useResourceItems,
  useResourceLocations,
  useStoreResourceMappings,
  useTaskRequirements,
} from "@/hooks/useResources";

/** En uppgifts egen sida: allt om just den här uppgiften, samma rad som i listan. */
export default function TaskDetail({ taskId }: { taskId: string }) {
  const { switchTab } = useTabs();
  const { data, isLoading } = useTaskItem(taskId);
  const task = data?.task;
  const storeId = data?.storeId ?? null;

  const { data: plans = [] } = useFloorPlans(storeId);
  const plan = plans[0] ?? null;
  const { data: zones = [] } = useMapZones(plan?.id ?? null);
  const { data: staffList = [] } = useStaff(storeId || undefined);
  const { data: images = [] } = useTaskImages(taskId);
  const { data: reference = [] } = useTaskReferenceImages(task?.template_item_id ?? null);
  const { data: history = [] } = useTaskHistory(storeId, task?.task ?? null);
  const setDone = useSetTaskDone();
  const update = useUpdateTask();
  const removeTask = useDeleteTask();
  const upload = useUploadEntityImage();

  const { data: itemWeekdays = [] } = useStandardWeekdays(task?.template_item_id ?? null);

  const [note, setNote] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const attachArchive = useAttachArchiveImages();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [openOccurrence, setOpenOccurrence] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [important, setImportant] = useState<string | null>(null);
  const { data: categories = [] } = useTaskCategories(storeId);
  const { data: recipes = [] } = useProductionRecipes();
  const saveGuide = useSaveTaskGuide();
  const guide = useMemo(() => parseGuide(task?.guide, task?.instructions ?? null), [task?.guide, task?.instructions]);

  /** Vad arbetet kräver → butikens sak → var den finns. Platsen bor i registret. */
  const { data: requirements = [] } = useTaskRequirements(task?.template_item_id ?? null, taskId);
  const { data: resourceItems = [] } = useResourceItems();
  const { data: resourceLocations = [] } = useResourceLocations(storeId);
  const { data: resourceMappings = [] } = useStoreResourceMappings(storeId);
  const needs = useMemo(
    () => resolveNeeds(requirements, resourceMappings, resourceItems, resourceLocations),
    [requirements, resourceMappings, resourceItems, resourceLocations],
  );

  const area = useMemo(() => {
    const sorted = [...zones].sort((a, b) => a.sort_order - b.sort_order);
    const i = sorted.findIndex((z) => z.id === task?.zone_id);
    if (i < 0) return null;
    const z = sorted[i];
    return { id: z.id, name: z.name, color: z.color ?? "hsl(var(--primary))", number: i + 1 };
  }, [zones, task?.zone_id]);

  /** Ytorna som kan väljas som plats för redskap i beskrivningen. */
  const guideZones = useMemo(
    () =>
      [...zones]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((z, i) => ({ id: z.id, name: z.name, number: i + 1 })),
    [zones],
  );

  /** Arbetsvägen som gäller — används för kartlänk och för att frysa historiken. */
  const { data: runCheckpoints = [] } = useTaskCheckpoints(task?.template_item_id ?? null);
  const parts = standardParts(task);
  const { route, usingStandard, standard } = useTaskRoute({
    storeId,
    templateItemId: task?.template_item_id ?? null,
    area: area ? { id: area.id, name: `${area.number}. ${area.name}` } : null,
    taskName: task?.task ?? "",
    needs,
    checkpoints: runCheckpoints.map((c) => c.label),
    minutes: { do: parts.doWork, check: parts.check },
  });
  const routeZoneIds = route.stops.map((s) => s.zoneId).filter((z): z is string => !!z);
  const routeUrl = `/butikskarta?route=${routeZoneIds.join(",")}${task ? `&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}` : ""}`;
  const freeze = useFreezeRoute();
  const freezeCurrentRoute = () => {
    if (!task || route.stops.length === 0) return;
    freeze.mutate({
      checklistItemId: task.id,
      templateItemId: task.template_item_id ?? null,
      storeId,
      route,
      source: usingStandard ? "standard" : "calculated",
      version: standard?.version ?? null,
    });
  };

  const [issueOpen, setIssueOpen] = useState(false);
  const [issuePreset, setIssuePreset] = useState<string | null>(null);

  const staffName = (id: string | null | undefined) => {
    const s = staffList.find((p) => p.id === id);
    return s ? `${s.first_name} ${s.last_name}` : null;
  };
  const staffImage = (id: string | null | undefined) =>
    staffList.find((p) => p.id === id)?.profile_image_url ?? null;

  const allImages: EntityImage[] = useMemo(
    () => [...images, ...history.flatMap((h) => h.images)].filter((img, i, arr) => arr.findIndex((x) => x.id === img.id) === i),
    [images, history],
  );

  /** Alla som gjort uppgiften, med hur många gånger var. */
  const doers = useMemo(() => {
    const map = new Map<string, { key: string; name: string; image: string | null; times: number }>();
    history
      .filter((h) => h.done)
      .forEach((h) => {
        const name = staffName(h.completed_by_staff_id) ?? h.signature ?? null;
        if (!name) return;
        const key = h.completed_by_staff_id ?? `sig:${name}`;
        const prev = map.get(key);
        if (prev) prev.times += 1;
        else
          map.set(key, {
            key,
            name,
            image: staffImage(h.completed_by_staff_id) ?? null,
            times: 1,
          });
      });
    return [...map.values()].sort((a, b) => b.times - a.times);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, staffList]);

  const doneRatio = history.length > 0 ? Math.round((history.filter((h) => h.done).length / history.length) * 100) : null;

  if (isLoading) return <p className="text-muted-foreground">Laddar…</p>;
  if (!task) return <p className="text-muted-foreground">Uppgiften finns inte längre.</p>;

  const time = taskTime(task);
  const target = taskTarget(task, recipes.find((r) => r.id === task.recipe_id)?.name ?? null);
  const missing = missingRequirements(task, { photoCount: images.length, checkPhoto: true });


  const addPhoto = async (file: File) => {
    if (!task.zone_id) {
      toast({
        title: "Uppgiften saknar område",
        description: "Koppla uppgiften till ett område på butikskartan, så hamnar bilden rätt.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upload.mutateAsync({
        entityType: "map_zone",
        entityId: task.zone_id,
        file,
        imageKind: "completion",
        floorPlanId: plan?.id ?? null,
        checklistItemId: task.id,
      });
      toast({ title: "Bild sparad på uppgiften" });
    } catch (e: any) {
      toast({ title: "Kunde inte spara bilden", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => switchTab("/uppgifter")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Uppgifter
        </Button>
        {data?.date && <span className="text-xs text-muted-foreground">{data.date}</span>}
        {data?.listName && <span className="text-xs text-muted-foreground">· {data.listName}</span>}
      </div>

      <Card className="space-y-3 p-4" style={{ borderLeft: `4px solid ${area?.color ?? "hsl(var(--primary))"}` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Uppgift
            </p>
            <h1 className="font-heading text-2xl font-bold leading-tight">{task.task}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {time.label && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {time.label}
                </span>
              )}
              {task.estimated_minutes ? (
                <span className="inline-flex items-center gap-1">
                  <Timer className="h-3 w-3" /> {durationText(task.estimated_minutes)}
                </span>
              ) : null}
              {area && (
                <button
                  type="button"
                  onClick={() =>
                    switchTab(
                      task.zone_id
                        ? `/butikskarta?zone=${task.zone_id}&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}`
                        : "/butikskarta",
                    )
                  }
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <MapPin className="h-3 w-3" /> {area.number}. {area.name}
                </button>
              )}
              {task.work_type && <span>{workTypeLabel(task.work_type)}</span>}
              {staffName(task.assigned_staff_id) && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" /> {staffName(task.assigned_staff_id)}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {target && (
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => switchTab(target.url)}>
                <ArrowUpRight className="mr-1 h-3.5 w-3.5" /> {target.label}
              </Button>
            )}
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.currentTarget.value = "";
                  for (const f of files) await addPhoto(f);
                }}
              />
              <span className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                <Camera className="h-3.5 w-3.5" /> Ta bild
              </span>
            </label>
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.currentTarget.value = "";
                  for (const f of files) await addPhoto(f);
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                <ImageIcon className="h-4 w-4" /> Bibliotek
              </span>
            </label>
            <Button variant="outline" size="lg" onClick={() => setArchiveOpen(true)}>
              <Search className="mr-1 h-4 w-4" /> Sök i arkiv
            </Button>
          </div>
        </div>
        {(task.requires_note || task.requires_value) && (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Fyll i innan du bockar av</p>
            {task.requires_value && (
              <div className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">{valueLabel(task)}</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  defaultValue={task.completion_value ?? ""}
                  onBlur={(e) =>
                    update.mutate({ id: task.id, completion_value: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </div>
            )}
            {task.requires_note && (
              <div className="flex items-center gap-2">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">Kommentar</span>
                <Input
                  defaultValue={task.completion_note ?? ""}
                  onBlur={(e) => update.mutate({ id: task.id, completion_note: e.target.value.trim() || null })}
                />
              </div>
            )}
            {missing.length > 0 && <p className="text-xs text-amber-700">{missingText(task, missing)}</p>}
          </div>
        )}
        {task.done && (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            {(staffName(task.completed_by_staff_id) || task.signature) && (
              <StaffAvatar
                name={staffName(task.completed_by_staff_id) ?? task.signature}
                imageUrl={staffImage(task.completed_by_staff_id)}
                className="h-12 w-12"
              />
            )}
            <span>
              Klar {task.done_at ? new Date(task.done_at).toLocaleString("sv-SE") : ""}
              {staffName(task.completed_by_staff_id)
                ? ` av ${staffName(task.completed_by_staff_id)}`
                : task.signature
                  ? ` (${task.signature})`
                  : ""}
            </span>
          </div>
        )}
      </Card>

      <Tabs defaultValue="genomfor">
        <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:flex sm:w-auto">
          <TabsTrigger value="genomfor">Genomför</TabsTrigger>
          <TabsTrigger value="instruktion">Hur gör vi?</TabsTrigger>
          <TabsTrigger value="planering">Planering</TabsTrigger>
          <TabsTrigger value="bilder">Bilder</TabsTrigger>
          <TabsTrigger value="historik">Historik</TabsTrigger>
          <TabsTrigger value="inst">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="genomfor">
          <TaskPerformPanel
            task={task}
            timeLabel={time.label}
            areaName={area ? `${area.number}. ${area.name}` : null}
            photoCount={images.length}
            needs={needs}
            onShowOnMap={(zoneId) =>
              switchTab(`/butikskarta?zone=${zoneId}&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}`)
            }
            onShowAllOnMap={() => switchTab(routeUrl)}
            onStarted={freezeCurrentRoute}
            onUpdate={(patch) => update.mutate({ id: task.id, ...patch })}
            onAddPhoto={addPhoto}
            onReopen={() => setDone.mutate({ id: task.id, done: false })}
          />
        </TabsContent>

        <TabsContent value="planering">
          <TaskPlanningPanel
            task={task}
            storeId={storeId}
            area={area ? { id: area.id, name: `${area.number}. ${area.name}` } : null}
            needs={needs}
            zoneName={(zoneId) => guideZones.find((z) => z.id === zoneId)?.name ?? null}
            onShowOnMap={(zoneId) =>
              switchTab(`/butikskarta?zone=${zoneId}&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}`)
            }
            onShowRoute={(zoneIds) =>
              switchTab(
                `/butikskarta?route=${zoneIds.join(",")}&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}`,
              )
            }
          />
        </TabsContent>

        <TabsContent value="instruktion" className="space-y-3">
          {task.important_note && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{task.important_note}</p>
          )}
          {guide.goal || guide.materials.length > 0 || guide.steps.length > 0 || guide.putBack ? (
            <TaskGuideView
              guide={guide}
              zones={guideZones}
              onShowOnMap={(zoneId) =>
                switchTab(`/butikskarta?zone=${zoneId}&fromTask=${task.id}&taskName=${encodeURIComponent(task.task)}`)
              }
              onReport={(name) => {
                setIssuePreset(name ?? null);
                setIssueOpen(true);
              }}
            />
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Ingen beskrivning finns ännu. Lägg in godkänt läge, redskap med plats på kartan, steg och återställning
                under Inställningar.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setIssuePreset(null);
                  setIssueOpen(true);
                }}
              >
                Rapportera trasigt eller slut
              </Button>
            </div>
          )}
          {reference.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">Så här ska det se ut</h3>
              <div className="flex flex-wrap gap-2">
                {reference.map((img) => (
                  <img key={img.id} src={thumbUrl(img.url, THUMB_TILE)} alt="" className="h-24 w-24 rounded-lg object-cover" />
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Anteckning för dagen</label>
            <Textarea
              value={note ?? task.note ?? ""}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => {
                if (note !== null && note !== (task.note ?? "")) update.mutate({ id: task.id, note: note.trim() || null });
              }}
              className="min-h-[70px]"
            />
          </div>
        </TabsContent>

        <TabsContent value="bilder">
          {allImages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inga bilder är kopplade till uppgiften ännu.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {allImages.map((img, i) => (
                <button key={img.id} type="button" onClick={() => setLightbox(i)} className="overflow-hidden rounded-lg">
                  <img src={thumbUrl(img.url, THUMB_TILE)} alt="" className="h-24 w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historik" className="space-y-2">
          {doers.length > 0 && (
            <Card className="space-y-2 p-4">
              <p className="text-sm font-semibold">
                Gjord {history.filter((h) => h.done).length} gånger — av {doers.length}{" "}
                {doers.length === 1 ? "person" : "personer"}
              </p>
              <div className="flex flex-wrap gap-2">
                {doers.map((d) => (
                  <span
                    key={d.key}
                    className="flex items-center gap-2 rounded-full border bg-card px-2 py-1 text-sm"
                  >
                    <StaffAvatar name={d.name} imageUrl={d.image} className="h-8 w-8" />
                    <span className="font-medium">{d.name}</span>
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {d.times} ggr
                    </span>
                  </span>
                ))}
              </div>
            </Card>
          )}
          {doneRatio !== null && (
            <p className="text-sm text-muted-foreground">
              Klar {doneRatio}% av de senaste {history.length} tillfällena.
            </p>
          )}
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen historik ännu.</p>
          ) : (
            history.map((h) => {
              const open = openOccurrence === h.id;
              const noteText = h.completion_note ?? h.note;
              const minutes = h.active_minutes ?? h.actual_minutes;
              const hasDetails =
                !!noteText || h.completion_value !== null || h.images.length > 0 || minutes !== null;
              return (
                <Card key={h.id} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenOccurrence(open ? null : h.id)}
                    className="flex w-full flex-wrap items-center gap-3 px-4 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    <span className={cn("rounded px-2 py-0.5 text-[11px]", dayBadgeClass(h.date))}>{h.date}</span>
                    <span className={h.done ? "text-emerald-600" : "text-muted-foreground"}>
                      {h.done ? "Klar" : "Inte gjord"}
                    </span>
                    {(staffName(h.completed_by_staff_id) || h.signature) && (
                      <span className="flex items-center gap-2">
                        <StaffAvatar
                          name={staffName(h.completed_by_staff_id) ?? h.signature}
                          imageUrl={staffImage(h.completed_by_staff_id)}
                          className="h-10 w-10"
                        />
                        {staffName(h.completed_by_staff_id) ?? h.signature}
                      </span>
                    )}
                    {minutes !== null && (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {Math.round(minutes)} min
                      </span>
                    )}
                    {h.images.length > 0 && (
                      <span className="text-xs text-muted-foreground">{h.images.length} bilder</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {hasDetails ? (open ? "Stäng" : "Så här gjordes den") : "Inget mer sparat"}
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-3 border-t bg-muted/20 px-4 py-3 text-sm">
                      <p className="text-xs text-muted-foreground">
                        {h.done_at
                          ? `Klarmarkerad ${new Date(h.done_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}`
                          : "Ingen tid registrerad"}
                        {h.started_at &&
                          ` · start ${new Date(h.started_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`}
                        {h.paused_minutes ? ` · pauser ${Math.round(h.paused_minutes)} min` : ""}
                      </p>
                      {noteText ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Anteckning
                          </p>
                          <p className="whitespace-pre-wrap">{noteText}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Ingen anteckning skrevs.</p>
                      )}
                      {h.completion_value !== null && (
                        <p>
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {h.value_label ?? "Mätvärde"}:{" "}
                          </span>
                          <span className="font-mono tabular-nums">{h.completion_value}</span>
                        </p>
                      )}
                      {h.images.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {h.images.map((img) => {
                            const idx = allImages.findIndex((x) => x.id === img.id);
                            return (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => setLightbox(idx >= 0 ? idx : 0)}
                                className="overflow-hidden rounded-lg"
                              >
                                <img
                                  src={thumbUrl(img.url, THUMB_TILE)}
                                  alt=""
                                  className="h-24 w-24 object-cover"
                                />
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Inga bilder togs.</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="inst" className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Steg 1 · Uppgiften</p>
            <label className="text-sm font-medium">Vad ska göras?</label>
            <div className="flex gap-2">
              <Input value={title ?? task.task} onChange={(e) => setTitle(e.target.value)} />
              <Button
                variant="outline"
                disabled={title === null || !title.trim() || title.trim() === task.task}
                onClick={() => {
                  update.mutate({ id: task.id, task: title!.trim() });
                  toast({ title: "Uppgiften sparad" });
                }}
              >
                Spara
              </Button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Kategori</label>
            <Select
              value={task.category_id ?? "none"}
              onValueChange={(v) => update.mutate({ id: task.id, category_id: v === "none" ? null : v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Ingen kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium">Viktigt att veta</label>
            <Textarea
              value={important ?? task.important_note ?? ""}
              onChange={(e) => setImportant(e.target.value)}
              onBlur={() => {
                if (important !== null && important !== (task.important_note ?? ""))
                  update.mutate({ id: task.id, important_note: important.trim() || null });
              }}
              className="min-h-[60px]"
            />
          </div>

          <div className="rounded-lg border p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">Steg 2 · Så gör du</p>
            <label className="text-sm font-medium">Arbetsbeskrivning</label>
            <p className="mb-3 text-xs text-muted-foreground">Mål, material och ett moment per steg — med bild.</p>
            <TaskGuideEditor
              taskId={task.id}
              value={guide}
              zones={guideZones}
              saving={saveGuide.isPending}
              onSave={async (g) => {
                try {
                  await saveGuide.mutateAsync({ id: task.id, templateItemId: task.template_item_id, guide: g });
                  toast({ title: "Beskrivningen sparad" });
                } catch (e: any) {
                  toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
                }
              }}
            />
          </div>

          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Steg 3 · Vem & när</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">Ansvarig</label>
              <Select
                value={task.assigned_staff_id ?? "none"}
                onValueChange={(v) => update.mutate({ id: task.id, assigned_staff_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen tilldelad</SelectItem>
                  {staffList.map((s) => (
                     <SelectItem key={s.id} value={s.id}>
                       <span className="inline-flex items-center gap-2">
                         <StaffAvatar
                           name={`${s.first_name} ${s.last_name}`}
                           imageUrl={s.profile_image_url}
                           className="h-10 w-10"
                         />
                         {s.first_name} {s.last_name}
                       </span>
                     </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Område</label>
              <Select
                value={task.zone_id ?? "none"}
                onValueChange={(v) => update.mutate({ id: task.id, zone_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inget område</SelectItem>
                  {[...zones]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((z, i) => (
                      <SelectItem key={z.id} value={z.id}>
                        {i + 1}. {z.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Tid</label>
              <Input
                type="time"
                defaultValue={task.specific_time?.slice(0, 5) ?? ""}
                onBlur={(e) =>
                  update.mutate({ id: task.id, specific_time: e.target.value || null, time_label: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dagsdel</label>
              <Select
                value={task.daypart ?? "ingen"}
                onValueChange={(v) => update.mutate({ id: task.id, daypart: v === "ingen" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYPARTS.map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Leder till</label>
              <Select
                value={task.link_url ?? "none"}
                onValueChange={(v) => update.mutate({ id: task.id, link_url: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ingen genväg" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ingen genväg</SelectItem>
                  {TASK_LINKS.map((l) => (
                    <SelectItem key={l.url} value={l.url}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Recept</label>
              <Select
                value={task.recipe_id ?? "none"}
                onValueChange={(v) => update.mutate({ id: task.id, recipe_id: v === "none" ? null : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Inget recept" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Inget recept</SelectItem>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Beräknad tid (min)</label>
              <Input
                type="number"
                min={0}
                defaultValue={task.estimated_minutes ?? ""}
                onBlur={(e) =>
                  update.mutate({ id: task.id, estimated_minutes: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>
            <div className="col-span-2 space-y-2 rounded-md border p-3">
              <p className="text-sm font-medium">Krav för att få bocka av</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.requires_photo}
                  onChange={(e) => update.mutate({ id: task.id, requires_photo: e.target.checked })}
                />
                Bild krävs
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.requires_note}
                  onChange={(e) => update.mutate({ id: task.id, requires_note: e.target.checked })}
                />
                Kommentar krävs
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.requires_value}
                  onChange={(e) => update.mutate({ id: task.id, requires_value: e.target.checked })}
                />
                Mätvärde krävs
              </label>
              {task.requires_value && (
                <Input
                  placeholder="Vad mäts? T.ex. Temperatur °C"
                  defaultValue={task.value_label ?? ""}
                  onBlur={(e) => update.mutate({ id: task.id, value_label: e.target.value.trim() || null })}
                />
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Återkommande / checklista</p>
            <TaskRecurrencePanel task={task} storeId={storeId} currentWeekdays={itemWeekdays} />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Kontrollpunkter i Genomför</p>
            {task.template_item_id ? (
              <CheckpointEditor templateItemId={task.template_item_id} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Kontrollpunkter läggs in på standarduppgiften. Den här uppgiften är bara skapad för dagen.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Standardtid</p>
            {task.template_item_id ? (
              <StandardTimeEditor templateItemId={task.template_item_id} />
            ) : (
              <p className="text-sm text-muted-foreground">Standardtiden läggs in på standarduppgiften.</p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Utrustning &amp; material som arbetet kräver</p>
            <RequirementEditor
              templateItemId={task.template_item_id ?? null}
              checklistItemId={task.id}
              storeId={storeId}
            />
          </div>
          <div className="border-t pt-4">
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                if (!window.confirm(`Ta bort uppgiften "${task.task}"?`)) return;
                try {
                  await removeTask.mutateAsync(task.id);
                  toast({ title: "Uppgiften togs bort" });
                  switchTab("/uppgifter");
                } catch (e: any) {
                  toast({ title: "Kunde inte ta bort", description: e.message, variant: "destructive" });
                }
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Ta bort uppgiften
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Tar bort uppgiften för det här datumet. Återkommande uppgifter tas bort under Standarduppgifter.
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <ImageLightbox
        images={allImages}
        index={lightbox}
        onIndexChange={setLightbox}
        onClose={() => setLightbox(null)}
        title={task.task}
      />

      <ImageArchivePicker
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        saving={attachArchive.isPending}
        onPick={async (picked) => {
          if (!task.zone_id) {
            toast({ title: "Uppgiften saknar yta på kartan", variant: "destructive" });
            return;
          }
          try {
            await attachArchive.mutateAsync({
              images: picked,
              entityType: "map_zone",
              entityId: task.zone_id,
              checklistItemId: task.id,
              floorPlanId: plan?.id ?? null,
            });
            setArchiveOpen(false);
            toast({ title: picked.length > 1 ? "Bilderna kopplade" : "Bilden kopplad" });
          } catch (e: any) {
            toast({ title: "Kunde inte koppla bilden", description: e.message, variant: "destructive" });
          }
        }}
      />



      <TaskIssueDialog
        open={issueOpen}
        onOpenChange={setIssueOpen}
        taskId={task.id}
        taskName={task.task}
        storeId={storeId}
        materials={guide.materials.map((m) => m.name).filter(Boolean)}
        presetName={issuePreset}
      />
    </div>
  );
}
