import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bildgrupper: dagsgrupper (en per dag, med beskrivning) och egna grupper
 * där man samlar valda bilder, t.ex. "Skada i kylen". Grupperna är bara
 * kopplingar — bilderna ligger kvar där de ligger.
 */
export type ImageGroup = {
  id: string;
  entity_type: string;
  entity_id: string;
  name: string;
  description: string | null;
  kind: string;
  day_key: string | null;
  created_by_name: string | null;
  created_at: string;
  /** Bilderna i gruppen, i ordning. */
  imageIds: string[];
};

const key = (entityType: string, entityId?: string | null) => ["image-groups", entityType, entityId];

async function actor() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  let name: string | null = auth?.user?.email ?? null;
  if (uid) {
    const { data: st } = await supabase
      .from("staff")
      .select("first_name, last_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (st) name = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || name;
  }
  return { uid, name };
}

export function useImageGroups(entityType: string, entityId?: string | null) {
  return useQuery({
    queryKey: key(entityType, entityId),
    queryFn: async () => {
      const { data: groups, error } = await supabase
        .from("image_groups")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (groups || []).map((g) => g.id);
      let items: { group_id: string; image_id: string; sort_order: number }[] = [];
      if (ids.length) {
        const { data, error: e2 } = await supabase
          .from("image_group_items")
          .select("group_id, image_id, sort_order")
          .in("group_id", ids)
          .order("sort_order");
        if (e2) throw e2;
        items = data || [];
      }
      return (groups || []).map((g) => ({
        ...g,
        imageIds: items.filter((i) => i.group_id === g.id).map((i) => i.image_id),
      })) as ImageGroup[];
    },
    enabled: !!entityId,
  });
}

/** Skapar en egen grupp av de markerade bilderna. */
export function useCreateImageGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      name,
      description,
      imageIds,
    }: {
      entityType: string;
      entityId: string;
      name: string;
      description?: string | null;
      imageIds: string[];
    }) => {
      const { uid, name: who } = await actor();
      const { data, error } = await supabase
        .from("image_groups")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          name,
          description: description || null,
          kind: "manual",
          created_by: uid,
          created_by_name: who,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (imageIds.length) {
        const { error: e2 } = await supabase
          .from("image_group_items")
          .insert(imageIds.map((image_id, i) => ({ group_id: data.id, image_id, sort_order: i })));
        if (e2) throw e2;
      }
      return data.id as string;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}

/** Lägger valda bilder i en befintlig grupp (dubbletter hoppas över). */
export function useAddImagesToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      imageIds,
    }: {
      groupId: string;
      imageIds: string[];
      entityType: string;
      entityId: string;
    }) => {
      if (!imageIds.length) return;
      const { error } = await supabase
        .from("image_group_items")
        .upsert(
          imageIds.map((image_id, i) => ({ group_id: groupId, image_id, sort_order: i })),
          { onConflict: "group_id,image_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}

export function useRemoveImageFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      groupId,
      imageId,
    }: {
      groupId: string;
      imageId: string;
      entityType: string;
      entityId: string;
    }) => {
      const { error } = await supabase
        .from("image_group_items")
        .delete()
        .eq("group_id", groupId)
        .eq("image_id", imageId);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}

/** Namn och beskrivning på en grupp. */
export function useUpdateImageGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
    }: {
      id: string;
      name?: string;
      description?: string | null;
      entityType: string;
      entityId: string;
    }) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name !== undefined) patch.name = name;
      if (description !== undefined) patch.description = description;
      const { error } = await supabase.from("image_groups").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}

export function useDeleteImageGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; entityType: string; entityId: string }) => {
      const { error } = await supabase.from("image_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}

/**
 * Beskrivning för en dag, t.ex. "Ombyggnad av disken". Raden skapas först när
 * någon skriver något — dagsgrupperna räknas annars fram ur bildernas datum.
 */
export function useSaveDayDescription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      dayKey,
      description,
      name,
    }: {
      entityType: string;
      entityId: string;
      dayKey: string;
      description: string;
      name?: string;
    }) => {
      const { uid, name: who } = await actor();
      const { data: existing } = await supabase
        .from("image_groups")
        .select("id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("kind", "day")
        .eq("day_key", dayKey)
        .maybeSingle();
      if (existing?.id) {
        const { error } = await supabase
          .from("image_groups")
          .update({ description, name: name ?? dayKey, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
        return existing.id;
      }
      const { data, error } = await supabase
        .from("image_groups")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          kind: "day",
          day_key: dayKey,
          name: name ?? dayKey,
          description,
          created_by: uid,
          created_by_name: who,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: key(v.entityType, v.entityId) }),
  });
}
