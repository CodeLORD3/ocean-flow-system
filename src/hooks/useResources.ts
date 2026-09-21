import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * "Utrustning & material" för personalen — under ytan en generell resursmodell
 * för utrustning, redskap, verktyg, maskiner, förbrukningsmaterial,
 * skyddsutrustning, mätinstrument, behållare och dokument.
 *
 * Fyra saker hålls isär:
 *   standardens krav → butikens resurs → resursens plats → dagens uppgift.
 * Platsen lagras bara på ett ställe (resource_locations). Flyttas saken
 * ändras den där, och alla uppgifter visar direkt den nya platsen. Det är
 * kopplingen till 5S.
 */

export const RESOURCE_TYPES = [
  { value: "utrustning", label: "Utrustning" },
  { value: "redskap", label: "Redskap" },
  { value: "verktyg", label: "Verktyg" },
  { value: "maskin", label: "Maskin" },
  { value: "forbrukning", label: "Förbrukningsmaterial" },
  { value: "skydd", label: "Skyddsutrustning" },
  { value: "matinstrument", label: "Mätinstrument" },
  { value: "behallare", label: "Behållare" },
  { value: "dokument", label: "Dokument" },
  { value: "annat", label: "Annat" },
];

export function resourceTypeLabel(value: string | null | undefined) {
  return RESOURCE_TYPES.find((t) => t.value === value)?.label ?? "Utrustning";
}

export type ResourceItem = {
  id: string;
  name: string;
  image: string | null;
  resource_type: string;
  category: string | null;
  unit: string | null;
  total_count: number | null;
  unit_value: number | null;
  supplier: string | null;
  supplier_article_no: string | null;
  reusable: boolean;
  active: boolean;
  note: string | null;
};

export type ResourceLocation = {
  id: string;
  resource_id: string;
  store_id: string;
  map_zone_id: string | null;
  location_text: string | null;
  position_code: string | null;
  quantity: number | null;
  /** Normal plats enligt 5S — dit saken ska tillbaka efter arbetet. */
  is_normal_location: boolean;
  /** Saken förvaras på en annan sak, t.ex. moppen på städvagnen. */
  attached_to_resource_id: string | null;
};

export type TaskRequirement = {
  id: string;
  task_template_id: string | null;
  checklist_item_id: string | null;
  requirement_type: string;
  requirement_name: string;
  quantity_required: number | null;
  required: boolean;
  usage_note: string | null;
  sort_order: number;
};

export function useResourceItems() {
  return useQuery({
    queryKey: ["resource-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_items")
        .select("*")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data || []) as ResourceItem[];
    },
  });
}

export function useResourceLocations(storeId?: string | null) {
  return useQuery({
    queryKey: ["resource-locations", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("resource_locations").select("*");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ResourceLocation[];
    },
  });
}

export function useSaveResourceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ResourceItem> & { name: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Ge saken ett namn.");
      const patch = {
        name,
        image: input.image ?? null,
        resource_type: input.resource_type ?? "utrustning",
        category: input.category?.trim() || null,
        unit: input.unit?.trim() || null,
        total_count: input.total_count ?? null,
        unit_value: input.unit_value ?? null,
        supplier: input.supplier?.trim() || null,
        supplier_article_no: input.supplier_article_no?.trim() || null,
        reusable: input.reusable ?? true,
        note: input.note?.trim() || null,
      };
      if (input.id) {
        const { error } = await supabase.from("resource_items").update(patch).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase.from("resource_items").insert(patch).select("id").single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resource-items"] }),
  });
}

export function useArchiveResourceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("resource_items").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resource-items"] }),
  });
}

/** Platsen finns bara här — uppgifterna hämtar den härifrån. */
export function useSaveResourceLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      resourceId: string;
      storeId: string;
      mapZoneId?: string | null;
      locationText?: string | null;
      positionCode?: string | null;
      quantity?: number | null;
      isNormalLocation?: boolean;
      attachedToResourceId?: string | null;
    }) => {
      const { error } = await supabase.from("resource_locations").upsert(
        {
          resource_id: input.resourceId,
          store_id: input.storeId,
          map_zone_id: input.mapZoneId ?? null,
          location_text: input.locationText?.trim() || null,
          position_code: input.positionCode?.trim() || null,
          quantity: input.quantity ?? null,
          is_normal_location: input.isNormalLocation ?? true,
          attached_to_resource_id: input.attachedToResourceId ?? null,
        },
        { onConflict: "resource_id,store_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resource-locations"] }),
  });
}

/** Standardens krav — vad arbetet behöver, utan fabrikat och utan plats. */
export function useTaskRequirements(templateItemId?: string | null, checklistItemId?: string | null) {
  return useQuery({
    queryKey: ["task-requirements", templateItemId ?? null, checklistItemId ?? null],
    queryFn: async () => {
      const filters: string[] = [];
      if (templateItemId) filters.push(`task_template_id.eq.${templateItemId}`);
      if (checklistItemId) filters.push(`checklist_item_id.eq.${checklistItemId}`);
      const { data, error } = await supabase
        .from("task_resource_requirements")
        .select("*")
        .or(filters.join(","))
        .order("sort_order");
      if (error) throw error;
      return (data || []) as TaskRequirement[];
    },
    enabled: !!templateItemId || !!checklistItemId,
  });
}

export function useSaveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      templateItemId?: string | null;
      checklistItemId?: string | null;
      requirementName: string;
      requirementType?: string;
      quantityRequired?: number | null;
      required?: boolean;
      usageNote?: string | null;
      sortOrder?: number;
    }) => {
      const requirement_name = input.requirementName.trim();
      if (!requirement_name) throw new Error("Skriv vad som behövs.");
      const patch = {
        requirement_name,
        requirement_type: input.requirementType ?? "utrustning",
        quantity_required: input.quantityRequired ?? null,
        required: input.required ?? true,
        usage_note: input.usageNote?.trim() || null,
        sort_order: input.sortOrder ?? 0,
      };
      if (input.id) {
        const { error } = await supabase.from("task_resource_requirements").update(patch).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("task_resource_requirements")
        .insert({
          ...patch,
          task_template_id: input.templateItemId ?? null,
          checklist_item_id: input.templateItemId ? null : (input.checklistItemId ?? null),
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-requirements"] }),
  });
}

export function useDeleteRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_resource_requirements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-requirements"] });
      qc.invalidateQueries({ queryKey: ["store-resource-mappings"] });
    },
  });
}

/** Vad just den här butiken använder för kravet. */
export function useStoreResourceMappings(storeId?: string | null) {
  return useQuery({
    queryKey: ["store-resource-mappings", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_resource_mappings")
        .select("id, requirement_id, store_id, resource_id")
        .eq("store_id", storeId!);
      if (error) throw error;
      return (data || []) as { id: string; requirement_id: string; store_id: string; resource_id: string }[];
    },
    enabled: !!storeId,
  });
}

export function useSaveStoreMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { requirementId: string; storeId: string; resourceId: string | null }) => {
      if (!input.resourceId) {
        const { error } = await supabase
          .from("store_resource_mappings")
          .delete()
          .eq("requirement_id", input.requirementId)
          .eq("store_id", input.storeId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("store_resource_mappings").upsert(
        { requirement_id: input.requirementId, store_id: input.storeId, resource_id: input.resourceId },
        { onConflict: "requirement_id,store_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-resource-mappings"] }),
  });
}

export type ResolvedNeed = {
  requirement: TaskRequirement;
  resource: ResourceItem | null;
  zoneId: string | null;
  place: string | null;
  /** Saken förvaras på en annan sak och hämtas samtidigt som den. */
  carriedBy: string | null;
  carrierName: string | null;
};

/**
 * "Var finns det?" — slår upp butikens faktiska sak för varje krav och dess
 * plats just nu. Ingen plats sparas på uppgiften.
 */
export function resolveNeeds(
  requirements: TaskRequirement[],
  mappings: { requirement_id: string; resource_id: string }[],
  resources: ResourceItem[],
  locations: ResourceLocation[],
): ResolvedNeed[] {
  return requirements.map((requirement) => {
    const mapped = mappings.find((m) => m.requirement_id === requirement.id);
    const resource = mapped ? resources.find((r) => r.id === mapped.resource_id) ?? null : null;
    const loc = resource ? locations.find((l) => l.resource_id === resource.id) ?? null : null;
    const carriedBy = loc?.attached_to_resource_id ?? null;
    // Hör saken till en annan sak gäller bärarens plats.
    const carrierLoc = carriedBy ? locations.find((l) => l.resource_id === carriedBy) ?? null : null;
    const effective = carrierLoc ?? loc;
    const place = loc
      ? [loc.location_text, loc.position_code].filter(Boolean).join(" · ") || null
      : null;
    const carrierPlace = carrierLoc
      ? [carrierLoc.location_text, carrierLoc.position_code].filter(Boolean).join(" · ") || null
      : null;
    return {
      requirement,
      resource,
      zoneId: effective?.map_zone_id ?? null,
      place: place ?? carrierPlace,
      carriedBy,
      carrierName: carriedBy ? resources.find((r) => r.id === carriedBy)?.name ?? null : null,
    };
  });
}

export function useImprovementSuggestions(storeId?: string | null) {
  return useQuery({
    queryKey: ["improvement-suggestions", storeId],
    queryFn: async () => {
      let q = supabase.from("improvement_suggestions").select("*").order("created_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateImprovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      storeId?: string | null;
      templateItemId?: string | null;
      checklistItemId?: string | null;
      resourceId?: string | null;
      observation: string;
      proposedChange?: string | null;
      staffId?: string | null;
    }) => {
      const observation = input.observation.trim();
      if (!observation) throw new Error("Beskriv vad du har sett.");
      const { error } = await supabase.from("improvement_suggestions").insert({
        store_id: input.storeId ?? null,
        template_item_id: input.templateItemId ?? null,
        checklist_item_id: input.checklistItemId ?? null,
        resource_id: input.resourceId ?? null,
        observation,
        proposed_change: input.proposedChange?.trim() || null,
        created_by_staff_id: input.staffId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["improvement-suggestions"] }),
  });
}
