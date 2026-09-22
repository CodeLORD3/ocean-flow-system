import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { Crosshair, Plus, Trash2 } from "lucide-react";
import { NewTaskDialog } from "@/components/tasks/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { withReturn } from "@/lib/navHistory";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
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
import { TaskAreaChips, type AreaChipCount } from "@/components/tasks/TaskAreaChips";
import { TaskMapDrawer } from "@/components/tasks/TaskMapDrawer";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { TaskRegister } from "@/components/tasks/TaskRegister";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { WORK_TYPES, workTypeLabel } from "@/lib/workType";
import { TASK_LINKS, taskTarget } from "@/lib/taskLink";
import { useProductionRecipes } from "@/hooks/useProductionRecipes";
import ProductionRecipes from "@/pages/ProductionRecipes";

const WEEKDAY_NAMES = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"];

/** Kompakt framsteg: en rad med rubrik, antal klara och en tunn mätare. */
function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold">{label}</h2>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {done} av {total} klara · {pct} %
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
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

  /**
   * Kommer man tillbaka från en uppgifts egen sida ska man landa på exakt samma
   * rad: den fälls ut, rullas fram och lyser upp en stund.
   */
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  useEffect(() => {
    if (location.pathname !== "/uppgifter") return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem("uppgifter-focus-task");
      if (id) sessionStorage.removeItem("uppgifter-focus-task");
    } catch {
      /* ignorera blockerad lagring */
    }
    if (!id) return;
    setFocusTaskId(id);
    const t = setTimeout(() => {
      document.getElementById(`task-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    const clear = setTimeout(() => setFocusTaskId(null), 2600);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [location.pathname, location.key]);

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

  /** Dagens uppgifter per område: hur många totalt och hur många klara. */
  const zoneCounts = useMemo(() => {
    const map = new Map<string, AreaChipCount>();
    tasks.forEach((t) => {
      if (!t.zone_id) return;
      const cur = map.get(t.zone_id) ?? { total: 0, done: 0 };
      map.set(t.zone_id, { total: cur.total + 1, done: cur.done + (t.done ? 1 : 0) });
    });
    return map;
  }, [tasks]);

  /** Kartan är hjälpinformation och ligger i en panel från höger. */
  const [mapOpen, setMapOpen] = useState(false);
  const [mapZoneId, setMapZoneId] = useState<string | null>(null);
  const openMapOn = (zoneId: string | null) => {
    setMapZoneId(zoneId);
    setMapOpen(true);
  };

  const [tab, setTab] = useState("mina");
  const { data: checklists = [] } = useChecklistTemplates(storeId);
  const createChecklist = useCreateChecklistTemplate();
  const [newListName, setNewListName] = useState("");

  const [fArea, setFArea] = useState("all");
  const [fCat, setFCat] = useState("all");
  const [fPerson, setFPerson] = useState("all");
  const [fStatus, setFStatus] = useState<"kvar" | "klara" | "allt">("kvar");
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
  const updateTask = useUpdateTask();

  /** Områdena som kan väljas när en ny uppgift skapas. */
  const newTaskAreas = useMemo(
    () => [...areaOf.values()].map((a) => ({ id: a.id, name: a.name, number: a.number })),
    [areaOf],
  );

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

  /** "Visa på karta" öppnar kartpanelen från höger — sidan ligger kvar. */
  const openOnMap = (_t: Task, areaId: string) => openMapOn(areaId);

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

  /** Inloggad person — "Mina uppgifter" utgår från profilen man är inne i. */
  const { staff } = useStaffAuth();
  const meId = staff?.id ?? null;
  /** Ansvarig: dagens ansvarige, chefsroll eller full insyn. */
  const isResponsible = useMemo(() => {
    if (!staff) return false;
    if (staff.is_platform_admin) return true;
    if (meId && (dayData?.responsibleStaffIds ?? []).includes(meId)) return true;
    return /chef|ansvarig|manager|ledare|butikschef/i.test(staff.primary_role || "");
  }, [staff, meId, dayData?.responsibleStaffIds]);

  const myTasks = useMemo(() => {
    if (!meId) return { mine: [] as Task[], unassigned: [] as Task[], doneByMe: [] as Task[] };
    const mine = tasks.filter((t) => t.assigned_staff_id === meId && !t.done);
    const doneByMe = tasks.filter(
      (t) => t.done && (t.completed_by_staff_id === meId || t.assigned_staff_id === meId),
    );
    const unassigned = isResponsible ? tasks.filter((t) => !t.assigned_staff_id && !t.done) : [];
    return { mine, unassigned, doneByMe };
  }, [tasks, meId, isResponsible]);

  /** Samma uppgiftsrad som i dagens lista, återanvänd i Mina uppgifter. */
  const renderTaskRow = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      focused={focusTaskId === t.id}
      storeId={storeId}
      area={t.zone_id ? (areaOf.get(t.zone_id) ?? null) : null}
      categoryName={catOf(t)?.name ?? null}
      categoryColor={catOf(t)?.color ?? null}
      assigneeName={staffName(t.assigned_staff_id)}
      assigneeImage={staffList.find((p) => p.id === t.assigned_staff_id)?.profile_image_url ?? null}
      completedByName={staffName(t.completed_by_staff_id)}
      completedByImage={staffList.find((p) => p.id === t.completed_by_staff_id)?.profile_image_url ?? null}
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
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">Uppgifter</h1>
          <p className="hidden text-sm text-muted-foreground sm:block">
            Dagens arbete, standarduppgifter och schemaläggning.
          </p>
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
          {plan && zones.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => openMapOn(null)}>
              <Crosshair className="mr-1 h-4 w-4" /> Butikskarta
            </Button>
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Ny uppgift
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Kort rad: Mina · Dagens · Alla. Övriga vyer ligger i "Mer" */}
        <div className="flex items-center gap-2">
          <TabsList className="h-9 gap-1 p-1">
            {[
              ["mina", "Mina"],
              ["dag", "Dagens"],
              ["alla", "Alla"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-md px-3 py-1 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <Select
            value={["mina", "dag", "alla"].includes(tab) ? "" : tab}
            onValueChange={setTab}
          >
            <SelectTrigger className="h-9 w-[150px] text-sm">
              <SelectValue placeholder="Mer" />
            </SelectTrigger>
            <SelectContent>
              {[
                ["personer", "Personer"],
                ["kalender", "Kalender"],
                ["produktion", "Produktion"],
                ["checklistor", "Checklistor"],
                ["sagordu", "Så gör du"],
                ["standard", "Standarduppgifter"],
                ["schema", "Schemaläggning"],
              ].map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="mina">
          <div className="space-y-4">
            {!meId ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Logga in med din personalprofil för att se dina uppgifter.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <StaffAvatar
                    name={`${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim()}
                    imageUrl={staff?.profile_image_url ?? null}
                    className="h-11 w-11"
                  />
                  <div className="min-w-0 flex-1">
                    <Progress
                      done={myTasks.doneByMe.length}
                      total={myTasks.doneByMe.length + myTasks.mine.length}
                      label={`${staff?.first_name ?? ""} ${staff?.last_name ?? ""}`.trim() || "Mina uppgifter"}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Tilldelade dig
                  </h3>
                  {myTasks.mine.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      Inga uppgifter är tilldelade dig för valt datum.
                    </p>
                  ) : (
                    <div className="border-t border-grid-line">{myTasks.mine.map(renderTaskRow)}</div>
                  )}
                </div>

                {isResponsible && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Du är ansvarig — ingen tilldelad
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {myTasks.unassigned.length}
                      </span>
                    </div>
                    {myTasks.unassigned.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">Allt är tilldelat eller klart.</p>
                    ) : (
                      <div className="border-t border-grid-line">{myTasks.unassigned.map(renderTaskRow)}</div>
                    )}
                  </div>
                )}

                {myTasks.doneByMe.length > 0 && (
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Klara av dig
                    </h3>
                    <div className="border-t border-grid-line">{myTasks.doneByMe.map(renderTaskRow)}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="dag">
          <div className="space-y-4">
            <Progress done={doneCount} total={tasks.length} label="Dagens uppgifter" />
            {left > 0 && <p className="text-xs text-muted-foreground">Beräknad tid kvar: {durationText(left)}</p>}

            {/* Kompakt filterrad — sekundär till uppgifterna */}
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sök uppgift …"
                className="h-9 w-[220px] rounded-full border-0 bg-muted/60 text-sm"
              />
              <Select value={fCat} onValueChange={setFCat}>
                <SelectTrigger className="h-9 w-[150px] border-0 bg-muted/60 text-xs">
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
                <SelectTrigger className="h-9 w-[150px] border-0 bg-muted/60 text-xs">
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
                          className="h-8 w-8"
                        />
                        {s.first_name} {s.last_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex overflow-hidden rounded-full bg-muted/60 text-xs">
                {(["kvar", "klara", "allt"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setFStatus(k)}
                    className={cn(
                      "px-3.5 py-1.5 capitalize",
                      fStatus === k && "bg-foreground text-background font-semibold",
                    )}
                  >
                    {k === "allt" ? "Alla" : k}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                Sortera
                <div className="flex overflow-hidden rounded-full bg-muted/60">
                  {(["tid", "typ"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGroupBy(k)}
                      className={cn(
                        "px-3.5 py-1.5",
                        groupBy === k && "bg-foreground text-background font-semibold",
                      )}
                    >
                      {k === "typ" ? "Typ" : "Tid"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Områden som snabbfilter — samma färger som butikskartan */}
            {zones.length > 0 && (
              <TaskAreaChips
                areas={[...areaOf.values()]}
                counts={zoneCounts}
                selected={fArea}
                onSelect={setFArea}
                totalCount={{ total: tasks.length, done: doneCount }}
              />
            )}

            {tasks.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Inga uppgifter för valt datum. Lägg till en tillfällig uppgift eller skapa dagens checklista.
              </p>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <div key={g.key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.label}
                      </h3>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {g.tasks.filter((t) => t.done).length}/{g.tasks.length}
                      </span>
                    </div>
                    <div className="border-t border-grid-line">
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
                          {renderTaskRow(t)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                          storeId={storeId}
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
                        storeId={storeId}
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

      <NewTaskDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        storeId={storeId}
        day={day}
        areas={newTaskAreas}
        staff={staffList}
        plan={plan}
        zones={zones}
        onCreated={(id) => switchTab(`/uppgift/${id}`)}
      />

      <TaskMapDrawer
        open={mapOpen}
        onOpenChange={setMapOpen}
        plan={plan}
        zones={zones}
        areas={areaOf}
        tasks={tasks}
        zoneId={mapZoneId}
        onZoneChange={(id) => {
          setMapZoneId(id);
          setFArea(id ?? "all");
        }}
        onOpenArea={(id) => switchTab(withReturn(`/butikskarta?zone=${id}`, "/uppgifter", "Uppgifter"))}
        onOpenTask={(id) => switchTab(`/uppgift/${id}`)}
      />

    </div>
  );
}
