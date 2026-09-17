import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTabs } from "@/contexts/TabsContext";
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
import {
  AlertTriangle,
  CalendarDays,
  Copy,
  History,
  ImageIcon,
  Map as MapIcon,
  MapPin as PinIcon,
  Pencil,
  RotateCw,
  Save,
  Trash2,
  Upload,
  ArrowLeft,
  Plus,
} from "lucide-react";
import { todayIso } from "@/hooks/useChecklist";
import { FloorPlanCanvas, type Selection } from "@/components/storemap/FloorPlanCanvas";
import { MapDetailDrawer } from "@/components/storemap/MapDetailDrawer";
import { ZoneAreaPage } from "@/components/storemap/ZoneAreaPage";
import { ObjectLibrary } from "@/components/storemap/ObjectLibrary";
import { MapPinDialog, PIN_KIND_LABEL } from "@/components/storemap/MapPinDialog";
import { MapListViews } from "@/components/storemap/MapListViews";
import { OverviewStatsBar } from "@/components/storemap/OverviewStatsBar";
import { StorePhotoStrip } from "@/components/storemap/StorePhotoStrip";
import { OverviewQuickBar } from "@/components/storemap/OverviewQuickBar";
import { StatusRing } from "@/components/storemap/StatusRing";
import { progressFor, STATUS_COLOR, STATUS_LABEL } from "@/lib/mapStatus";
import { areaOf, derivePxPerMeter, formatSqm } from "@/lib/mapScale";
import { ZONE_PALETTE, nextZoneColor } from "@/lib/mapPalette";
import { bbox, zonePoints } from "@/lib/mapGeometry";
import {
  useEntityImages,
  useFloorPlanImages,
  useStoreAreaImages,
  useUploadEntityImage,
} from "@/hooks/useEntityImages";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useAllowedStores } from "@/components/StoreSwitcher";
import { useDeviations } from "@/hooks/useFoodSafety";
import {
  nextInstanceName,
  useDeleteMapObject,
  useDeleteZone,
  useFloorPlanVersions,
  useFloorPlans,
  useMapObjectTypes,
  useCompleteMapPin,
  useDeleteMapPin,
  useMapObjects,
  useMapPins,
  useMapRealtime,
  useMapTasks,
  useMapWalls,
  useMapZones,
  useStoresWithFloorPlan,
  usePublishFloorPlan,
  useSaveFloorPlan,
  useSaveMapObject,
  useSaveZone,
  type MapObjectType,
  type MapPin,
} from "@/hooks/useStoreMap";

export default function StoreMap() {
  const { site, activeStoreId } = useSite();
  const { staff } = useStaffAuth();
  const stores = useAllowedStores();
  const canManage = (staff?.portal_access ?? []).includes("admin") || !!staff?.is_platform_admin;

  const [pickedStore, setPickedStore] = useState<string | null>(null);
  const { data: planStores = [] } = useStoresWithFloorPlan();
  /** Utan eget val visas den första butiken som verkligen har en ritning. */
  const defaultStore = stores.find((s) => planStores.includes(s.id))?.id ?? stores[0]?.id ?? null;
  const storeId = site === "shop" ? activeStoreId : (pickedStore ?? defaultStore);

  const { data: plans = [], isLoading: plansLoading } = useFloorPlans(storeId);
  const [planId, setPlanId] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans[0] ?? null;

  const { data: zones = [] } = useMapZones(plan?.id ?? null);
  const { data: objects = [] } = useMapObjects(plan?.id ?? null);
  const { data: walls = [] } = useMapWalls(plan?.id ?? null);
  const { data: types = [] } = useMapObjectTypes();
  /** Vald dag — styr uppgifterna och historiken i alla vyer. */
  const [day, setDay] = useState(todayIso());
  const { data: tasks = [] } = useMapTasks(storeId, day);
  const { data: deviations = [] } = useDeviations(false);
  const { data: versions = [] } = useFloorPlanVersions(plan?.id ?? null);
  const { data: pins = [] } = useMapPins(plan?.id ?? null);
  const { data: planImages = [] } = useFloorPlanImages(plan?.id ?? null);
  /**
   * Bildlistan visar butikens alla bilder — både de som placerats på ritningen
   * och de som tagits på butiken eller på en yta utan exakt plats.
   */
  const { data: storeImages = [] } = useEntityImages("store", storeId ?? null);
  const areaImageIds = useMemo(
    () => [...zones.map((z) => z.id), ...objects.map((o) => o.id)],
    [zones, objects],
  );
  const { data: areaImages = [] } = useStoreAreaImages(areaImageIds);
  const allImages = useMemo(() => {
    const seen = new Set<string>();
    return [...planImages, ...areaImages, ...storeImages]
      .filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [planImages, areaImages, storeImages]);
  const uploadImage = useUploadEntityImage();
  useMapRealtime(storeId);

  const saveZone = useSaveZone();
  const saveObject = useSaveMapObject();
  const deleteObject = useDeleteMapObject();
  const deleteZone = useDeleteZone();
  const savePlan = useSaveFloorPlan();
  const publish = usePublishFloorPlan();
  const completePin = useCompleteMapPin();
  const deletePin = useDeleteMapPin();

  const [mode, setMode] = useState<"drift" | "redigera">("drift");
  const [view, setView] = useState("karta");
  const [layers, setLayers] = useState({ background: true, grid: true, tasks: true, issues: true, photos: true });
  /** Ytan man just nu placerar en bild i, tillsammans med den valda filen. */
  const [placing, setPlacing] = useState<{ zoneId: string; file: File } | null>(null);
  const [selected, setSelected] = useState<Selection>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pinMode, setPinMode] = useState(false);
  const [focus, setFocus] = useState<Selection>(null);
  /** Områdets egna sida ligger som en egen flik i butikskartan. */
  const [areaPage, setAreaPage] = useState<Selection>(null);
  const [pinDialog, setPinDialog] = useState<{
    point: { x: number; y: number } | null;
    zoneId: string | null;
    existing: MapPin | null;
  } | null>(null);

  /** Kom man hit från en uppgift? Då markeras ytan och man kan gå direkt tillbaka. */
  const [searchParams, setSearchParams] = useSearchParams();
  const { switchTab } = useTabs();
  const fromZoneId = searchParams.get("zone");
  const fromTaskId = searchParams.get("fromTask");
  const fromTaskName = searchParams.get("taskName");

  const pxPerMeter = useMemo(() => (plan ? derivePxPerMeter(plan, zones, objects) : null), [plan, zones, objects]);
  const totalSqm = useMemo(
    () => zones.reduce((sum, z) => sum + (areaOf(z, pxPerMeter).sqm ?? 0), 0),
    [zones, pxPerMeter],
  );

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

  /** Öppnar och markerar ytan man kom till från en uppgift. */
  useEffect(() => {
    if (!fromZoneId || !zones.some((z) => z.id === fromZoneId)) return;
    setView("karta");
    setSelected({ kind: "zone", id: fromZoneId });
    setFocus({ kind: "zone", id: fromZoneId });
    setDrawerOpen(true);
  }, [fromZoneId, zones]);

  const fromZone = fromZoneId ? zones.find((z) => z.id === fromZoneId) ?? null : null;

  const backToTask = () => {
    setSearchParams({}, { replace: true });
    switchTab(fromTaskId ? `/uppgifter?markera=${fromTaskId}` : "/uppgifter");
  };

  /** Nummerbricka per yta — samma nummer i kartan som i förteckningen under. */
  const zoneNumbers = useMemo(
    () => Object.fromEntries(zones.map((z, i) => [z.id, i + 1])) as Record<string, number>,
    [zones],
  );

  /** Fliknamn för områdets egna sida. */
  const areaPageLabel = (() => {
    if (!areaPage) return "";
    if (areaPage.kind === "zone") {
      const z = zones.find((x) => x.id === areaPage.id);
      return z ? `${zoneNumbers[z.id] ?? ""} ${z.name}`.trim() : "Område";
    }
    const o = objects.find((x) => x.id === areaPage.id);
    return o?.name ?? "Område";
  })();

  /** Färgen på områdesfliken följer ytans egen färg. */
  const areaPageColor = (() => {
    if (!areaPage) return null;
    if (areaPage.kind === "zone") return zones.find((x) => x.id === areaPage.id)?.color ?? null;
    const o = objects.find((x) => x.id === areaPage.id);
    return (o?.zone_id ? zones.find((z) => z.id === o.zone_id)?.color : null) ?? null;
  })();

  /** Öppnar valt områdes egna sida som flik och stänger sidopanelen. */
  const openAreaPage = (target?: Selection) => {
    const next = target ?? selected;
    if (!next) return;
    setAreaPage(next);
    setSelected(null);
    setView("omrade");
  };

  /**
   * Bildmarkörer: riktiga uppladdade bilder som fått en exakt plats i en yta.
   * Ligger flera bilder på nästan samma plats visas de som en markör med antal.
   */
  const photoSpots = useMemo(() => {
    const groups = new Map<string, { id: string; zoneId: string; norm: { x: number; y: number }; count: number; url: string }>();
    planImages.forEach((img) => {
      if (img.norm_x == null || img.norm_y == null) return;
      const zoneId = img.entity_type === "map_zone" ? img.entity_id : null;
      if (!zoneId || !zones.some((z) => z.id === zoneId)) return;
      const key = `${zoneId}:${Math.round(img.norm_x * 20)}:${Math.round(img.norm_y * 20)}`;
      const found = groups.get(key);
      if (found) found.count += 1;
      else groups.set(key, { id: img.id, zoneId, norm: { x: img.norm_x, y: img.norm_y }, count: 1, url: img.url });
    });
    return [...groups.values()];
  }, [planImages, zones]);

  /**
   * Nytt område: läggs som en ruta på en ledig plats i kartan, får nästa färg
   * i paletten och öppnas direkt i redigeringsläget så namn och form kan sättas.
   */
  const addZone = () => {
    if (!plan || !storeId) return;
    const step = 24 * (zones.length % 6);
    saveZone.mutate(
      {
        floor_plan_id: plan.id,
        store_id: storeId,
        name: `Nytt område ${zones.length + 1}`,
        color: nextZoneColor(zones.map((z) => z.color)),
        x: 60 + step,
        y: 60 + step,
        width: 220,
        height: 160,
      },
      {
        onSuccess: (id) => {
          setMode("redigera");
          setView("karta");
          setSelected({ kind: "zone", id: id as string });
          setDraftZoneId(id as string);
          setSheetZoneId(null);
        },
        onError: (e) =>
          toast({ title: "Kunde inte skapa området", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  /** Sparar uppgifterna från sidopanelen på området. */
  const saveZoneDetails = (values: {
    name: string;
    zone_kind: string | null;
    area_sqm: number | null;
    color: string;
    description: string | null;
  }) => {
    const id = sheetZoneId;
    if (!id) return;
    saveZone.mutate(
      { id, ...values },
      {
        onSuccess: () => {
          setSheetZoneId(null);
          setDraftZoneId(null);
          toast({ title: "Området är sparat", description: values.name });
        },
        onError: (e) =>
          toast({ title: "Kunde inte spara området", description: (e as Error).message, variant: "destructive" }),
      },
    );
  };

  const addObject = (t: MapObjectType) => {
    if (!plan) return;
    const zone = selectedZone ?? zones[0];
    saveObject.mutate({
      floor_plan_id: plan.id,
      zone_id: zone?.id ?? null,
      object_type_id: t.id,
      name: nextInstanceName(t.name, objects),
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
    <div className="space-y-4">
      {/* Stora knappar och dagens stapel högst upp */}
      <OverviewQuickBar tasks={tasks} />

      {/* Viktig statistik högst upp — vilka som arbetar, stämpling, checklistor, avvikelser */}
      <OverviewStatsBar
        storeId={storeId}
        openTasks={tasks.filter((t) => !t.done).length}
        openDeviations={Object.values(issuesByEntity).reduce((a, b) => a + b, 0)}
        totalSqm={totalSqm}
      />

      {/* Bilder från butiken — senaste bilderna som en rad man kan bläddra i */}
      <StorePhotoStrip
        storeId={storeId}
        planId={plan?.id ?? null}
        planImages={planImages}
        zones={zones}
        objects={objects}
        onOpenZone={(id) => { setAreaPage({ kind: "zone", id }); setView("omrade"); }}
      />



      {/* Rubrikrad — stor titel, butik under, läge till höger */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-primary" />
            Översikt
          </h1>
          {site !== "shop" && stores.length > 0 ? (
            <Select value={storeId} onValueChange={(v) => { setPickedStore(v); setPlanId(null); }}>
              <SelectTrigger className="h-7 border-0 px-0 text-sm text-muted-foreground shadow-none focus:ring-0">
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
          ) : (
            <p className="text-sm text-muted-foreground">{stores.find((s) => s.id === storeId)?.name ?? ""}</p>
          )}
        </div>
        {plans.length > 1 && (
          <Select value={plan?.id ?? ""} onValueChange={setPlanId}>
            <SelectTrigger className="h-8 w-40 rounded-full text-xs">
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
        {/* Vyväljare — samma fem vyer för hela butiken */}
        <Tabs value={view} onValueChange={setView}>
          <TabsList className="h-10 rounded-xl bg-muted p-1">
            {(
              [
                ["karta", "Karta"],
                ["uppgifter", "Uppgifter"],
                ["bilder", "Bilder"],
                ["avvikelser", "Avvikelser"],
                ["historik", "Historik"],
              ] as const
            ).map(([key, label]) => (
              <TabsTrigger
                key={key}
                value={key}
                className="h-8 rounded-lg px-4 text-xs font-medium text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-md"
              >
                {label}
              </TabsTrigger>
            ))}
            {areaPage && (
              <TabsTrigger
                value="omrade"
                className="h-8 max-w-[180px] gap-2 rounded-lg px-4 text-xs data-[state=active]:text-white"
                style={
                  areaPageColor && view === "omrade"
                    ? { background: areaPageColor, boxShadow: `0 0 0 2px ${areaPageColor}33` }
                    : undefined
                }
              >
                {areaPageColor && (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: view === "omrade" ? "#fff" : areaPageColor }}
                  />
                )}
                <span className="truncate">{areaPageLabel}</span>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-3">
          {/* Dagväljare — styr vilka uppgifter och vilken historik som visas */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || todayIso())}
              className="bg-transparent text-xs outline-none tabular-nums"
            />
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5">
            <StatusRing percent={dayProgress.percent} status={dayProgress.status} label={`${dayProgress.percent}%`} />
            <div className="leading-tight">
              <p className="text-[11px] font-medium">{STATUS_LABEL[dayProgress.status]}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">
                {dayProgress.done}/{dayProgress.total} uppgifter
              </p>
            </div>
          </div>
          {canManage && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <TabsList className="h-9 rounded-full bg-muted p-1">
                <TabsTrigger value="drift" className="h-7 rounded-full px-4 text-xs">Visa</TabsTrigger>
                <TabsTrigger value="redigera" className="h-7 gap-1 rounded-full px-4 text-xs">
                  <Pencil className="h-3 w-3" /> Redigera
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </div>


      {fromZone && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border-2 px-4 py-3"
          style={{ borderColor: fromZone.color, background: `${fromZone.color}14` }}
        >
          <span
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: fromZone.color }}
          >
            {zoneNumbers[fromZone.id] ?? ""}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{fromZone.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {fromTaskName ? `Yta för: ${fromTaskName}` : "Ytan är markerad på kartan"}
            </p>
          </div>
          <Button size="lg" className="ml-auto gap-2" onClick={backToTask}>
            <ArrowLeft className="h-4 w-4" /> Tillbaka till uppgiften
          </Button>
        </div>
      )}

      {plansLoading ? (
        <p className="text-xs text-muted-foreground">Hämtar ritning…</p>
      ) : !plan ? (
        <EmptyState
          title="Ingen ritning ännu"
          description="En administratör lägger upp butikens planritning innan kartan kan användas."
        />
      ) : areaPage && view === "omrade" ? (
        (() => {
          const pageZone = areaPage.kind === "zone" ? zones.find((z) => z.id === areaPage.id) ?? null : null;
          const pageObject = areaPage.kind === "object" ? objects.find((o) => o.id === areaPage.id) ?? null : null;
          const target = pageObject ?? pageZone;
          const area = target ? areaOf(target, pxPerMeter) : null;
          return (
            <ZoneAreaPage
              storeId={storeId}
              portal={site}
              zone={pageZone}
              object={pageObject}
              objectType={pageObject ? typeById[pageObject.object_type_id] : null}
              tasks={pageObject ? tasksForObject(pageObject.id) : pageZone ? tasksForZone(pageZone.id) : []}
              canManage={canManage}
              zoneNumber={pageZone ? zoneNumbers[pageZone.id] : undefined}
              areaLabel={area?.sqm != null ? `${area.exact ? "" : "≈ "}${formatSqm(area.sqm)}` : null}
              onBack={() => {
                setAreaPage(null);
                setView("karta");
              }}
            />
          );
        })()
      ) : view !== "karta" ? (
        <MapListViews
          view={view}
          zones={zones}
          objects={objects}
          tasks={tasks}
          deviations={deviations as never}
          images={allImages}
          versions={versions as never}
          zoneNumbers={zoneNumbers}
          onOpenZone={(id) => {
            setSelected({ kind: "zone", id });
            setView("karta");
            setFocus({ kind: "zone", id });
            setDrawerOpen(true);
          }}
        />
      ) : (
        <div className={`grid gap-4 ${editMode ? "lg:grid-cols-[1fr_340px]" : ""}`}>
          <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            {/* Kartans egen rad: bara det man behöver, resten ligger i redigeringsläget */}
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2">
              {(
                editMode
                  ? ([
                      ["background", "Ritning"],
                      ["grid", "Rutnät"],
                      ["tasks", "Uppgifter"],
                      ["issues", "Anmärkningar"],
                      ["photos", "Bilder"],
                    ] as const)
                  : ([
                      ["grid", "Rutnät"],
                      ["photos", "Bilder"],
                    ] as const)
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
              {canManage && (
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] gap-1"
                    onClick={() => addZone()}
                    disabled={saveZone.isPending}
                  >
                    <Plus className="h-3 w-3" />
                    Nytt område
                  </Button>
                  <Button
                    size="sm"
                    variant={pinMode ? "default" : "outline"}
                    className="h-7 text-[11px] gap-1"
                    onClick={() => setPinMode((v) => !v)}
                  >
                    <PinIcon className="h-3 w-3" />
                    {pinMode ? "Tryck på kartan…" : "Ny punkt"}
                  </Button>
                </div>
              )}
              <span className={`text-[10px] text-muted-foreground tabular-nums ${canManage ? "" : "ml-auto"}`}>
                {pxPerMeter ? `Yta ${formatSqm(totalSqm)}` : "Skala saknas — fyll i kvm på en zon"}
              </span>
              {plan.status === "draft" && (
                <Badge variant="outline" className="text-[10px]">Utkast — ej publicerad</Badge>
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
              onOpenArea={(s) => openAreaPage(s)}
              onSelect={(s) => {
                setSelected(s);
                if (s && !editMode) {
                  setFocus(s);
                  setDrawerOpen(true);
                }
              }}
              focus={editMode ? null : focus}
              onExitFocus={() => {
                setFocus(null);
                setDrawerOpen(false);
              }}
              editMode={editMode}
              showBackground={layers.background}
              showGrid={layers.grid || editMode}
              showObjects={editMode}
              showPins={editMode || pinMode}
              zoneNumbers={zoneNumbers}
              photoSpots={photoSpots}
              showPhotos={layers.photos}
              placeZoneId={placing?.zoneId ?? null}
              onPlacePhoto={async (zoneId, norm) => {
                if (!placing) return;
                const file = placing.file;
                setPlacing(null);
                try {
                  await uploadImage.mutateAsync({
                    entityType: "map_zone",
                    entityId: zoneId,
                    file,
                    imageKind: "general",
                    floorPlanId: plan.id,
                    norm,
                  });
                  toast({ title: "Bilden ligger nu på sin plats i kartan" });
                } catch (e) {
                  toast({ title: "Kunde inte spara bilden", description: (e as Error).message, variant: "destructive" });
                }
              }}
              onPhotoSpotSelect={(zoneId) => {
                setSelected({ kind: "zone", id: zoneId });
                setDrawerOpen(true);
              }}
              onZonePointsCommit={(id, points) => {
                const b = bbox(points);
                saveZone.mutate({ id, points, x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
              }}
              pins={pins}
              pinMode={pinMode}
              pxPerMeter={pxPerMeter}
              onPinPlace={({ x, y, zoneId }) => {
                setPinDialog({ point: { x, y }, zoneId, existing: null });
                setPinMode(false);
              }}
              onPinSelect={(pin) => setPinDialog({ point: null, zoneId: pin.zone_id, existing: pin })}
              onCommit={({ kind, id, x, y, width, height }) =>
                kind === "zone"
                  ? saveZone.mutate({ id, x, y, width, height })
                  : saveObject.mutate({ id, x, y, width, height })
              }
            />

            {placing && (
              <p className="border-t border-primary/40 bg-primary/5 px-3 py-2 text-[11px]">
                Tryck på platsen inne i ytan där bilden är tagen.{" "}
                <button className="underline" onClick={() => setPlacing(null)}>
                  Avbryt
                </button>
              </p>
            )}

            {/* Ytförteckning — samma nummer och färg som i kartan, en rad under kartan */}
            <div className="flex gap-1 overflow-x-auto border-t border-border px-3 py-3">
              {zones.map((z) => {
                const p = zoneProgress[z.id];
                const photos = photoSpots.filter((s) => s.zoneId === z.id).reduce((a, s) => a + s.count, 0);
                const sqm = areaOf(z, pxPerMeter);
                return (
                  <div
                    key={z.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelected({ kind: "zone", id: z.id });
                      setFocus({ kind: "zone", id: z.id });
                      setDrawerOpen(true);
                    }}
                    className="group flex shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-muted"
                  >
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white shadow-sm"
                      style={{ background: z.color ?? "hsl(var(--primary))" }}
                    >
                      {zoneNumbers[z.id]}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold leading-tight">{z.name}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                        {sqm.sqm != null ? `${sqm.exact ? "" : "≈ "}${formatSqm(sqm.sqm)}` : `${p.done}/${p.total} klart`}
                        {p.openIssues > 0 && <span className="text-destructive"> · {p.openIssues} anm.</span>}
                      </p>
                    </div>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: STATUS_COLOR[p.status] }}
                      title={STATUS_LABEL[p.status]}
                    />
                    <label
                      className="cursor-pointer rounded-full border border-border px-2 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                      title="Ta eller välj en bild och peka ut var i ytan den hör hemma"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Bild{photos > 0 ? ` ${photos}` : ""}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) setPlacing({ zoneId: z.id, file: f });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Höger panel: bara i redigeringsläget, annars ligger kartan i full bredd */}
          {editMode && (
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
                      <div className="space-y-1">
                        <Label className="text-[10px]">Yta i kvadratmeter</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          min="0"
                          defaultValue={selectedObject.area_sqm ?? ""}
                          placeholder={formatSqm(areaOf(selectedObject, pxPerMeter).sqm)}
                          onBlur={(e) =>
                            saveObject.mutate({
                              id: selectedObject.id,
                              area_sqm: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")),
                            })
                          }
                          className="h-7 text-xs"
                        />
                      </div>
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
                    <CardTitle className="text-xs">Ytor: kvadratmeter och färg</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      Fyll i den uppmätta ytan. Skalan räknas fram och övriga rutor får uppskattad yta.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 w-full text-[11px] gap-1"
                      onClick={() => addZone()}
                      disabled={saveZone.isPending}
                    >
                      <Plus className="h-3 w-3" /> Nytt område
                    </Button>
                    {zones.map((z) => (
                      <div key={z.id} className="space-y-1 border-b border-border pb-1.5 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] tabular-nums text-muted-foreground">{zoneNumbers[z.id]}.</span>
                          <Input
                            defaultValue={z.name}
                            onBlur={(e) =>
                              e.target.value.trim() &&
                              e.target.value !== z.name &&
                              saveZone.mutate({ id: z.id, name: e.target.value.trim() })
                            }
                            className="h-7 flex-1 text-xs"
                          />
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            defaultValue={z.area_sqm ?? ""}
                            placeholder={formatSqm(areaOf(z, pxPerMeter).sqm)}
                            onBlur={(e) =>
                              saveZone.mutate({
                                id: z.id,
                                area_sqm: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")),
                              })
                            }
                            className="h-7 w-20 text-xs tabular-nums"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          {ZONE_PALETTE.map((c) => (
                            <button
                              key={c.key}
                              title={c.name}
                              onClick={() => saveZone.mutate({ id: z.id, color: c.color })}
                              className={`h-4 w-4 rounded-full border ${
                                (z.color ?? "").toLowerCase() === c.color.toLowerCase()
                                  ? "border-foreground ring-1 ring-foreground"
                                  : "border-border"
                              }`}
                              style={{ background: c.color }}
                            />
                          ))}
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {zonePoints(z).length} hörn
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-[10px] text-destructive"
                            title="Ta bort området"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Ta bort ${z.name}? Uppgifter och bilder som hör till ytan tappar sin plats i kartan.`,
                                )
                              )
                                return;
                              deleteZone.mutate(z.id, {
                                onSuccess: () => {
                                  setSelected(null);
                                  setFocus(null);
                                  toast({ title: `${z.name} är borttagen` });
                                },
                                onError: (e) =>
                                  toast({
                                    title: "Kunde inte ta bort området",
                                    description: (e as Error).message,
                                    variant: "destructive",
                                  }),
                              });
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

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
            ) : selectedZone || selectedObject ? (
              /* Vald yta ligger kvar bredvid kartan — kartan syns hela tiden */
              <MapDetailDrawer
                inline
                open
                onOpenChange={(v) => {
                  if (!v) {
                    setSelected(null);
                    setFocus(null);
                    setDrawerOpen(false);
                  }
                }}
                storeId={storeId}
                portal={site}
                zone={selectedZone}
                object={selectedObject}
                objectType={selectedObject ? typeById[selectedObject.object_type_id] : null}
                tasks={selectedObject ? tasksForObject(selectedObject.id) : selectedZone ? tasksForZone(selectedZone.id) : []}
                unlinkedTasks={unlinkedTasks}
                canManage={canManage}
                onOpenPage={() => openAreaPage()}
          zoneNumber={selectedZone ? zoneNumbers[selectedZone.id] : undefined}
                areaLabel={
                  selectedZone
                    ? areaOf(selectedZone, pxPerMeter).sqm != null
                      ? `${areaOf(selectedZone, pxPerMeter).exact ? "" : "≈ "}${formatSqm(areaOf(selectedZone, pxPerMeter).sqm)}`
                      : null
                    : selectedObject && areaOf(selectedObject, pxPerMeter).sqm != null
                      ? formatSqm(areaOf(selectedObject, pxPerMeter).sqm)
                      : null
                }
              />
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs">Behöver åtgärd</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    Tryck på en yta i kartan för att se bilder, uppgifter och information.
                  </p>
                  {tasks
                    .filter((t) => !t.done)
                    .slice(0, 12)
                    .map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          const target: Selection = t.map_object_id
                            ? { kind: "object", id: t.map_object_id }
                            : t.zone_id
                              ? { kind: "zone", id: t.zone_id }
                              : null;
                          setSelected(target);
                          setFocus(target);
                          setDrawerOpen(true);
                        }}
                        className="w-full text-left text-[11px] rounded-md border border-border px-2 py-1 hover:bg-muted"
                      >
                        <span className="truncate block">{t.task}</span>
                        <span className="text-[10px] text-muted-foreground">{t.section}</span>
                      </button>
                    ))}
                </CardContent>
              </Card>
            )}

            {(editMode || pins.length > 0) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs flex items-center gap-1">
                    <PinIcon className="h-3.5 w-3.5" /> Punkter på kartan
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {pins.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      Tryck på “Ny punkt” och sedan på platsen i kartan.
                    </p>
                  )}
                  {pins.slice(0, 20).map((pin) => (
                    <div key={pin.id} className="rounded-md border border-border p-2 space-y-1">
                      <div className="flex items-start gap-2">
                        <button
                          className="text-left min-w-0 flex-1"
                          onClick={() => setPinDialog({ point: null, zoneId: pin.zone_id, existing: pin })}
                        >
                          <p className={`text-[11px] font-medium truncate ${pin.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                            {pin.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {PIN_KIND_LABEL[pin.kind] ?? pin.kind}
                            {pin.assigned_name ? ` · ${pin.assigned_name}` : " · ingen ansvarig"}
                            {pin.due_date ? ` · till ${pin.due_date}` : ""}
                          </p>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1 text-[10px]"
                          onClick={() => completePin.mutate({ id: pin.id, done: pin.status !== "done" })}
                        >
                          {pin.status === "done" ? "Öppna" : "Klar"}
                        </Button>
                        {canManage && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-1 text-[10px] text-destructive"
                            onClick={() => deletePin.mutate(pin.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
          )}
        </div>
      )}

      {/* Vald yta glider in från höger, kartan ligger kvar i full bredd bakom */}
      {!editMode && (selectedZone || selectedObject) && (
        <MapDetailDrawer
          open
          onOpenChange={(v) => {
            if (!v) {
              setSelected(null);
              setFocus(null);
              setDrawerOpen(false);
            }
          }}
          storeId={storeId}
          portal={site}
          zone={selectedZone}
          object={selectedObject}
          objectType={selectedObject ? typeById[selectedObject.object_type_id] : null}
          tasks={selectedObject ? tasksForObject(selectedObject.id) : selectedZone ? tasksForZone(selectedZone.id) : []}
          unlinkedTasks={unlinkedTasks}
          canManage={canManage}
          onOpenPage={() => openAreaPage()}
          zoneNumber={selectedZone ? zoneNumbers[selectedZone.id] : undefined}
          areaLabel={
            selectedZone
              ? areaOf(selectedZone, pxPerMeter).sqm != null
                ? `${areaOf(selectedZone, pxPerMeter).exact ? "" : "≈ "}${formatSqm(areaOf(selectedZone, pxPerMeter).sqm)}`
                : null
              : selectedObject && areaOf(selectedObject, pxPerMeter).sqm != null
                ? formatSqm(areaOf(selectedObject, pxPerMeter).sqm)
                : null
          }
        />
      )}


      {plan && pinDialog && (
        <MapPinDialog
          open
          onOpenChange={(v) => !v && setPinDialog(null)}
          storeId={storeId}
          planId={plan.id}
          point={pinDialog.point}
          zoneId={pinDialog.zoneId}
          existing={pinDialog.existing}
        />
      )}

    </div>
  );
}
