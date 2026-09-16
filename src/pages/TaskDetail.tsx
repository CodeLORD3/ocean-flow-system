import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Camera, Check, Clock, MapPin, Timer, Trash2, User } from "lucide-react";
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
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { thumbUrl, THUMB_TILE } from "@/lib/imageThumb";
import { dayBadgeClass } from "@/lib/dayColor";
import {
  useDeleteTask,
  useSetTaskDone,
  useTaskHistory,
  useTaskCategories,
  useTaskImages,
  useTaskItem,
  useTaskReferenceImages,
  useUpdateTask,
} from "@/hooks/useTasks";
import { DAYPARTS, durationText, taskTime } from "@/lib/taskTime";
import { workTypeLabel } from "@/lib/workType";

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

  const [note, setNote] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [important, setImportant] = useState<string | null>(null);
  const [steps, setSteps] = useState<string[]>([]);
  const { data: categories = [] } = useTaskCategories(storeId);

  useEffect(() => {
    setSteps(task?.instructions ?? []);
  }, [task?.id, task?.instructions]);

  const area = useMemo(() => {
    const sorted = [...zones].sort((a, b) => a.sort_order - b.sort_order);
    const i = sorted.findIndex((z) => z.id === task?.zone_id);
    if (i < 0) return null;
    const z = sorted[i];
    return { id: z.id, name: z.name, color: z.color ?? "hsl(var(--primary))", number: i + 1 };
  }, [zones, task?.zone_id]);

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

  if (isLoading) return <p className="text-muted-foreground">Laddar…</p>;
  if (!task) return <p className="text-muted-foreground">Uppgiften finns inte längre.</p>;

  const time = taskTime(task);
  const doneRatio = history.length > 0 ? Math.round((history.filter((h) => h.done).length / history.length) * 100) : null;

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
          <div>
            <h1 className="text-xl font-bold">{task.task}</h1>
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
                  onClick={() => switchTab("/store-map")}
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={task.done ? "outline" : "default"}
              onClick={() => setDone.mutate({ id: task.id, done: !task.done })}
            >
              {task.done ? "Återöppna" : (
                <>
                  <Check className="mr-1 h-4 w-4" /> Markera som klar
                </>
              )}
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addPhoto(f);
                  e.currentTarget.value = "";
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted">
                <Camera className="h-4 w-4" /> Ta bild
              </span>
            </label>
          </div>
        </div>
        {task.done && (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            {(staffName(task.completed_by_staff_id) || task.signature) && (
              <StaffAvatar
                name={staffName(task.completed_by_staff_id) ?? task.signature}
                imageUrl={staffImage(task.completed_by_staff_id)}
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

      <Tabs defaultValue="instruktion">
        <TabsList>
          <TabsTrigger value="instruktion">Instruktion</TabsTrigger>
          <TabsTrigger value="bilder">Bilder</TabsTrigger>
          <TabsTrigger value="historik">Historik</TabsTrigger>
          <TabsTrigger value="inst">Inställningar</TabsTrigger>
        </TabsList>

        <TabsContent value="instruktion" className="space-y-3">
          {task.important_note && (
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{task.important_note}</p>
          )}
          {task.instructions && task.instructions.length > 0 ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {task.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen instruktion finns för den här uppgiften ännu.</p>
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
          {doneRatio !== null && (
            <p className="text-sm text-muted-foreground">
              Klar {doneRatio}% av de senaste {history.length} tillfällena.
            </p>
          )}
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen historik ännu.</p>
          ) : (
            history.map((h) => (
              <Card key={h.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className={cn("rounded px-2 py-0.5 text-[11px]", dayBadgeClass(h.date))}>{h.date}</span>
                <span className={h.done ? "text-emerald-600" : "text-muted-foreground"}>
                  {h.done ? "Klar" : "Inte gjord"}
                </span>
                {(staffName(h.completed_by_staff_id) || h.signature) && (
                  <span className="flex items-center gap-2">
                    <StaffAvatar
                      name={staffName(h.completed_by_staff_id) ?? h.signature}
                      imageUrl={staffImage(h.completed_by_staff_id)}
                      className="h-5 w-5"
                    />
                    {staffName(h.completed_by_staff_id) ?? h.signature}
                  </span>
                )}
                {h.images.length > 0 && <span className="text-xs text-muted-foreground">{h.images.length} bilder</span>}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="inst" className="space-y-3">
          <div>
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

          <div>
            <label className="text-sm font-medium">Instruktion steg för steg</label>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
                  <Input
                    value={s}
                    onChange={(e) => setSteps(steps.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <Button variant="ghost" size="icon" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSteps([...steps, ""])}>
                  Lägg till steg
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    update.mutate({ id: task.id, instructions: steps.map((s) => s.trim()).filter(Boolean) });
                    toast({ title: "Instruktionen sparad" });
                  }}
                >
                  Spara instruktion
                </Button>
              </div>
            </div>
          </div>

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
                      {s.first_name} {s.last_name}
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
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={task.requires_photo}
                  onChange={(e) => update.mutate({ id: task.id, requires_photo: e.target.checked })}
                />
                Foto krävs för att räknas som klar
              </label>
            </div>
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
    </div>
  );
}
