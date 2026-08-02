import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EntityImage = {
  id: string;
  entity_type: string;
  entity_id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  /** Vilken del av bilden som visas vid beskärning: top | center | bottom */
  focal_point: string | null;
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
        .order("is_cover", { ascending: false })
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
      const { data: inserted, error } = await supabase
        .from("entity_images")
        .insert({
          entity_type: entityType,
          entity_id: entityId,
          url: urlData.publicUrl,
          caption: caption || null,
          sort_order: sortOrder ?? 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      return inserted?.id as string;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["our-stores-photos"] });
    },
  });
}


export function useUpdateEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      caption,
      sort_order,
      focal_point,
    }: {
      id: string;
      caption?: string | null;
      sort_order?: number;
      focal_point?: string;
    }) => {
      const patch: Record<string, unknown> = {};
      if (caption !== undefined) patch.caption = caption;
      if (sort_order !== undefined) patch.sort_order = sort_order;
      if (focal_point !== undefined) patch.focal_point = focal_point;
      const { error } = await supabase.from("entity_images").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-images"] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["our-stores-photos"] });
    },
  });
}

export function useDeleteEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entity_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-images"] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["our-stores-photos"] });
    },
  });
}

/** Sätter (eller rensar) omslagsbild för ett objekt. Endast en bild per objekt kan vara omslag. */
export function useSetCoverImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      imageId,
    }: {
      entityType: string;
      entityId: string;
      imageId: string | null;
    }) => {
      const { error: clearErr } = await supabase
        .from("entity_images")
        .update({ is_cover: false })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("is_cover", true);
      if (clearErr) throw clearErr;
      if (imageId) {
        const { error } = await supabase.from("entity_images").update({ is_cover: true }).eq("id", imageId);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["our-stores-photos"] });
    },
  });
}
