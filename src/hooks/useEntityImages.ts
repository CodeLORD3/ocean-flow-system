import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityImage = {
  id: string;
  entity_type: string;
  entity_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

/** Bilder kopplade till ett objekt, t.ex. en butik ("store") eller en lagerplats ("storage_location"). */
export function useEntityImages(entityType: string, entityId?: string | null) {
  return useQuery({
    queryKey: ["entity-images", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data || []) as EntityImage[];
    },
    enabled: !!entityId,
  });
}

const BUCKET = "logos";

export function useUploadEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      file,
      caption,
      sortOrder,
    }: {
      entityType: string;
      entityId: string;
      file: File;
      caption?: string;
      sortOrder?: number;
    }) => {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `entity-images/${entityType}/${entityId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const { error } = await supabase.from("entity_images").insert({
        entity_type: entityType,
        entity_id: entityId,
        url: urlData.publicUrl,
        caption: caption || null,
        sort_order: sortOrder ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
    },
  });
}

export function useUpdateEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, caption, sort_order }: { id: string; caption?: string | null; sort_order?: number }) => {
      const patch: Record<string, unknown> = {};
      if (caption !== undefined) patch.caption = caption;
      if (sort_order !== undefined) patch.sort_order = sort_order;
      const { error } = await supabase.from("entity_images").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity-images"] }),
  });
}

export function useDeleteEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entity_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity-images"] }),
  });
}
