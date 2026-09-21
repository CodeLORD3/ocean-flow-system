import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Plus, Trash2 } from "lucide-react";

const STEPS = [
  { n: 1, label: "Vad" },
  { n: 2, label: "Var & vem" },
  { n: 3, label: "Krav" },
] as const;
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
import { todayIso, useChecklistTemplates, useCreateChecklistTemplate } from "@/hooks/useChecklist";
import { useFloorPlans, useMapZones } from "@/hooks/useStoreMap";
import { useUploadEntityImage } from "@/hooks/useEntityImages";
import {
  useAddAdhocTask,
  useAddStandardTask,
  useDayTasks,
  useDeleteTask,
  useSetTaskDone,
  useUpdateTask,
  useStandardTasks,
  useTaskCategories,
  useUpdateStandardTask,
  type TaskRow as Task,
} from "@/hooks/useTasks";
import { DAYPARTS, durationText, groupByDaypart, remainingMinutes } from "@/lib/taskTime";
import { TaskRow, type TaskRowArea } from "@/components/tasks/TaskRow";
import { TaskZoneMap, type ZoneTaskCount } from "@/components/tasks/TaskZoneMap";
import StoreMap from "@/pages/StoreMap";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { TaskRegister } from "@/components/tasks/TaskRegister";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { WORK_TYPES, workTypeLabel } from "@/lib/workType";
import { TASK_LINKS, taskTarget } from "@/lib/taskLink";
import { useProductionRecipes } from "@/hooks/useProductionRecipes";
import ProductionRecipes from "@/pages/ProductionRecipes";

const WEEKDAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const tone = "bg-emerald-500";
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
  const [searchParams] = useSearchParams();

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
  const { data: recipes = [] } = useProductionRecipes();
  const setDone = useSetTaskDone();
  const addAdhoc = useAddAdhocTask();
  const addStandard = useAddStandardTask();
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

  /** Dagens uppgifter per område, så kartan visar vad som är kvar var. */
  const zoneCounts = useMemo(() => {
    const map = new Map<string, ZoneTaskCount>();
    tasks.forEach((t) => {
      if (!t.zone_id) return;
      const cur = map.get(t.zone_id) ?? { total: 0, left: 0 };
      map.set(t.zone_id, { total: cur.total + 1, left: cur.left + (t.done ? 0 : 1) });
    });
    return map;
  }, [tasks]);

  const [tab, setTab] = useState("dag");
  const { data: checklists = [] } = useChecklistTemplates(storeId);
  const createChecklist = useCreateChecklistTemplate();
  const [newListName, setNewListName] = useState("");

  const [fArea, setFArea] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fPerson, setFPerson] = useState("all");
  const [fStatus, setFStatus] = useState<"kvar" | "klara" | "allt">("allt");
  const [query, setQuery] = useState("");

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
      const q = query.trim().toLowerCase();
      if (q) {
        const person = staffList.find((p) => p.id === t.assigned_staff_id);
        const hay = [
          t.task,
          t.note,
          t.signature,
          person ? `${person.first_name} ${person.last_name}` : "",
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, fArea, fCat, fPerson, fStatus, query, staffList]);

  const [groupBy, setGroupBy] = useState<"tid" | "typ">("typ");

  /** Underrubriker per uppgiftstyp — Produktion, Städning, Kontorsarbete först. */
  const categoryGroups = useMemo(() => {
    const order = ["Produktion", "Städning", "Kontorsarbete"];
    const map = new Map<string, { key: string; label: string; tasks: Task[] }>();
    filtered.forEach((t) => {
      const cat = categories.find((c) => c.id === t.category_id);
      const key = cat?.id ?? "ovrigt";
      const label = cat?.name ?? "Övrigt";
      const g = map.get(key) ?? { key, label, tasks: [] };
      g.tasks.push(t);
      map.set(key, g);
    });
    return [...map.values()].sort((a, b) => {
      const ai = order.indexOf(a.label);
      const bi = order.indexOf(b.label);
      if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      return a.label.localeCompare(b.label, "sv");
    });
  }, [filtered, categories]);

  const groups = useMemo(
    () => (groupBy === "typ" ? categoryGroups : groupByDaypart(filtered)),
    [groupBy, categoryGroups, filtered],
  );

  /** Vart uppgiften leder vidare: recept, dagsrapport, checklista … */
  const targetOf = (t: Task) => taskTarget(t, recipes.find((r) => r.id === t.recipe_id)?.name ?? null);
  const doneCount = tasks.filter((t) => t.done).length;
  const left = remainingMinutes(tasks);

  const staffName = (id: string | null) => {
    const s = staffList.find((p) => p.id === id);
    return s ? `${s.first_name} ${s.last_name}` : null;
  };
  const catOf = (t: Task) => categories.find((c) => c.id === t.category_id) ?? null;

  const [newOpen, setNewOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [nTask, setNTask] = useState("");
  const [nZone, setNZone] = useState("none");
  const [nCat, setNCat] = useState("none");
  const [nPerson, setNPerson] = useState("none");
  const [nTime, setNTime] = useState("");
  const [nMinutes, setNMinutes] = useState("");
  const [nNote, setNNote] = useState("");
  const [nRecurring, setNRecurring] = useState(false);
  const [nReqPhoto, setNReqPhoto] = useState(false);
  const [nReqNote, setNReqNote] = useState(false);
  const [nReqValue, setNReqValue] = useState(false);
  const [nValueLabel, setNValueLabel] = useState("");
  const [nLink, setNLink] = useState("none");
  const [nRecipe, setNRecipe] = useState("none");
  const updateTask = useUpdateTask();

  const createAdhoc = async () => {
    if (!storeId) return;
    let newId: string | null = null;
    try {
      const payload = {
        storeId,
        date: day,
        task: nTask,
        zoneId: nZone === "none" ? null : nZone,
        categoryId: nCat === "none" ? null : nCat,
        assignedStaffId: nPerson === "none" ? null : nPerson,
        specificTime: nTime || null,
        estimatedMinutes: nMinutes ? Number(nMinutes) : null,
        note: nNote,
        requiresPhoto: nReqPhoto,
        requiresNote: nReqNote,
        requiresValue: nReqValue,
        valueLabel: nReqValue ? nValueLabel || "Värde" : null,
        linkUrl: nLink === "none" ? null : nLink,
        recipeId: nRecipe === "none" ? null : nRecipe,
      };
      if (nRecurring) {
        await addStandard.mutateAsync(payload);
        toast({ title: "Standarduppgift tillagd", description: "Den återkommer varje dag." });
      } else {
        const id = await addAdhoc.mutateAsync(payload);
        toast({ title: "Tillfällig uppgift tillagd", description: "Den gäller bara valt datum." });
        newId = id;
      }
      setNewOpen(false);
      setStep(1);
      setNTask("");
      setNNote("");
      setNTime("");
      setNMinutes("");
      setNReqPhoto(false);
      setNReqNote(false);
      setNReqValue(false);
      setNValueLabel("");
      setNLink("none");
      setNRecipe("none");
      if (newId) switchTab(`/uppgift/${newId}`);
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

  const deleteTask = async (task: Task) => {
    if (!window.confirm(`Ta bort uppgiften "${task.task}" från ${day}?`)) return;
    try {
      await removeTask.mutateAsync(task.id);
      toast({ title: "Uppgiften togs bort" });
    } catch (e: any) {
      toast({ title: "Kunde inte ta bort", description: e.message, variant: "destructive" });
    }
  };

  const deleteStandard = async (id: string, name: string) => {
    if (!window.confirm(`Ta bort standarduppgiften "${name}"? Den slutar då skapas nya dagar.`)) return;
    try {
      await updateStandard.mutateAsync({ id, active: false });
      toast({ title: "Standarduppgiften togs bort" });
    } catch (e: any) {
      toast({ title: "Kunde inte ta bort", description: e.message, variant: "destructive" });
    }
  };

  const staffOptions = useMemo(
    () =>
      staffList.map((p) => ({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        imageUrl: p.profile_image_url ?? null,
      })),
    [staffList],
  );

  /** Menylänkar kan förvälja flik, t.ex. ?flik=ekonomi för Viktiga papper. */
  useEffect(() => {
    const flik = searchParams.get("flik");
    if (flik) setTab(flik);
  }, [searchParams]);

  /** Uppgiften man kom tillbaka till från kartan markeras en stund. */
  const [marked, setMarked] = useState<string | null>(null);
  useEffect(() => {
    const id = searchParams.get("markera");
    if (!id) return;
    setMarked(id);
    setTab("dag");
    const t = setTimeout(() => {
      document.getElementById(`uppgift-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    const clear = setTimeout(() => setMarked(null), 8000);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [searchParams]);

  /** Öppnar kartan med ytan markerad och med väg tillbaka till uppgiften. */
  const openOnMap = (t: Task, areaId: string) => {
    switchTab(`/store-map?zone=${areaId}&fromTask=${t.id}&taskName=${encodeURIComponent(t.task)}`);
  };

  const assign = (t: Task, staffId: string | null) => {
    updateTask.mutate(
      { id: t.id, assigned_staff_id: staffId },
      {
        onSuccess: () =>
          toast({
            title: staffId ? `Tilldelad ${staffName(staffId)}` : "Tilldelning borttagen",
            description: t.task,
          }),
        onError: (e: any) => toast({ title: "Kunde inte tilldela", description: e.message, variant: "destructive" }),
      },
    );
  };

  /** Uppgifterna grupperade per person för valt datum. */
  const perPerson = useMemo(() => {
    const groups = staffOptions
      .map((p) => ({ ...p, tasks: tasks.filter((t) => t.assigned_staff_id === p.id) }))
      .filter((g) => g.tasks.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
    const unassigned = tasks.filter((t) => !t.assigned_staff_id);
    return { groups, unassigned };
  }, [staffOptions, tasks]);

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
            <Plus className="mr-1 h-4 w-4" /> Ny uppgift
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap gap-1 p-1">
          {[
            ["dag", "Dagens uppgifter"],
            ["alla", "Alla uppgifter"],
            ["personer", "Personer"],
            ["kalender", "Kalender"],
            ["produktion", "Produktion"],
            ["checklistor", "Checklistor"],
            ["sagordu", "Så gör du"],
            ["standard", "Standarduppgifter"],
            ["schema", "Schemaläggning"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:font-semibold"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dag" className="space-y-4">
          {plan && zones.length > 0 && (
            <TaskZoneMap
              plan={plan}
              zones={zones}
              areas={areaOf}
              counts={zoneCounts}
              selected={fArea}
              onSelect={setFArea}
              chipsOnly={mapOpen}
              onOpenMap={() => setMapOpen((v) => !v)}
              openLabel={mapOpen ? "Dölj kartan" : "Visa hela kartan"}
            />
          )}

          {/* Butikskartan med alla funktioner — samma karta som i Översikt */}
          {mapOpen && (
            <Card className="p-4">
              <StoreMap embedded />
            </Card>
          )}

          <Card className="p-4">
            <Progress done={doneCount} total={tasks.length} />
            {left > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Beräknad tid kvar: {durationText(left)}</p>
            )}
          </Card>

          <div className="flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök"
              className="h-8 w-[200px] text-xs"
            />
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
            <div className="flex overflow-hidden rounded-md border text-xs">
              {(["typ", "tid"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setGroupBy(k)}
                  className={cn("px-3 py-1.5", groupBy === k && "bg-primary text-primary-foreground")}
                >
                  {k === "typ" ? "Typ" : "Tid"}
                </button>
              ))}
            </div>
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
                    <div
                      key={t.id}
                      id={`uppgift-${t.id}`}
                      className={
                        marked === t.id
                          ? "rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background transition-shadow"
                          : undefined
                      }
                    >
                      <TaskRow
                        task={t}
                        area={t.zone_id ? (areaOf.get(t.zone_id) ?? null) : null}
                        categoryName={catOf(t)?.name ?? null}
                        categoryColor={catOf(t)?.color ?? null}
                        assigneeName={staffName(t.assigned_staff_id)}
                        assigneeImage={
                          staffList.find((p) => p.id === t.assigned_staff_id)?.profile_image_url ?? null
                        }
                        completedByName={staffName(t.completed_by_staff_id)}
                        completedByImage={
                          staffList.find((p) => p.id === t.completed_by_staff_id)?.profile_image_url ?? null
                        }
                        onToggle={(done) => setDone.mutate({ id: t.id, done })}
                        onSaveRequirement={(patch) => updateTask.mutate({ id: t.id, ...patch })}
                        staffOptions={staffOptions}
                        onAssign={(staffId) => assign(t, staffId)}
                        onOpenDetail={() => switchTab(`/uppgift/${t.id}`)}
                        onAddPhoto={(file) => addPhoto(t, file)}
                        onOpenArea={(areaId) => openOnMap(t, areaId)}
                        linkLabel={targetOf(t)?.label ?? null}
                        onOpenLink={() => {
                          const target = targetOf(t);
                          if (target) switchTab(target.url);
                        }}
                        onDelete={() => deleteTask(t)}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="personer" className="space-y-3">
          {perPerson.groups.length === 0 && perPerson.unassigned.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Inga uppgifter för valt datum.</p>
          ) : (
            <>
              {perPerson.groups.map((g) => {
                const done = g.tasks.filter((t) => t.done).length;
                return (
                  <Card key={g.id} className="p-4">
                    <div className="flex items-center gap-3">
                      <StaffAvatar name={g.name} imageUrl={g.imageUrl} className="h-12 w-12" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{g.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {done}/{g.tasks.length} klara · {durationText(remainingMinutes(g.tasks)) || "ingen tid kvar"}
                        </p>
                      </div>
                      <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-muted md:block">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${g.tasks.length ? (done / g.tasks.length) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {g.tasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          area={t.zone_id ? (areaOf.get(t.zone_id) ?? null) : null}
                          categoryName={catOf(t)?.name ?? null}
                          categoryColor={catOf(t)?.color ?? null}
                          assigneeName={g.name}
                          assigneeImage={g.imageUrl}
                          completedByName={staffName(t.completed_by_staff_id)}
                          completedByImage={
                            staffList.find((p) => p.id === t.completed_by_staff_id)?.profile_image_url ?? null
                          }
                          onToggle={(done2) => setDone.mutate({ id: t.id, done: done2 })}
                          onSaveRequirement={(patch) => updateTask.mutate({ id: t.id, ...patch })}
                          staffOptions={staffOptions}
                          onAssign={(staffId) => assign(t, staffId)}
                          onOpenDetail={() => switchTab(`/uppgift/${t.id}`)}
                          onAddPhoto={(file) => addPhoto(t, file)}
                          onOpenArea={(areaId) => openOnMap(t, areaId)}
                          linkLabel={targetOf(t)?.label ?? null}
                          onOpenLink={() => {
                            const target = targetOf(t);
                            if (target) switchTab(target.url);
                          }}
                        />
                      ))}
                    </div>
                  </Card>
                );
              })}
              {perPerson.unassigned.length > 0 && (
                <Card className="p-4">
                  <p className="font-semibold">Ej tilldelade ({perPerson.unassigned.length})</p>
                  <p className="text-xs text-muted-foreground">Öppna en uppgift och välj vem som gör den.</p>
                  <div className="mt-3 space-y-2">
                    {perPerson.unassigned.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        area={t.zone_id ? (areaOf.get(t.zone_id) ?? null) : null}
                        categoryName={catOf(t)?.name ?? null}
                        categoryColor={catOf(t)?.color ?? null}
                        completedByName={staffName(t.completed_by_staff_id)}
                        completedByImage={
                          staffList.find((p) => p.id === t.completed_by_staff_id)?.profile_image_url ?? null
                        }
                        onToggle={(done2) => setDone.mutate({ id: t.id, done: done2 })}
                        onSaveRequirement={(patch) => updateTask.mutate({ id: t.id, ...patch })}
                        staffOptions={staffOptions}
                        onAssign={(staffId) => assign(t, staffId)}
                        onOpenDetail={() => switchTab(`/uppgift/${t.id}`)}
                        onAddPhoto={(file) => addPhoto(t, file)}
                        onOpenArea={(areaId) => openOnMap(t, areaId)}
                      />
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="kalender" className="space-y-3">
          <TaskCalendar
            storeId={storeId}
            selected={day}
            onSelect={setDay}
            onOpenDay={(d) => {
              setDay(d);
              setTab("dag");
            }}
            areas={areaOf}
          />
        </TabsContent>

        <TabsContent value="alla">
          <TaskRegister
            storeId={storeId}
            categories={categories}
            areas={areaOf}
            recipes={recipes}
            onOpenTask={(id) => switchTab(`/uppgift/${id}`)}
            onNavigate={(url) => switchTab(url)}
          />
        </TabsContent>

        <TabsContent value="produktion">
          <ProductionRecipes />
        </TabsContent>

        <TabsContent value="checklistor" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Butikens checklistor. Varje checklista samlar sina uppgifter och styr vilka dagar de dyker upp.
          </p>

          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Input
              placeholder="Namn på ny checklista"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              className="h-9 w-[260px]"
            />
            <Button
              size="sm"
              disabled={!newListName.trim() || createChecklist.isPending}
              onClick={async () => {
                try {
                  await createChecklist.mutateAsync({ name: newListName, storeId });
                  setNewListName("");
                  toast({ title: "Checklistan är skapad" });
                } catch (e: any) {
                  toast({ title: "Kunde inte skapa", description: e.message, variant: "destructive" });
                }
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Ny checklista
            </Button>
          </Card>

          <Button variant="outline" size="sm" onClick={() => switchTab("/checklist")}>
            Öppna dagens checklista
          </Button>

          {checklists.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Inga checklistor ännu.</p>
          ) : (
            checklists.map((c) => {
              const items = standard.filter((s) => s.listName === c.name);
              const wd = c.weekdays ?? [];
              return (
                <Card key={c.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{c.name}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {items.length} uppgifter ·{" "}
                        {wd.length === 0 ? "Alla dagar" : wd.map((d) => WEEKDAY_NAMES[(d + 6) % 7]).join(" ")}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setTab("dag")}>
                      Visa dagens uppgifter
                    </Button>
                  </div>
                  {items.length > 0 && (
                    <ul className="space-y-1 text-[13px] text-muted-foreground">
                      {items.slice(0, 8).map((s) => (
                        <li key={s.id} className="truncate">
                          • {s.task}
                        </li>
                      ))}
                      {items.length > 8 && <li className="text-[11px]">+ {items.length - 8} fler</li>}
                    </ul>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="sagordu" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Så gör du: steg för steg för varje uppgift. Öppna en uppgift för att ändra stegen.
          </p>
          {standard.filter((s) => (s.instructions ?? []).length > 0 || s.important_note).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Ingen uppgift har steg ännu. Lägg till dem under uppgiftens inställningar.
            </p>
          ) : (
            standard
              .filter((s) => (s.instructions ?? []).length > 0 || s.important_note)
              .map((s) => (
                <Card key={s.id} className="space-y-2 p-4">
                  <div className="text-sm font-semibold">{s.task}</div>
                  <div className="text-[11px] text-muted-foreground">{s.listName}</div>
                  {s.important_note && (
                    <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[13px] text-amber-700">
                      {s.important_note}
                    </p>
                  )}
                  {(s.instructions ?? []).length > 0 && (
                    <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted-foreground">
                      {(s.instructions ?? []).map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  )}
                  {s.requires_photo && <p className="text-[11px] text-muted-foreground">Kräver bild</p>}
                </Card>
              ))
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteStandard(s.id, s.task)}
                >
                  <Trash2 className="mr-1 h-4 w-4" /> Ta bort
                </Button>
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

      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o);
          if (!o) setStep(1);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Ny uppgift</DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.n} className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => (s.n < step || nTask.trim()) && setStep(s.n)}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    step === s.n
                      ? "bg-primary text-primary-foreground"
                      : step > s.n
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {step > s.n ? <Check className="h-4 w-4" /> : s.n}
                </button>
                <span className={cn("hidden text-xs sm:block", step === s.n ? "font-semibold" : "text-muted-foreground")}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          <div className="min-h-[240px] space-y-3 pt-1">
            {step === 1 && (
              <>
                <div>
                  <label className="text-sm font-medium">Vad ska göras?</label>
                  <Input
                    value={nTask}
                    onChange={(e) => setNTask(e.target.value)}
                    placeholder="T.ex. Rengör fiskdisken"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nTask.trim()) setStep(2);
                    }}
                  />
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
                <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={nRecurring}
                    onChange={(e) => setNRecurring(e.target.checked)}
                  />
                  <span>
                    Återkommande uppgift
                    <span className="block text-xs text-muted-foreground">
                      {nRecurring ? "Kommer tillbaka varje dag." : "Gäller bara valt datum."}
                    </span>
                  </span>
                </label>
              </>
            )}

            {step === 2 && (
              <>
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
                  <label className="text-sm font-medium">Ansvarig</label>
                  <Select value={nPerson} onValueChange={setNPerson}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ingen" />
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
                <div className="grid grid-cols-2 gap-3">
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
                  <label className="text-sm font-medium">Leder till (valfritt)</label>
                  <Select value={nLink} onValueChange={setNLink}>
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
                  <p className="mt-1 text-xs text-muted-foreground">
                    T.ex. dagsrapporten eller stängningschecklistan — då öppnas den direkt från uppgiften.
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Recept (för produktion)</label>
                  <Select value={nRecipe} onValueChange={setNRecipe}>
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
              </>
            )}

            {step === 3 && (
              <>
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-sm font-medium">Krav för att få bocka av</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={nReqPhoto} onChange={(e) => setNReqPhoto(e.target.checked)} />
                    Bild krävs
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={nReqNote} onChange={(e) => setNReqNote(e.target.checked)} />
                    Kommentar krävs
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4" checked={nReqValue} onChange={(e) => setNReqValue(e.target.checked)} />
                    Mätvärde krävs
                  </label>
                  {nReqValue && (
                    <Input
                      placeholder="Vad mäts? T.ex. Temperatur °C"
                      value={nValueLabel}
                      onChange={(e) => setNValueLabel(e.target.value)}
                    />
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Anteckning</label>
                  <Textarea value={nNote} onChange={(e) => setNNote(e.target.value)} className="min-h-[60px]" />
                </div>
                <p className="text-xs text-muted-foreground">Uppgiften öppnas efteråt för beskrivning och bilder.</p>
              </>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={() => (step === 1 ? setNewOpen(false) : setStep(step - 1))}>
              {step === 1 ? "Avbryt" : "Tillbaka"}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !nTask.trim()}>
                Nästa
              </Button>
            ) : (
              <Button onClick={createAdhoc} disabled={!nTask.trim() || !storeId}>
                Skapa uppgift
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
