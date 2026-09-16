import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { Copy, History, Map as MapIcon, Pencil, RotateCw, Save, Trash2, Upload } from "lucide-react";
import { FloorPlanCanvas, type Selection } from "@/components/storemap/FloorPlanCanvas";
import { MapDetailDrawer } from "@/components/storemap/MapDetailDrawer";
import { ObjectLibrary } from "@/components/storemap/ObjectLibrary";
import { StatusRing } from "@/components/storemap/StatusRing";
import { progressFor, STATUS_COLOR, STATUS_LABEL } from "@/lib/mapStatus";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAllowedStores } from "@/components/StoreSwitcher";
import { useDeviations } from "@/hooks/useFoodSafety";
import {
  nextInstanceName,
  useDeleteMapObject,
  useFloorPlanVersions,
  useFloorPlans,
  useMapObjectTypes,
  useMapObjects,
  useMapRealtime,
  useMapTasks,
  useMapWalls,
  useMapZones,
  usePublishFloorPlan,
  useSaveFloorPlan,
  useSaveMapObject,
  useSaveZone,
  type MapObjectType,
} from "@/hooks/useStoreMap";

export default function StoreMap() {
  const { site, activeStoreId } = useSite();
  const { staff } = useStaffAuth();
  const stores = useAllowedStores();
  const canManage = (staff?.portal_access ?? []).includes("admin") || !!staff?.is_platform_admin;

  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const storeId = site === "shop" ? activeStoreId : (pickedStore ?? stores[0]?.id ?? null);

  const { data: plans = [], isLoading: plansLoading } = useFloorPlans(storeId);
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans[0] ?? null;

  const { data: zones = [] } = useMapZones(plan?.id ?? null);
  const { data: objects = [] } = useMapObjects(plan?.id ?? null);
  const { data: walls = [] } = useMapWalls(plan?.id ?? null);
  const { data: types = [] } = useMapObjectTypes();
  const { data: tasks = [] } = useMapTasks(storeId);
  const { data: deviations = [] } = useDeviations(false);
  const { data: versions = [] } = useFloorPlanVersions(plan?.id ?? null);
  useMapRealtime(storeId);

  const saveZone = useSaveZone();
  const saveObject = useSaveMapObject();
  const deleteObject = useDeleteMapObject();
  const savePlan = useSaveFloorPlan();
  const publish = usePublishFloorPlan();

  const [mode, setMode] = useState<"drift" | "redigera">("drift");
  const [layers, setLayers] = useState({ background: true, grid: false, tasks: true, issues: true });
  const [selected, setSelected] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const typeById = useMemo(() => Object.fromEntries(types.map((t) => [t.id, t])) as Record<string, MapObjectType>, [types]);
  const editMode = mode === "redigera" && canManage;

  const issuesByEntity = useMemo(() => {
    const m: Record<string, number> = {};
    (deviations as { source?: string; source_id?: string | null }[]).forEach((d) => {
      if (!d.source_id) return;
      if (d.source === "map_zone" || d.source === "map_object") m[d.source_id] = (m[d.source_id] ?? 0) + 1;
    });
    return m;
  }, [deviations]);

  const tasksForZone = (zoneId: string) => (layers.tasks ? tasks.filter((t) => t.zone_id === zoneId) : []);
  const tasksForObject = (objectId: string) => (layers.tasks ? tasks.filter((t) => t.map_object_id === objectId) : []);

  const zoneProgress = useMemo(
    () =>
      Object.fromEntries(
        zones.map((z) => [z.id, progressFor(tasksForZone(z.id), layers.issues ? (issuesByEntity[z.id] ?? 0) : 0)]),
      ),
    [zones, tasks, issuesByEntity, layers],
  );
  const objectProgress = useMemo(
    () =>
      Object.fromEntries(
        objects.map((o) => [o.id, progressFor(tasksForObject(o.id), layers.issues ? (issuesByEntity[o.id] ?? 0) : 0)]),
      ),
    [objects, tasks, issuesByEntity, layers],
  );

  const dayProgress = progressFor(
    tasks,
    Object.values(issuesByEntity).reduce((a, b) => a + b, 0),
  );

  const selectedZone = selected?.kind === "zone" ? zones.find((z) => z.id === selected.id) ?? null : null;
  const selectedObject = selected?.kind === "object" ? objects.find((o) => o.id === selected.id) ?? null : null;
  const unlinkedTasks = tasks.filter((t) => !t.zone_id && !t.map_object_id);

  const addObject = (t: MapObjectType) => {
    if (!plan) return;
    const zone = selectedZone ?? zones[0];
    saveObject.mutate({
      floor_plan_id: plan.id,
      zone_id: zone?.id ?? null,
      object_type_id: t.id,
      name: nextInstanceName(t.name, objects.map((o) => o.name)),
      x: (zone?.x ?? 40) + 20,
      y: (zone?.y ?? 40) + 40,
      width: t.default_width,
      height: t.default_height,
      rotation: 0,
    });
  };

  const uploadBackground = async (file: File) => {
    if (!plan) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const path = `floor-plans/${plan.id}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) return toast({ title: "Uppladdning misslyckades", description: error.message, variant: "destructive" });
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    savePlan.mutate({ id: plan.id, background_url: data.publicUrl });
  };

  if (!storeId) {
    return <EmptyState title="Välj butik" description="Butikskartan visas per butik. Välj butik för att fortsätta." />;
  }

  return (
    <div className="space-y-3">
      {/* Rubrikrad — status för dagen, samma språk som checklistan */}
      <div className="flex flex-wrap items-center gap-3">
        <MapIcon className="h-4 w-4 text-primary" />
        <h1 className="text-base font-semibold">Butikskarta</h1>
        {site !== "shop" && stores.length > 0 && (
          <Select value={storeId} onValueChange={(v) => { setPickedStore(v); setPlanId(null); }}>
            <SelectTrigger className="h-7 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {plans.length > 1 && (
          <Select value={plan?.id ?? ""} onValueChange={setPlanId}>
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <StatusRing percent={dayProgress.percent} status={dayProgress.status} label={`${dayProgress.percent}%`} />
            <div className="leading-tight">
              <p className="text-[11px] font-medium">{STATUS_LABEL[dayProgress.status]}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {dayProgress.done}/{dayProgress.total} uppgifter idag
              </p>
            </div>
          </div>
          {canManage && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="h-7">
                <TabsTrigger value="drift" className="text-[11px] h-6">Drift</TabsTrigger>
                <TabsTrigger value="redigera" className="text-[11px] h-6 gap-1">
                  <Pencil className="h-3 w-3" /> Redigera
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>

      {plansLoading ? (
        <p className="text-xs text-muted-foreground">Hämtar ritning…</p>
      ) : !plan ? (
        <EmptyState
          title="Ingen ritning ännu"
          description="En administratör lägger upp butikens planritning innan kartan kan användas."
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
          <div className="space-y-2 min-w-0">
            {/* Lagerväljare */}
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-2 py-1.5">
              {(
                [
                  ["background", "Ritning"],
                  ["grid", "Rutnät"],
                  ["tasks", "Uppgifter"],
                  ["issues", "Anmärkningar"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-1.5">
                  <Switch
                    id={`layer-${key}`}
                    checked={layers[key]}
                    onCheckedChange={(v) => setLayers((l) => ({ ...l, [key]: v }))}
                    className="scale-75"
                  />
                  <Label htmlFor={`layer-${key}`} className="text-[11px] cursor-pointer">
                    {label}
                  </Label>
                </div>
              ))}
              {plan.status === "draft" && (
                <Badge variant="outline" className="ml-auto text-[10px]">Utkast — ej publicerad</Badge>
              )}
            </div>

            <FloorPlanCanvas
              plan={plan}
              zones={zones}
              objects={objects}
              walls={walls}
              types={typeById}
              zoneProgress={zoneProgress}
              objectProgress={objectProgress}
              selected={selected}
              onSelect={(s) => {
                setSelected(s);
                if (s && !editMode) setDrawerOpen(true);
              }}
              editMode={editMode}
              showBackground={layers.background}
              showGrid={layers.grid || editMode}
              onCommit={({ kind, id, x, y, width, height }) =>
                kind === "zone"
                  ? saveZone.mutate({ id, x, y, width, height })
                  : saveObject.mutate({ id, x, y, width, height })
              }
            />

            {/* Zonöversikt */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {zones.map((z) => {
                const p = zoneProgress[z.id];
                return (
                  <button
                    key={z.id}
                    onClick={() => {
                      setSelected({ kind: "zone", id: z.id });
                      setDrawerOpen(true);
                    }}
                    className="flex items-center gap-2 rounded-md border border-border p-2 text-left hover:bg-muted"
                  >
                    <StatusRing percent={p.percent} status={p.status} label={`${p.percent}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{z.name}</p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {p.done}/{p.total} klart
                        {p.openIssues > 0 && (
                          <span className="text-destructive"> · {p.openIssues} anm.</span>
                        )}
                      </p>
                    </div>
                    <span className="ml-auto h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[p.status] }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Höger panel */}
          <div className="space-y-3">
            {editMode ? (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Objektbibliotek</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ObjectLibrary types={types} onAdd={addObject} />
                  </CardContent>
                </Card>

                {selectedObject && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-xs">{selectedObject.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Input
                        defaultValue={selectedObject.name}
                        onBlur={(e) => saveObject.mutate({ id: selectedObject.id, name: e.target.value })}
                        className="h-7 text-xs"
                      />
                      <Select
                        value={selectedObject.zone_id ?? "none"}
                        onValueChange={(v) =>
                          saveObject.mutate({ id: selectedObject.id, zone_id: v === "none" ? null : v })
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue placeholder="Zon" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none" className="text-xs">Ingen zon</SelectItem>
                          {zones.map((z) => (
                            <SelectItem key={z.id} value={z.id} className="text-xs">{z.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="grid grid-cols-3 gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() =>
                            saveObject.mutate({ id: selectedObject.id, rotation: (selectedObject.rotation + 45) % 360 })
                          }
                        >
                          <RotateCw className="h-3 w-3" /> 45°
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1"
                          onClick={() =>
                            saveObject.mutate({
                              floor_plan_id: plan.id,
                              zone_id: selectedObject.zone_id,
                              object_type_id: selectedObject.object_type_id,
                              name: nextInstanceName(
                                typeById[selectedObject.object_type_id]?.name ?? selectedObject.name,
                                objects,
                              ),
                              x: selectedObject.x + 16,
                              y: selectedObject.y + 16,
                              width: selectedObject.width,
                              height: selectedObject.height,
                              rotation: selectedObject.rotation,
                            })
                          }
                        >
                          <Copy className="h-3 w-3" /> Kopia
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[11px] gap-1 text-destructive"
                          onClick={() => {
                            deleteObject.mutate(selectedObject.id);
                            setSelected(null);
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Ta bort
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs">Ritning</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer rounded-md border border-border px-2 py-1">
                      <Upload className="h-3.5 w-3.5" /> Byt bakgrundsbild
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(e) => e.target.files?.[0] && uploadBackground(e.target.files[0])}
                      />
                    </label>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Bakgrundens genomskinlighet</Label>
                      <Input
                        type="number"
                        step="0.05"
                        min="0"
                        max="1"
                        defaultValue={plan.background_opacity}
                        onBlur={(e) => savePlan.mutate({ id: plan.id, background_opacity: Number(e.target.value) })}
                        className="h-7 text-xs"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-7 w-full text-[11px] gap-1"
                      onClick={() =>
                        publish.mutate(
                          plan.id,
                          { onSuccess: () => toast({ title: "Kartan är publicerad" }) },
                        )
                      }
                    >
                      <Save className="h-3 w-3" /> Publicera
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs flex items-center gap-1">
                      <History className="h-3.5 w-3.5" /> Versioner
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {versions.length === 0 && <p className="text-[11px] text-muted-foreground">Ingen version sparad.</p>}
                    {versions.slice(0, 8).map((v) => (
                      <div key={v.id} className="text-[11px] flex items-center justify-between">
                        <span>v{v.version}</span>
                        <span className="text-muted-foreground">
                          {new Date(v.created_at).toLocaleDateString("sv-SE")} · {v.published_by_name ?? "—"}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs">Behöver åtgärd</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  {tasks.filter((t) => !t.done).length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Allt är klart just nu.</p>
                  ) : (
                    tasks
                      .filter((t) => !t.done)
                      .slice(0, 12)
                      .map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            if (t.map_object_id) setSelected({ kind: "object", id: t.map_object_id });
                            else if (t.zone_id) setSelected({ kind: "zone", id: t.zone_id });
                            setDrawerOpen(true);
                          }}
                          className="w-full text-left text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted"
                        >
                          <span className="truncate block">{t.task}</span>
                          <span className="text-[10px] text-muted-foreground">{t.section}</span>
                        </button>
                      ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {(selectedZone || selectedObject) && (
        <MapDetailDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          storeId={storeId}
          portal={site}
          zone={selectedZone}
          object={selectedObject}
          objectType={selectedObject ? typeById[selectedObject.object_type_id] : null}
          tasks={selectedObject ? tasksForObject(selectedObject.id) : selectedZone ? tasksForZone(selectedZone.id) : []}
          unlinkedTasks={unlinkedTasks}
          canManage={canManage}
        />
      )}
    </div>
  );
}
