import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { classifyImage } from "@/hooks/useImageLibrary";
import { createProductTarget, createResourceTarget } from "@/lib/linkTargets";
import type { ImageRegion } from "@/components/images/AnnotatableImage";

/**
 * Utsnitt ur en bild.
 *
 * Man fotar verkligheten först — en hylla, ett rum, en bänk — och markerar
 * sedan de saker man ser i bilden. Varje markering blir en egen bild som kan
 * namnges, kopplas och till och med skapa saken i registret. Originalbilden
 * ändras aldrig: utsnittet är en ny bild som ärver butik och område.
 */

const BUCKET = "logos";

async function actor() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  let staffId: string | null = null;
  let name: string | null = auth?.user?.email ?? null;
  if (uid) {
    const { data: st } = await supabase
      .from("staff")
      .select("id, first_name, last_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (st) {
      staffId = st.id as string;
      name = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || name;
    }
  }
  return { uid, staffId, name };
}

/** Klipper ut den markerade delen av bilden i webbläsaren. */
async function cropToBlob(url: string, region: ImageRegion): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Bilden kunde inte läsas för utklipp"));
    el.src = url;
  });
  const sx = Math.max(0, Math.round(region.x * img.naturalWidth));
  const sy = Math.max(0, Math.round(region.y * img.naturalHeight));
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.round(region.w * img.naturalWidth)));
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.round(region.h * img.naturalHeight)));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kunde inte klippa ut bilden");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("Kunde inte klippa ut bilden");
  return blob;
}

export type CutoutInput = {
  /** Bilden man markerat i. */
  sourceMediaId: string;
  sourceUrl: string;
  region: ImageRegion;
  /** Vad saken heter — blir bildens namn och tagg. */
  title: string;
  /** Vad utsnittet är: en sak, en vara, eller bara en egen bild. */
  target?: "resource" | "product" | "none";
  /** Skapa saken i registret Utrustning & material av utsnittet. */
  createResource?: boolean;
  /** Koppla utsnittet till en sak som redan finns. */
  resourceId?: string | null;
  /** Koppla utsnittet till en vara som redan finns. */
  productId?: string | null;
  /** Skapa varan i produktlistan av utsnittet. */
  createProduct?: boolean;
  /** Kategori för en ny vara. */
  productCategory?: string | null;
};

export function useCreateCutout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CutoutInput) => {
      const { uid, staffId, name } = await actor();
      const title = input.title.trim();

      // Butik och område ärvs från originalbilden så utsnittet hamnar rätt.
      const { data: srcLinks } = await supabase
        .from("image_links")
        .select("entity_type, entity_id")
        .eq("media_id", input.sourceMediaId);
      const inherited = (srcLinks || []).filter((l) =>
        ["store", "zone", "map_zone", "location"].includes(l.entity_type),
      );
      const storeId = inherited.find((l) => l.entity_type === "store")?.entity_id ?? null;

      const blob = await cropToBlob(input.sourceUrl, input.region);
      const path = `entity-images/library/utsnitt/${storeId ?? "okand"}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const url = urlData.publicUrl;

      const { data: inserted, error } = await supabase
        .from("entity_images")
        .insert({
          entity_type: storeId ? "store" : "library",
          entity_id: storeId ?? "00000000-0000-4000-8000-000000000009",
          url,
          sort_order: 0,
          caption: null,
          uploaded_by: uid,
          uploaded_by_name: name,
          uploaded_by_staff_id: staffId,
          title,
          status: "unclassified",
          captured_at: new Date().toISOString(),
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      const mediaId = inserted?.id as string;

      const target = input.target ?? (input.createResource || input.resourceId ? "resource" : "none");

      // Saken i registret: skapas av utsnittet om den inte redan finns.
      let resourceId = target === "resource" ? input.resourceId ?? null : null;
      if (target === "resource" && !resourceId && input.createResource) {
        resourceId = await createResourceTarget(title, url);
      } else if (resourceId) {
        const { data: item } = await supabase
          .from("resource_items")
          .select("id, image")
          .eq("id", resourceId)
          .maybeSingle();
        if (item && !item.image) {
          await supabase.from("resource_items").update({ image: url }).eq("id", resourceId);
        }
      }

      // Varan i produktlistan: samma sak för en produktbild.
      let productId = target === "product" ? input.productId ?? null : null;
      if (target === "product" && !productId && input.createProduct) {
        productId = await createProductTarget(title, input.productCategory || "Övrigt", url);
      } else if (productId) {
        const { data: prod } = await supabase
          .from("products")
          .select("id, image_url")
          .eq("id", productId)
          .maybeSingle();
        if (prod && !prod.image_url) {
          await supabase.from("products").update({ image_url: url }).eq("id", productId);
        }
      }

      const links = inherited.map((l) => ({ entityType: l.entity_type, entityId: l.entity_id }));
      if (resourceId) links.push({ entityType: "resource", entityId: resourceId });
      if (productId) links.push({ entityType: "product", entityId: productId });

      await classifyImage({
        mediaId,
        title,
        mediaKind: resourceId ? "resource" : productId ? "product" : null,
        links,
        note: "Utsnitt ur bild",
      });

      await supabase.from("image_activity").insert({
        media_id: mediaId,
        staff_id: staffId,
        actor_name: name,
        action_type: "uploaded",
        change_group_id: crypto.randomUUID(),
        field_name: "utsnitt ur bild",
        old_value: input.sourceMediaId,
        new_value: title,
      });

      return { mediaId, resourceId, url };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["image-library"] });
      qc.invalidateQueries({ queryKey: ["image-status-counts"] });
      qc.invalidateQueries({ queryKey: ["image-feed"] });
      qc.invalidateQueries({ queryKey: ["entity-images"] });
      qc.invalidateQueries({ queryKey: ["resource-items"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["pick-products"] });
      qc.invalidateQueries({ queryKey: ["resource-item-photos"] });
    },
  });
}
