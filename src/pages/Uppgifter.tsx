import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { useAllowedStores } from "@/components/StoreSwitcher";
import { useStaff } from "@/hooks/useStaff";
import { useTabs } from "@/contexts/TabsContext";
import { todayIso } from "@/hooks/useChecklist";
import { useFloorPlans, useMapZones } from "@/hooks/useStoreMap";
import { useUploadEntityImage } from "@/hooks/useEntityImages";
import {
  useAddAdhocTask,
  useDayTasks,
  useDeleteTask,
  useSetTaskDone,
  useStandardTasks,
  useTaskCategories,
  useUpdateStandardTask,
  type TaskRow as Task,
} from "@/hooks/useTasks";
import { DAYPARTS, durationText, groupByDaypart, remainingMinutes } from "@/lib/taskTime";
import { TaskRow, type TaskRowArea } from "@/components/tasks/TaskRow";
import { WORK_TYPES, workTypeLabel } from "@/lib/workType";

const WEEKDAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const tone = pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-3xl tabular-nums font-semibold">{pct}%</span>
        <span className="text-xs text-muted-foreground">
          {done} av {total} klara
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Uppgifter() {
  const { site, activeStoreId } = useSite();
  const stores = useAllowedStores();
  const { switchTab } = useTabs();

  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const storeId = site === "shop" ? activeStoreId : (pickedStore ?? stores[0]?.id ?? null);
  const [day, setDay] = useState(todayIso());

  const { data: plans = [] } = useFloorPlans(storeId);
  const plan = plans[0] ?? null;
  const { data: zones = [] } = useMapZones(plan?.id ?? null);
  const { data: categories = [] } = useTaskCategories(storeId);
  const { data: staffList = [] } = useStaff(storeId || undefined);
  const { data: dayData } = useDayTasks(storeId, day);
  const { data: standard = [] } = useStandardTasks(storeId);
  const setDone = useSetTaskDone();
  const addAdhoc = useAddAdhocTask();
  const updateStandard = useUpdateStandardTask();
  const removeTask = useDeleteTask();
  const upload = useUploadEntityImage();

  const tasks = dayData?.tasks ?? [];

  const areaOf = useMemo(() => {
    const sorted = [...zones].sort((a, b) => a.sort_order - b.sort_order);
    const map = new Map<string, TaskRowArea>();
    sorted.forEach((z, i) =>
      map.set(z.id, { id: z.id, name: z.name, color: z.color ?? "hsl(var(--primary))", number: i + 1 }),
    );
    return map;
  }, [zones]);

  const [fArea, setFArea] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fPerson, setFPerson] = useState("all");
  const [fStatus, setFStatus] = useState<"kvar" | "klara" | "allt">("allt");

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (fArea !== "all" && (t.zone_id ?? "none") !== fArea) return false;
      if (fCat !== "all") {
        const key = t.category_id ?? `wt:${t.work_type ?? "ovrigt"}`;
        if (key !== fCat) return false;
      }
      if (fPerson !== "all" && (t.assigned_staff_id ?? "none") !== fPerson) return false;
      if (fStatus === "kvar" && t.done) return false;
      if (fStatus === "klara" && !t.done) return false;
      return true;
    });
  }, [tasks, fArea, fCat, fPerson, fStatus]);

  const groups = useMemo(() => groupByDaypart(filtered), [filtered]);
  const doneCount = tasks.filter((t) => t.done).length;
  const left = remainingMinutes(tasks);

  const staffName = (id: string | null) => {
    const s = staffList.find((p) => p.id === id);
    return s ? `${s.first_name} ${s.last_name}` : null;
  };
  const catOf = (t: Task) => categories.find((c) => c.id === t.category_id) ?? null;

  const [newOpen, setNewOpen] = useState(false);
  const [nTask, setNTask] = useState("");
  const [nZone, setNZone] = useState("none");
  const [nCat, setNCat] = useState("none");
  const [nPerson, setNPerson] = useState("none");
  const [nTime, setNTime] = useState("");
  const [nMinutes, setNMinutes] = useState("");
  const [nNote, setNNote] = useState("");

  const createAdhoc = async () => {
    if (!storeId) return;
    try {
      await addAdhoc.mutateAsync({
        storeId,
        date: day,
        task: nTask,
        zoneId: nZone === "none" ? null : nZone,
        categoryId: nCat === "none" ? null : nCat,
        assignedStaffId: nPerson === "none" ? null : nPerson,
        specificTime: nTime || null,
        estimatedMinutes: nMinutes ? Number(nMinutes) : null,
        note: nNote,
      });
      toast({ title: "Tillfällig uppgift tillagd", description: "Den gäller bara valt datum." });
      setNewOpen(false);
      setNTask("");
      setNNote("");
      setNTime("");
      setNMinutes("");
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  const addPhoto = async (task: Task, file: File) => {
    const zoneId = task.zone_id;
    if (!zoneId) {
      toast({
        title: "Uppgiften saknar område",
        description: "Koppla uppgiften till ett område på butikskartan först, så hamnar bilden rätt.",
        variant: "destructive",
      });
      return;
    }
    try {
      await upload.mutateAsync({
        entityType: "map_zone",
        entityId: zoneId,
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Uppgifter</h1>
          <p className="text-sm text-muted-foreground">Dagens arbete, standarduppgifter och schemaläggning.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {site !== "shop" && (
            <Select value={storeId ?? ""} onValueChange={setPickedStore}>
              <SelectTrigger className="h-9 w-[190px]">
                <SelectValue placeholder="Välj butik" />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9 w-[150px]" />
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Tillfällig uppgift
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dag">
        <TabsList>
          <TabsTrigger value="dag">Dagens uppgifter</TabsTrigger>
          <TabsTrigger value="standard">Standarduppgifter</TabsTrigger>
          <TabsTrigger value="schema">Schemaläggning</TabsTrigger>
        </TabsList>

        <TabsContent value="dag" className="space-y-4">
          <Card className="p-4">
            <Progress done={doneCount} total={tasks.length} />
            {left > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Beräknad tid kvar: {durationText(left)}</p>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Select value={fArea} onValueChange={setFArea}>
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue placeholder="Område" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla områden</SelectItem>
                <SelectItem value="none">Utan område</SelectItem>
                {[...areaOf.values()].map((a) => (
                  <SelectItem key={a!.id} value={a!.id}>
                    {a!.number}. {a!.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fCat} onValueChange={setFCat}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla kategorier</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
                {WORK_TYPES.map((w) => (
                  <SelectItem key={w.key} value={`wt:${w.key}`}>
                    {w.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fPerson} onValueChange={setFPerson}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Person" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alla personer</SelectItem>
                <SelectItem value="none">Ingen tilldelad</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex overflow-hidden rounded-md border text-xs">
              {(["kvar", "klara", "allt"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setFStatus(k)}
                  className={cn("px-3 py-1.5 capitalize", fStatus === k && "bg-primary text-primary-foreground")}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>

          {tasks.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Inga uppgifter för valt datum. Lägg till en tillfällig uppgift eller skapa dagens checklista.
            </p>
          ) : (
            <div className="space-y-5">
              {groups.map((g) => (
                <div key={g.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{g.label}</h2>
                    <span className="text-xs text-muted-foreground">
                      {g.tasks.filter((t) => t.done).length}/{g.tasks.length}
                    </span>
                  </div>
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      area={t.zone_id ? (areaOf.get(t.zone_id) ?? null) : null}
                      categoryName={catOf(t)?.name ?? null}
                      categoryColor={catOf(t)?.color ?? null}
                      assigneeName={staffName(t.assigned_staff_id)}
                      completedByName={staffName(t.completed_by_staff_id)}
                      onToggle={(done) => setDone.mutate({ id: t.id, done })}
                      onOpenDetail={() => switchTab(`/uppgift/${t.id}`)}
                      onAddPhoto={(file) => addPhoto(t, file)}
                      onOpenArea={() => switchTab("/store-map")}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="standard" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Uppgifter som återkommer. Ändringar här gäller kommande dagar — dagens lista påverkas inte.
          </p>
          {standard.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Inga standarduppgifter ännu.</p>
          ) : (
            standard.map((s) => (
              <Card key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.task}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    <span>{s.listName}</span>
                    <span>{s.section}</span>
                    {s.work_type && <span>{workTypeLabel(s.work_type)}</span>}
                    {s.estimated_minutes ? <span>{durationText(s.estimated_minutes)}</span> : null}
                    <span>
                      {(s.weekdays ?? []).length === 0
                        ? "Alla dagar"
                        : (s.weekdays ?? []).map((d) => WEEKDAY_NAMES[(d + 6) % 7]).join(" ")}
                    </span>
                  </div>
                </div>
                <Input
                  type="number"
                  min={0}
                  placeholder="min"
                  defaultValue={s.estimated_minutes ?? ""}
                  className="h-8 w-[90px]"
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    if (v !== (s.estimated_minutes ?? null)) updateStandard.mutate({ id: s.id, estimated_minutes: v });
                  }}
                />
                <Select
                  value={s.daypart ?? "ingen"}
                  onValueChange={(v) => updateStandard.mutate({ id: s.id, daypart: v === "ingen" ? null : v })}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs">
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
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="schema" className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Vilka veckodagar varje checklista körs. Schemat styrs av checklistan, så samma uppgift finns kvar i alla vyer.
          </p>
          {Object.entries(
            standard.reduce<Record<string, number[]>>((acc, s) => {
              acc[s.listName] = s.weekdays ?? [];
              return acc;
            }, {}),
          ).map(([name, weekdays]) => (
            <Card key={name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium">{name}</span>
              <div className="flex gap-1">
                {WEEKDAY_NAMES.map((label, i) => {
                  const iso = i === 6 ? 0 : i + 1;
                  const on = weekdays.length === 0 || weekdays.includes(iso);
                  return (
                    <span
                      key={label}
                      className={cn(
                        "rounded px-2 py-1 text-[11px]",
                        on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tillfällig uppgift</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Vad ska göras?</label>
              <Input value={nTask} onChange={(e) => setNTask(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Område</label>
                <Select value={nZone} onValueChange={setNZone}>
                  <SelectTrigger>
                    <SelectValue placeholder="Inget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Inget område</SelectItem>
                    {[...areaOf.values()].map((a) => (
                      <SelectItem key={a!.id} value={a!.id}>
                        {a!.number}. {a!.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Kategori</label>
                <Select value={nCat} onValueChange={setNCat}>
                  <SelectTrigger>
                    <SelectValue placeholder="Ingen" />
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
                <label className="text-sm font-medium">Tid (valfri)</label>
                <Input type="time" value={nTime} onChange={(e) => setNTime(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium">Beräknad tid (min)</label>
                <Input type="number" min={0} value={nMinutes} onChange={(e) => setNMinutes(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Ansvarig</label>
              <Select value={nPerson} onValueChange={setNPerson}>
                <SelectTrigger>
                  <SelectValue placeholder="Ingen" />
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
              <label className="text-sm font-medium">Anteckning</label>
              <Textarea value={nNote} onChange={(e) => setNNote(e.target.value)} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={createAdhoc} disabled={!nTask.trim() || !storeId}>
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
