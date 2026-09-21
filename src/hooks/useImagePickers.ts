import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Enkla listor för att välja vad en bild hör till. Namn hämtas alltid från källan. */

export type PickOption = { id: string; name: string; hint?: string | null };

/** Områdena i en butik, oavsett vilken kartversion de ligger på. */
export function useZonesByStore(storeId?: string | null) {
  return useQuery({
    queryKey: ["pick-zones", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_zones")
        .select("id, name, zone_kind, floor_plan_id, sort_order")
        .eq("store_id", storeId!)
        .order("sort_order");
      if (error) throw error;
      const seen = new Set<string>();
      const out: PickOption[] = [];
      for (const z of data || []) {
        const name = (z.name as string) || "";
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        out.push({ id: z.id as string, name, hint: (z.zone_kind as string) || null });
      }
      return out;
    },
    enabled: !!storeId,
    staleTime: 60_000,
  });
}

/** Sakerna i registret Utrustning & material. */
export function usePickResources(search?: string) {
  return useQuery({
    queryKey: ["pick-resources", search || ""],
    queryFn: async () => {
      let q = supabase.from("resource_items").select("id, name, resource_type").order("name").limit(60);
      if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        hint: (r.resource_type as string) || null,
      })) as PickOption[];
    },
    staleTime: 60_000,
  });
}

/** Produkter, sökbara på namn. */
export function usePickProducts(search?: string) {
  return useQuery({
    queryKey: ["pick-products", search || ""],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, unit")
        .eq("active", true)
        .order("name")
        .limit(60);
      if (search?.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id as string,
        name: p.name as string,
        hint: (p.unit as string) || null,
      })) as PickOption[];
    },
    staleTime: 60_000,
  });
}

/** Dagens uppgifter i en butik, för att koppla en bild till ett arbete. */
export function usePickTasks(storeId?: string | null, dateIso?: string) {
  const iso = dateIso || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["pick-tasks", storeId, iso],
    queryFn: async () => {
      const { data: days, error: dErr } = await supabase
        .from("checklist_days")
        .select("id")
        .eq("store_id", storeId!)
        .eq("checklist_date", iso);
      if (dErr) throw dErr;
      const ids = (days || []).map((d) => d.id as string);
      if (!ids.length) return [] as PickOption[];
      const { data, error } = await supabase
        .from("checklist_items")
        .select("id, task, section")
        .in("day_id", ids)
        .order("sort_order");
      if (error) throw error;
      return (data || []).map((t) => ({
        id: t.id as string,
        name: (t.task as string) || "Uppgift",
        hint: (t.section as string) || null,
      })) as PickOption[];
    },
    enabled: !!storeId,
  });
}

/** Namn på det en bild är kopplad till, hämtade från källtabellerna. */
export function useLinkTargetNames(links: { entity_type: string; entity_id: string }[]) {
  const key = links.map((l) => `${l.entity_type}:${l.entity_id}`).sort().join(",");
  return useQuery({
    queryKey: ["link-target-names", key],
    queryFn: async () => {
      const byType: Record<string, string[]> = {};
      for (const l of links) (byType[l.entity_type] ||= []).push(l.entity_id);
      const names: Record<string, string> = {};
      const load = async (type: string, table: string, col: string) => {
        const ids = byType[type];
        if (!ids?.length) return;
        const { data } = await supabase.from(table as never).select(`id, ${col}`).in("id", ids);
        for (const row of (data || []) as Record<string, unknown>[]) {
          names[`${type}:${row.id}`] = String(row[col] ?? "");
        }
      };
      await Promise.all([
        load("store", "stores", "name"),
        load("zone", "map_zones", "name"),
        load("resource", "resource_items", "name"),
        load("product", "products", "name"),
        load("task", "checklist_items", "task"),
        load("location", "resource_locations", "description"),
      ]);
      const obsIds = byType["observation"];
      if (obsIds?.length) {
        const { data } = await supabase
          .from("image_observations")
          .select("id, observation_type, comment")
          .in("id", obsIds);
        for (const o of data || []) {
          names[`observation:${o.id}`] =
            (o.comment as string) || (o.observation_type as string) || "Iakttagelse";
        }
      }
      return names;
    },
    enabled: links.length > 0,
    staleTime: 60_000,
  });
}
