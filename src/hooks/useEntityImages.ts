import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { prepareUpload, COMPRESS_PHOTO, COMPRESS_AVATAR } from "@/lib/imageCompress";
import { supabase } from "@/integrations/supabase/client";
import { notifyImageComment } from "@/lib/personNotify";

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
  /** Exakt plats inom ytan, 0–1. Saknas den hör bilden till hela ytan. */
  norm_x: number | null;
  norm_y: number | null;
  floor_plan_id: string | null;
  /** Checklistuppgiften bilden togs för, om bilden kom från en uppgift. */
  checklist_item_id?: string | null;
  /** Vilket steg i uppgiften bilden togs på, 1 och uppåt. */
  step_index?: number | null;
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
  /** Markerad del av bilden, andel av bredd och höjd (0–1). */
  region_x: number | null;
  region_y: number | null;
  region_w: number | null;
  region_h: number | null;
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

/** Vilket steg i uppgiften bilden togs på, om den togs i ett steg. */
export function useImageStepIndex(imageId?: string | null) {
  return useQuery({
    queryKey: ["image-step-index", imageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("step_index")
        .eq("id", imageId!)
        .maybeSingle();
      if (error) throw error;
      return ((data as { step_index: number | null } | null)?.step_index ?? null) as number | null;
    },
    enabled: !!imageId,
  });
}

export function useUploadEntityImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      entityType,
      entityId,
      file,
      caption,
      sortOrder,
      imageKind,
      floorPlanId,
      norm,
      checklistItemId,
      stepIndex,
    }: {
      entityType: string;
      entityId: string;
      file: File;
      caption?: string;
      sortOrder?: number;
      /** standard | progress | completion | issue | general */
      imageKind?: string;
      /** Kartans ritning bilden hör till, om bilden placeras på kartan. */
      floorPlanId?: string | null;
      /** Exakt plats inom ytan, 0–1 i båda riktningarna. */
      norm?: { x: number; y: number } | null;
      /** Checklistuppgiften bilden hör till, när bilden tas från en uppgift. */
      checklistItemId?: string | null;
      /** Steget i uppgiften bilden togs på, 1 och uppåt. */
      stepIndex?: number | null;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      let uploaderName: string | null = auth?.user?.email ?? null;
      let staffId: string | null = null;
      if (uid) {
        const { data: st } = await supabase
          .from("staff")
          .select("id, first_name, last_name")
          .eq("user_id", uid)
          .maybeSingle();
        if (st) {
          staffId = (st.id as string) ?? null;
          uploaderName = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || uploaderName;
        }
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
          image_kind: imageKind ?? null,
          floor_plan_id: floorPlanId ?? null,
          norm_x: norm?.x ?? null,
          norm_y: norm?.y ?? null,
          checklist_item_id: checklistItemId ?? null,
          step_index: stepIndex ?? null,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const mediaId = inserted?.id as string;

      /* Kopplingen är sanningen i bildbiblioteket: skapa den direkt så att man
         alltid ser var bilden kommer ifrån — platsen och, när bilden tagits i
         en uppgift, själva uppgiften. */
      const links: {
        media_id: string;
        entity_type: string;
        entity_id: string;
        relation_type: string;
        created_by_staff_id: string | null;
      }[] = [];
      const placeType = entityType === "map_zone" ? "zone" : entityType;
      if (["zone", "store", "resource", "product", "shop_order_line", "location"].includes(placeType)) {
        links.push({
          media_id: mediaId,
          entity_type: placeType,
          entity_id: entityId,
          relation_type: imageKind === "completion" ? "after" : "documentation",
          created_by_staff_id: staffId,
        });
      }
      if (checklistItemId) {
        links.push({
          media_id: mediaId,
          entity_type: "task",
          entity_id: checklistItemId,
          relation_type: imageKind === "completion" ? "proof" : "documentation",
          created_by_staff_id: staffId,
        });
      }
      if (links.length) await supabase.from("image_links").insert(links as never);

      return mediaId;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ["store-cover-images"] });
      qc.invalidateQueries({ queryKey: ["image-library"] });
      qc.invalidateQueries({ queryKey: ["image-links"] });

      qc.invalidateQueries({ queryKey: ["product-photos"] });
      qc.invalidateQueries({ queryKey: ["our-stores-photos"] });
      qc.invalidateQueries({ queryKey: ["floor-plan-images"] });
      qc.invalidateQueries({ queryKey: ["store-area-images"] });
      if (vars.checklistItemId) {
        qc.invalidateQueries({ queryKey: ["task-images", vars.checklistItemId] });
      }
    },
  });
}

/**
 * Alla bilder som hör till butikens ytor och objekt på kartan.
 * Används för filtrering per område i Översikt.
 */
export function useStoreAreaImages(ids: string[]) {
  const key = [...ids].sort().join(",");
  return useQuery({
    queryKey: ["store-area-images", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .in("entity_type", ["map_zone", "map_object"])
        .in("entity_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EntityImage[];
    },
    enabled: ids.length > 0,
  });
}


/** Alla bilder som är placerade på en ritning — används för markörerna på kartan. */
export function useFloorPlanImages(planId?: string | null) {
  return useQuery({
    queryKey: ["floor-plan-images", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .eq("floor_plan_id", planId!)
        .not("norm_x", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as EntityImage[];
    },
    enabled: !!planId,
  });
}

/** Flyttar en redan uppladdad bild till en exakt plats inom ytan. */
export function useSetImagePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      floorPlanId,
      norm,
    }: {
      id: string;
      entityType: string;
      entityId: string;
      floorPlanId: string;
      norm: { x: number; y: number } | null;
    }) => {
      const { error } = await supabase
        .from("entity_images")
        .update({
          floor_plan_id: norm ? floorPlanId : null,
          norm_x: norm?.x ?? null,
          norm_y: norm?.y ?? null,
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["entity-images", vars.entityType, vars.entityId] });
      qc.invalidateQueries({ queryKey: ["floor-plan-images", vars.floorPlanId] });
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
    mutationFn: async ({
      imageId,
      body,
      region,
    }: {
      imageId: string;
      body: string;
      /** Den markerade delen av bilden, om kommentaren gäller en yta. */
      region?: { x: number; y: number; w: number; h: number } | null;
    }) => {
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
        .insert({
          image_id: imageId,
          user_id: uid,
          author_name: name,
          body,
          region_x: region ? region.x : null,
          region_y: region ? region.y : null,
          region_w: region ? region.w : null,
          region_h: region ? region.h : null,
        });
      if (error) throw error;
      // Uppladdaren och tidigare kommentatorer får en personlig notis.
      await notifyImageComment(imageId, name, body);
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
  /**
   * "product" = kopplad till produkten, "library" = kopplad via bildbiblioteket,
   * "order_line" = ligger bara på en orderrad
   */
  source: "product" | "library" | "order_line";
  /** Kopplingen i bildbiblioteket, om bilden ligger på produkten den vägen */
  link_id?: string | null;
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

      /* Bilder som kopplats till varan i bildbiblioteket — samma bild kan
         ligga på flera ställen, kopplingen är sanningen. */
      const { data: links, error: linkErr } = await supabase
        .from("image_links")
        .select("id, media_id, created_at")
        .eq("entity_type", PRODUCT_PHOTO_ENTITY)
        .eq("entity_id", productId!)
        .order("created_at");
      if (linkErr) throw linkErr;

      let fromLibrary: { link_id: string; image: EntityImage }[] = [];
      const mediaIds = Array.from(new Set((links || []).map((l) => l.media_id).filter(Boolean)));
      if (mediaIds.length) {
        const { data, error } = await supabase.from("entity_images").select("*").in("id", mediaIds);
        if (error) throw error;
        const byId = new Map((data || []).map((i) => [i.id as string, i as EntityImage]));
        fromLibrary = (links || [])
          .map((l) => ({ link_id: l.id as string, image: byId.get(l.media_id as string) }))
          .filter((x): x is { link_id: string; image: EntityImage } => !!x.image);
      }

      const byUrl = new Map<string, ProductPhoto>();
      for (const img of (own || []) as EntityImage[]) {
        byUrl.set(img.url, { ...img, source: "product", link_id: null });
      }
      for (const { link_id, image } of fromLibrary) {
        const existing = byUrl.get(image.url);
        if (existing) byUrl.set(image.url, { ...existing, link_id });
        else byUrl.set(image.url, { ...image, source: "library", link_id });
      }
      for (const img of fromOrders) {
        if (!byUrl.has(img.url)) byUrl.set(img.url, { ...img, source: "order_line", link_id: null });
      }
      return Array.from(byUrl.values());
    },
    enabled: !!productId,
  });
}

/** Gör en bild till varans förstabild — den som syns i listor och beställningar. */
export function useSetProductCover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, url }: { productId: string; url: string | null }) => {
      const { error } = await supabase
        .from("products")
        .update({ image_url: url || null })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product-photos", vars.productId] });
    },
  });
}

/**
 * Tar bort en bild från varan. Bilden raderas aldrig — den ligger kvar i
 * bildbiblioteket, bara kopplingen till varan försvinner.
 */
export function useRemoveProductImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      productId,
      photo,
      isCover,
    }: {
      productId: string;
      photo: ProductPhoto;
      isCover: boolean;
    }) => {
      if (photo.link_id) {
        const { error } = await supabase.from("image_links").delete().eq("id", photo.link_id);
        if (error) throw error;
      }
      if (photo.source === "product" && photo.entity_id === productId) {
        /* Gammal hemvist: bilden lämnar varan men finns kvar i biblioteket */
        const { error } = await supabase
          .from("entity_images")
          .update({ entity_id: null, status: "unclassified" })
          .eq("id", photo.id);
        if (error) throw error;
      }
      if (isCover) {
        const { error } = await supabase.from("products").update({ image_url: null }).eq("id", productId);
        if (error) throw error;
      }
      const { name } = await currentActorName();
      await supabase.from("image_activity").insert({
        media_id: photo.id,
        actor_name: name,
        action_type: "unlinked",
        change_group_id: crypto.randomUUID(),
        field_name: `koppling:${PRODUCT_PHOTO_ENTITY}`,
        old_value: productId,
        new_value: null,
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["product-photos", vars.productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["image-library"] });
    },
  });
}

/**
 * Antal egentagna bilder per produkt (bara bilder kopplade direkt till produkten).
 * Används i lagerlistan för att visa en kameraikon med antal.
 */
export function useProductPhotoCounts(productIds: string[]) {
  const ids = Array.from(new Set(productIds.filter(Boolean))).sort();
  return useQuery({
    queryKey: ["product-photo-counts", ids.length, ids.join(",").slice(0, 2000)],
    queryFn: async () => {
      const map = new Map<string, number>();
      if (!ids.length) return map;
      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("entity_images")
          .select("entity_id")
          .eq("entity_type", PRODUCT_PHOTO_ENTITY)
          .in("entity_id", ids.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of data || []) {
          const id = (row as any).entity_id as string;
          map.set(id, (map.get(id) || 0) + 1);
        }
      }
      return map;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}
