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
  /** Visas i förhandsvyn (rutnätet) på översiktssidan */
  is_featured: boolean;
  /** Vilken del av bilden som visas vid beskärning: top | center | bottom */
  focal_point: string | null;
  created_at: string;
  /** Konto som laddade upp bilden */
  uploaded_by: string | null;
  uploaded_by_name: string | null;
};

export type EntityImageComment = {
  id: string;
  image_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
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
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      let uploaderName: string | null = auth?.user?.email ?? null;
      if (uid) {
        const { data: st } = await supabase
          .from("staff")
          .select("first_name, last_name")
          .eq("user_id", uid)
          .maybeSingle();
        if (st) uploaderName = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || uploaderName;
      }
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
          uploaded_by: uid,
          uploaded_by_name: uploaderName,
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

/** Väljer vilka bilder som ska visas i förhandsvyn för ett objekt. */
export function useSetFeaturedImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      imageIds,
    }: {
      entityType: string;
      entityId: string;
      imageIds: string[];
    }) => {
      const { error: clearErr } = await supabase
        .from("entity_images")
        .update({ is_featured: false })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("is_featured", true);
      if (clearErr) throw clearErr;
      if (imageIds.length) {
        const { error } = await supabase
          .from("entity_images")
          .update({ is_featured: true })
          .in("id", imageIds);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
    },
  });
}


/** Bild-ID:n som den inloggade användaren har hjärtat. */
export function useMyImageFavorites() {
  return useQuery({
    queryKey: ["entity-image-favorites"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return [] as string[];
      const { data, error } = await supabase
        .from("entity_image_favorites")
        .select("image_id")
        .eq("user_id", uid);
      if (error) throw error;
      return (data || []).map((r: any) => r.image_id as string);
    },
  });
}

export function useToggleImageFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ imageId, favorite }: { imageId: string; favorite: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) throw new Error("Du måste vara inloggad för att favoritmarkera.");
      if (favorite) {
        const { error } = await supabase
          .from("entity_image_favorites")
          .insert({ image_id: imageId, user_id: uid });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("entity_image_favorites")
          .delete()
          .eq("image_id", imageId)
          .eq("user_id", uid);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["entity-image-favorites"] }),
  });
}

/** Kommentarer (chatt) för en bild. */
export function useImageComments(imageId?: string | null) {
  return useQuery({
    queryKey: ["entity-image-comments", imageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_image_comments")
        .select("*")
        .eq("image_id", imageId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as EntityImageComment[];
    },
    enabled: !!imageId,
  });
}

export function useAddImageComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ imageId, body }: { imageId: string; body: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      let name = auth?.user?.email ?? "Okänd";
      if (uid) {
        const { data: st } = await supabase
          .from("staff")
          .select("first_name, last_name")
          .eq("user_id", uid)
          .maybeSingle();
        if (st) name = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || name;
      }
      const { error } = await supabase
        .from("entity_image_comments")
        .insert({ image_id: imageId, user_id: uid, author_name: name, body });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-image-comments", vars.imageId] });
    },
  });
}

export function useDeleteImageComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; imageId: string }) => {
      const { error } = await supabase.from("entity_image_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-image-comments", vars.imageId] });
    },
  });
}
