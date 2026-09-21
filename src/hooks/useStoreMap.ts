import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { todayIso } from "@/hooks/useChecklist";

/**
 * Butikskartan läser och skriver mot befintliga ERP-tabeller.
 *
 * Nytt här är bara kartans egna entiteter (planritning, väggar, zoner,
 * objekttyper och objekt). Uppgifter, bilder, avvikelser, personer och logg
 * kommer från de tabeller resten av systemet redan använder.
 */

export type FloorPlan = {
  id: string;
  store_id: string;
  name: string;
  floor_label: string | null;
  background_url: string | null;
  background_opacity: number;
  background_scale: number;
  background_x: number;
  background_y: number;
  background_locked: boolean;
  width: number;
  height: number;
  grid_size: number;
  status: string;
  published_at: string | null;
  px_per_meter: number | null;
};

export type MapZone = {
  id: string;
  floor_plan_id: string;
  store_id: string;
  name: string;
  zone_key: string | null;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  sort_order: number;
  area_sqm: number | null;
  /** Vad området används till, t.ex. beredning eller kyl. */
  zone_kind: string | null;
  /** Fritext: vad som finns här och vad man behöver veta. */
  description: string | null;
  /** Polygon i planens koordinater. Saknas den används rektangeln ovan. */
  points: { x: number; y: number }[] | null;
};

export type MapObjectType = {
  id: string;
  key: string;
  name: string;
  category: string;
  icon: string | null;
  shape: string;
  default_width: number;
  default_height: number;
  color: string | null;
  recommended_tasks: string[];
  supports_temperature: boolean;
  sort_order: number;
};

export type MapObject = {
  id: string;
  floor_plan_id: string;
  store_id: string;
  zone_id: string | null;
  object_type_id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  note: string | null;
  control_point_id: string | null;
  area_sqm: number | null;
};

/** Punkt på kartan: anteckning eller uppgift lagd på en person. */
export type MapPin = {
  id: string;
  floor_plan_id: string;
  store_id: string;
  zone_id: string | null;
  map_object_id: string | null;
  x: number;
  y: number;
  kind: string;
  title: string;
  body: string | null;
  assigned_staff_id: string | null;
  assigned_name: string | null;
  due_date: string | null;
  status: string;
  created_by_name: string | null;
  done_at: string | null;
  done_by_name: string | null;
  created_at: string;
  /** Rutan punkten gäller, markerad genom att dra på kartan. */
  area_x: number | null;
  area_y: number | null;
  area_width: number | null;
  area_height: number | null;
};

export type MapWall = {
  id: string;
  floor_plan_id: string;
  kind: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  label: string | null;
};

/** Uppgift ur den befintliga checklistan, kopplad till zon eller objekt. */
export type MapTask = {
  id: string;
  day_id: string;
  task: string;
  section: string;
  time_label: string | null;
  category: string | null;
  /** Arbetstyp: stadning | temperatur | rapporter | bestallning | underhall | personal | ovrigt */
  work_type: string | null;
  done: boolean;
  done_at: string | null;
  signature: string | null;
  note: string | null;
  zone_id: string | null;
  map_object_id: string | null;
};

export function useFloorPlans(storeId?: string | null) {
  return useQuery({
    queryKey: ["floor-plans", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("floor_plans")
        .select("*")
        .eq("store_id", storeId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as FloorPlan[];
    },
    enabled: !!storeId,
  });
}

/** Butiker som faktiskt har en planritning — används för att välja butik automatiskt. */
export function useStoresWithFloorPlan() {
  return useQuery({
    queryKey: ["floor-plan-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("floor_plans").select("store_id");
      if (error) throw error;
      return [...new Set((data || []).map((r) => r.store_id as string))];
    },
  });
}

export function useMapZones(floorPlanId?: string | null) {
  return useQuery({
    queryKey: ["map-zones", floorPlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_zones")
        .select("*")
        .eq("floor_plan_id", floorPlanId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as unknown as MapZone[];
    },
    enabled: !!floorPlanId,
  });
}

export function useMapObjects(floorPlanId?: string | null) {
  return useQuery({
    queryKey: ["map-objects", floorPlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_objects")
        .select("*")
        .eq("floor_plan_id", floorPlanId!)
        .eq("active", true)
        .order("created_at");
      if (error) throw error;
      return (data || []) as MapObject[];
    },
    enabled: !!floorPlanId,
  });
}

export function useMapWalls(floorPlanId?: string | null) {
  return useQuery({
    queryKey: ["map-walls", floorPlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_geometry")
        .select("*")
        .eq("floor_plan_id", floorPlanId!);
      if (error) throw error;
      return (data || []) as MapWall[];
    },
    enabled: !!floorPlanId,
  });
}

export function useMapObjectTypes() {
  return useQuery({
    queryKey: ["map-object-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_object_types")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((r) => ({
        ...r,
        recommended_tasks: Array.isArray(r.recommended_tasks) ? (r.recommended_tasks as string[]) : [],
      })) as MapObjectType[];
    },
  });
}

/**
 * Dagens uppgifter för butiken — exakt samma rader som checklistsidan visar.
 * Avbockning här och där uppdaterar samma post.
 */
export function useMapTasks(storeId?: string | null, date?: string) {
  const iso = date || todayIso();
  return useQuery({
    queryKey: ["map-tasks", storeId, iso],
    queryFn: async () => {
      const { data: days, error: dayErr } = await supabase
        .from("checklist_days")
        .select("id")
        .eq("store_id", storeId!)
        .eq("checklist_date", iso);
      if (dayErr) throw dayErr;
      const ids = (days || []).map((d) => d.id);
      if (ids.length === 0) return [] as MapTask[];
      const { data, error } = await supabase
        .from("checklist_items")
        .select(
          "id, day_id, task, section, time_label, category, work_type, done, done_at, signature, note, zone_id, map_object_id",
        )
        .in("day_id", ids)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as MapTask[];
    },
    enabled: !!storeId,
  });
}

/** Live: när någon bockar av i checklistan uppdateras kartan utan omladdning. */
export function useMapRealtime(storeId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!storeId) return;
    const ch = supabase
      .channel(`store-map-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "checklist_items" }, () => {
        qc.invalidateQueries({ queryKey: ["map-tasks"] });
        qc.invalidateQueries({ queryKey: ["checklist-day"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deviations" }, () => {
        qc.invalidateQueries({ queryKey: ["deviations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [storeId, qc]);
}

/** Kopplar en befintlig checklistuppgift till en zon eller ett objekt på kartan. */
export function useLinkTaskToMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      zoneId,
      mapObjectId,
    }: {
      itemId: string;
      zoneId?: string | null;
      mapObjectId?: string | null;
    }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ zone_id: zoneId ?? null, map_object_id: mapObjectId ?? null })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["map-tasks"] });
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
    },
  });
}

/* ---------------- Redigeringsläge (admin) ---------------- */

export function useSaveFloorPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<FloorPlan> & { store_id?: string }) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("floor_plans").update(patch).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("floor_plans")
        .insert({
          store_id: input.store_id!,
          name: input.name || "Butiksplan",
          floor_label: input.floor_label ?? null,
          background_url: input.background_url ?? null,
          width: input.width ?? 1200,
          height: input.height ?? 800,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["floor-plans"] }),
  });
}

export function useSaveZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MapZone>) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("map_zones").update(patch).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("map_zones")
        .insert({
          floor_plan_id: input.floor_plan_id!,
          store_id: input.store_id!,
          name: input.name || "Ny zon",
          color: input.color ?? "#1f4d6b",
          x: input.x ?? 40,
          y: input.y ?? 40,
          width: input.width ?? 200,
          height: input.height ?? 150,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-zones"] }),
  });
}

export function useDeleteZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("map_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["map-zones"] });
      qc.invalidateQueries({ queryKey: ["map-objects"] });
    },
  });
}

export function useSaveMapObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MapObject>) => {
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("map_objects").update(patch).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("map_objects")
        .insert({
          floor_plan_id: input.floor_plan_id!,
          store_id: input.store_id!,
          zone_id: input.zone_id ?? null,
          object_type_id: input.object_type_id!,
          name: input.name!,
          x: input.x ?? 40,
          y: input.y ?? 40,
          width: input.width ?? 60,
          height: input.height ?? 40,
          rotation: input.rotation ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-objects"] }),
  });
}

export function useDeleteMapObject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("map_objects").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-objects"] }),
  });
}

/**
 * Publicerar planen och sparar en version. Versionen är en ren layout-snapshot
 * och rör aldrig historiska uppgifter, bilder eller avvikelser.
 */
export function usePublishFloorPlan() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (planId: string) => {
      const [{ data: plan }, { data: zones }, { data: objects }, { data: walls }, { data: versions }] =
        await Promise.all([
          supabase.from("floor_plans").select("*").eq("id", planId).single(),
          supabase.from("map_zones").select("*").eq("floor_plan_id", planId),
          supabase.from("map_objects").select("*").eq("floor_plan_id", planId),
          supabase.from("map_geometry").select("*").eq("floor_plan_id", planId),
          supabase
            .from("floor_plan_versions")
            .select("version")
            .eq("floor_plan_id", planId)
            .order("version", { ascending: false })
            .limit(1),
        ]);
      const nextVersion = ((versions?.[0]?.version as number | undefined) ?? 0) + 1;
      const { error: vErr } = await supabase.from("floor_plan_versions").insert({
        floor_plan_id: planId,
        version: nextVersion,
        snapshot: { plan, zones, objects, walls },
        published_by_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
      });
      if (vErr) throw vErr;
      const { error } = await supabase
        .from("floor_plans")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", planId);
      if (error) throw error;
      return nextVersion;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["floor-plans"] });
      qc.invalidateQueries({ queryKey: ["floor-plan-versions"] });
    },
  });
}

export function useFloorPlanVersions(planId?: string | null) {
  return useQuery({
    queryKey: ["floor-plan-versions", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("floor_plan_versions")
        .select("id, version, created_at, published_by_name, note")
        .eq("floor_plan_id", planId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!planId,
  });
}

/** Nästa lediga instansnamn, t.ex. "Kyl 03". */
export function nextInstanceName(typeName: string, existing: MapObject[]) {
  const prefix = typeName.trim();
  let n = 1;
  const taken = new Set(existing.map((o) => o.name.toLowerCase()));
  while (taken.has(`${prefix} ${String(n).padStart(2, "0")}`.toLowerCase())) n += 1;
  return `${prefix} ${String(n).padStart(2, "0")}`;
}

/* ---------------- Punkter: anteckning eller uppgift på exakt plats ---------------- */

export function useMapPins(floorPlanId?: string | null) {
  return useQuery({
    queryKey: ["map-pins", floorPlanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_pins")
        .select("*")
        .eq("floor_plan_id", floorPlanId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MapPin[];
    },
    enabled: !!floorPlanId,
  });
}

export function useSaveMapPin() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: Partial<MapPin>) => {
      const actor = staff ? `${staff.first_name} ${staff.last_name}` : null;
      if (input.id) {
        const { id, ...patch } = input;
        const { error } = await supabase.from("map_pins").update(patch).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("map_pins")
        .insert({
          floor_plan_id: input.floor_plan_id!,
          store_id: input.store_id!,
          zone_id: input.zone_id ?? null,
          map_object_id: input.map_object_id ?? null,
          x: input.x ?? 0,
          y: input.y ?? 0,
          area_x: input.area_x ?? null,
          area_y: input.area_y ?? null,
          area_width: input.area_width ?? null,
          area_height: input.area_height ?? null,
          kind: input.kind ?? "note",
          title: input.title || "Anteckning",
          body: input.body ?? null,
          assigned_staff_id: input.assigned_staff_id ?? null,
          assigned_name: input.assigned_name ?? null,
          due_date: input.due_date ?? null,
          status: input.status ?? "open",
          created_by_name: actor,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });
}

/** Markerar punkten klar, eller öppnar den igen. */
export function useCompleteMapPin() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const actor = staff ? `${staff.first_name} ${staff.last_name}` : null;
      const { error } = await supabase
        .from("map_pins")
        .update(
          done
            ? { status: "done", done_at: new Date().toISOString(), done_by_name: actor }
            : { status: "open", done_at: null, done_by_name: null },
        )
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });
}

export function useDeleteMapPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("map_pins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-pins"] }),
  });
}
