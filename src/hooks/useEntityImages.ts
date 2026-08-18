import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { prepareUpload, COMPRESS_PHOTO, COMPRESS_AVATAR } from "@/lib/imageCompress";
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
  /** Vem som senast redigerade bildtexten och när */
  caption_edited_by: string | null;
  caption_edited_by_name: string | null;
  caption_edited_at: string | null;
};

export type EntityImageComment = {
  id: string;
  image_id: string;
  user_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  edited_by: string | null;
  edited_by_name: string | null;
  edited_at: string | null;
};

/** Namnet på det inloggade kontot (personal om möjligt), för redigeringsspår. */
async function currentActorName() {
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

/** Antal bilder per objekt-id, hämtat i en enda fråga för en lista. */
export function useEntityImageCounts(entityType: string, ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["entity-image-counts", entityType, key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("entity_id")
        .eq("entity_type", entityType)
        .in("entity_id", ids);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data || []) {
        const id = (r as { entity_id: string }).entity_id;
        map[id] = (map[id] ?? 0) + 1;
      }
      return map;
    },
    enabled: ids.length > 0,
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
      const prepared = await prepareUpload(file, COMPRESS_PHOTO);
      const path = `entity-images/${entityType}/${entityId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${prepared.ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared.file, { upsert: true, contentType: prepared.contentType });
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
      qc.invalidateQueries({ queryKey: ["product-photos"] });
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
      if (caption !== undefined) {
        patch.caption = caption;
        const { uid, name } = await currentActorName();
        patch.caption_edited_by = uid;
        patch.caption_edited_by_name = name;
        patch.caption_edited_at = new Date().toISOString();
      }
      if (sort_order !== undefined) patch.sort_order = sort_order;
      if (focal_point !== undefined) patch.focal_point = focal_point;
      const { error } = await supabase.from("entity_images").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-images"] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["product-photos"] });
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
      qc.invalidateQueries({ queryKey: ["product-photos"] });
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
      qc.invalidateQueries({ queryKey: ["product-photos"] });
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
      day,
    }: {
      entityType: string;
      entityId: string;
      imageIds: string[];
      /** Datumnyckel (YYYY-MM-DD) som urvalet gäller. Utan den nollas hela enheten. */
      day?: string;
    }) => {
      // Nollställningen begränsas till den aktuella dagen. Annars raderas
      // tidigare dagars utvalda bilder och Bildflödets historik försvinner.
      let clear = supabase
        .from("entity_images")
        .update({ is_featured: false })
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("is_featured", true);
      if (day) {
        const start = new Date(`${day}T00:00:00`);
        const end = new Date(start.getTime() + 86400000);
        clear = clear.gte("created_at", start.toISOString()).lt("created_at", end.toISOString());
      }
      const { error: clearErr } = await clear;
      if (clearErr) throw clearErr;
      if (imageIds.length) {
        const { error } = await supabase
          .from("entity_images")
          .update({ is_featured: true })
          .in("id", imageIds);
        if (error) throw error;
      }
      // Markera dagen som manuellt hanterad så det automatiska urvalet
      // (4 bilder per dag) inte skriver över personalens val.
      if (day) {
        await supabase.rpc("mark_image_feature_day", {
          _entity_type: entityType,
          _entity_id: entityId,
          _day: day,
          _count: imageIds.length,
        });
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ["image-feed"] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-image-favorites"] });
      // Bildflödet visar totala antalet hjärtan per bild och enhet
      qc.invalidateQueries({ queryKey: ["image-feed"] });
    },
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

/** Redigerar en befintlig kommentar och sparar vem som ändrade samt när. */
export function useUpdateImageComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; imageId: string; body: string }) => {
      const { uid, name } = await currentActorName();
      const { error } = await supabase
        .from("entity_image_comments")
        .update({
          body,
          edited_by: uid,
          edited_by_name: name,
          edited_at: new Date().toISOString(),
        })
        .eq("id", id);
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

/** Entitetstyp för egentagna bilder som hör till en produkt. */
export const PRODUCT_PHOTO_ENTITY = "product";

/**
 * Kopplar en befintlig bild (t.ex. från en order) till en produkt genom att
 * skapa en ny rad som pekar på samma bildfil.
 */
export function useLinkImageToProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      url,
      caption,
    }: {
      productId: string;
      url: string;
      caption?: string | null;
    }) => {
      const { data: existing } = await supabase
        .from("entity_images")
        .select("id")
        .eq("entity_type", PRODUCT_PHOTO_ENTITY)
        .eq("entity_id", productId)
        .eq("url", url)
        .maybeSingle();
      if (existing) return existing.id as string;
      const { uid, name } = await currentActorName();
      const { data: inserted, error } = await supabase
        .from("entity_images")
        .insert({
          entity_type: PRODUCT_PHOTO_ENTITY,
          entity_id: productId,
          url,
          caption: caption || null,
          sort_order: 0,
          uploaded_by: uid,
          uploaded_by_name: name,
        })
        .select("id")
        .single();
      if (error) throw error;
      return inserted?.id as string;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", PRODUCT_PHOTO_ENTITY, vars.productId] });
      qc.invalidateQueries({ queryKey: ["product-photos", vars.productId] });
    },
  });
}

export type ProductPhoto = EntityImage & {
  /** "product" = kopplad till produkten, "order_line" = ligger bara på en orderrad */
  source: "product" | "order_line";
};

/**
 * Alla egentagna bilder för en produkt: både bilder kopplade direkt till
 * produkten och bilder som ligger på orderrader för samma produkt.
 * Dedupliceras på bildadress, produktkopplade rader vinner.
 */
export function useProductPhotos(productId?: string | null) {
  return useQuery({
    queryKey: ["product-photos", productId],
    queryFn: async () => {
      const { data: own, error: ownErr } = await supabase
        .from("entity_images")
        .select("*")
        .eq("entity_type", PRODUCT_PHOTO_ENTITY)
        .eq("entity_id", productId!)
        .order("sort_order")
        .order("created_at");
      if (ownErr) throw ownErr;

      const { data: lines, error: lineErr } = await supabase
        .from("shop_order_lines")
        .select("id")
        .eq("product_id", productId!);
      if (lineErr) throw lineErr;

      let fromOrders: EntityImage[] = [];
      const lineIds = (lines || []).map((l) => l.id);
      if (lineIds.length) {
        const { data, error } = await supabase
          .from("entity_images")
          .select("*")
          .eq("entity_type", "shop_order_line")
          .in("entity_id", lineIds)
          .order("created_at");
        if (error) throw error;
        fromOrders = (data || []) as EntityImage[];
      }

      const byUrl = new Map<string, ProductPhoto>();
      for (const img of (own || []) as EntityImage[]) {
        byUrl.set(img.url, { ...img, source: "product" });
      }
      for (const img of fromOrders) {
        if (!byUrl.has(img.url)) byUrl.set(img.url, { ...img, source: "order_line" });
      }
      return Array.from(byUrl.values());
    },
    enabled: !!productId,
  });
}
