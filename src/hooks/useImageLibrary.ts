import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { prepareUpload, COMPRESS_PHOTO } from "@/lib/imageCompress";
import { deriveImageStatus, type ImageStatus, type MediaKind } from "@/lib/imageStatus";
import type { EntityImage } from "@/hooks/useEntityImages";

/**
 * Bildbiblioteket: en bild laddas upp en gång och kan sedan höra till flera
 * ställen. image_links är sanningen om vad bilden hör till — entity_type och
 * entity_id på bilden är bara den gamla hemvisten och skrivs aldrig om när en
 * ny koppling skapas.
 */

const BUCKET = "logos";
const PAGE_SIZE = 60;

export type LibraryImage = EntityImage & {
  description: string | null;
  title: string | null;
  media_kind: string | null;
  status: ImageStatus;
  captured_at: string | null;
  tags: string[];
  uploaded_by_staff_id: string | null;
  last_edited_by_staff_id: string | null;
  last_edited_at: string | null;
};

export type ImageLink = {
  id: string;
  media_id: string;
  entity_type: string;
  entity_id: string;
  relation_type: string;
  created_by_staff_id: string | null;
  created_at: string;
};

export type ImageActivity = {
  id: string;
  media_id: string;
  staff_id: string | null;
  actor_name: string | null;
  action_type: string;
  change_group_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
};

export type LibraryFilter = {
  status?: ImageStatus | "all";
  mediaKind?: MediaKind | "all";
  /** Fritext på titel, beskrivning och bildtext. */
  search?: string;
  /** Endast bilder kopplade till detta objekt. */
  entityType?: string;
  entityId?: string;
  uploaderStaffId?: string;
};

/** Namnet på det inloggade kontot, för historiken. */
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

/** Bibliotekets bilder, sidvis så att tusentals bilder inte hämtas på en gång. */
export function useImageLibrary(filter: LibraryFilter, page = 0) {
  return useQuery({
    queryKey: ["image-library", filter, page],
    queryFn: async () => {
      let ids: string[] | null = null;
      if (filter.entityType && filter.entityId) {
        const { data, error } = await supabase
          .from("image_links")
          .select("media_id")
          .eq("entity_type", filter.entityType)
          .eq("entity_id", filter.entityId);
        if (error) throw error;
        ids = (data || []).map((r) => r.media_id as string);
        if (ids.length === 0) return { rows: [] as LibraryImage[], hasMore: false };
      }

      let q = supabase
        .from("entity_images")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
      if (ids) q = q.in("id", ids);
      if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
      if (filter.mediaKind && filter.mediaKind !== "all") q = q.eq("media_kind", filter.mediaKind);
      if (filter.uploaderStaffId) q = q.eq("uploaded_by_staff_id", filter.uploaderStaffId);
      const s = filter.search?.trim();
      if (s) q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,caption.ilike.%${s}%`);

      const { data, error } = await q;
      if (error) throw error;
      const all = (data || []) as unknown as LibraryImage[];
      return { rows: all.slice(0, PAGE_SIZE), hasMore: all.length > PAGE_SIZE };
    },
    staleTime: 20_000,
  });
}

/** Hur många bilder som ligger i varje arbetsstatus. */
export function useImageStatusCounts() {
  return useQuery({
    queryKey: ["image-status-counts"],
    queryFn: async () => {
      const out: Record<ImageStatus, number> = { unclassified: 0, partial: 0, classified: 0 };
      await Promise.all(
        (Object.keys(out) as ImageStatus[]).map(async (st) => {
          const { count } = await supabase
            .from("entity_images")
            .select("id", { count: "exact", head: true })
            .eq("status", st);
          out[st] = count ?? 0;
        }),
      );
      return out;
    },
    staleTime: 20_000,
  });
}

/** Kopplingarna för en bild — hämtas först när bilden öppnas. */
export function useImageLinks(mediaId?: string | null) {
  return useQuery({
    queryKey: ["image-links", mediaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_links")
        .select("*")
        .eq("media_id", mediaId!)
        .order("created_at");
      if (error) throw error;
      return (data || []) as ImageLink[];
    },
    enabled: !!mediaId,
  });
}

/** Kopplingar för flera bilder i en fråga (används av rutnätet). */
export function useImageLinksFor(mediaIds: string[]) {
  const key = [...mediaIds].sort().join(",");
  return useQuery({
    queryKey: ["image-links-many", key],
    queryFn: async () => {
      const map: Record<string, ImageLink[]> = {};
      const CHUNK = 150;
      for (let i = 0; i < mediaIds.length; i += CHUNK) {
        const { data, error } = await supabase
          .from("image_links")
          .select("*")
          .in("media_id", mediaIds.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data || []) as ImageLink[]) {
          (map[row.media_id] ||= []).push(row);
        }
      }
      return map;
    },
    enabled: mediaIds.length > 0,
    staleTime: 20_000,
  });
}

/** Den mänskliga historiken för en bild. */
export function useImageActivity(mediaId?: string | null) {
  return useQuery({
    queryKey: ["image-activity", mediaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_activity")
        .select("*")
        .eq("media_id", mediaId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ImageActivity[];
    },
    enabled: !!mediaId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["image-library"] });
  qc.invalidateQueries({ queryKey: ["image-status-counts"] });
  qc.invalidateQueries({ queryKey: ["image-links"] });
  qc.invalidateQueries({ queryKey: ["image-links-many"] });
  qc.invalidateQueries({ queryKey: ["image-activity"] });
  qc.invalidateQueries({ queryKey: ["image-feed"] });
  qc.invalidateQueries({ queryKey: ["entity-images"] });
}

export type ClassifyInput = {
  mediaId: string;
  title?: string | null;
  description?: string | null;
  mediaKind?: MediaKind | null;
  tags?: string[];
  /** Kopplingar som ska finnas efter sparningen, per typ. */
  links?: { entityType: string; entityId: string; relationType?: string }[];
  /** Kopplingstyper som ska ersättas helt (övriga lämnas orörda). */
  replaceTypes?: string[];
  hasObservation?: boolean;
  /** Märkning i historiken, t.ex. "Via massredigering". */
  note?: string;
};

/**
 * Sparar klassificeringen av en bild och räknar om arbetsstatus med samma
 * logik överallt. Historiken skrivs som en händelse per sparning.
 */
export async function classifyImage(input: ClassifyInput) {
  const { staffId, name } = await actor();
  const groupId = crypto.randomUUID();

  const { data: before, error: bErr } = await supabase
    .from("entity_images")
    .select("*")
    .eq("id", input.mediaId)
    .single();
  if (bErr) throw bErr;
  const prev = before as unknown as LibraryImage;

  const { data: existingLinks } = await supabase
    .from("image_links")
    .select("*")
    .eq("media_id", input.mediaId);
  let links = ((existingLinks || []) as ImageLink[]).slice();

  const changes: { field: string; old: string | null; next: string | null }[] = [];

  // Kopplingar: ersätt bara de typer som berörs. Övriga ligger kvar.
  const replace = new Set(input.replaceTypes ?? []);
  if (input.links) for (const l of input.links) replace.add(l.entityType);
  if (replace.size) {
    const removeIds = links.filter((l) => replace.has(l.entity_type)).map((l) => l.id);
    const keep = new Set(
      (input.links || []).map((l) => `${l.entityType}:${l.entityId}:${l.relationType ?? "documentation"}`),
    );
    const toDelete = links.filter(
      (l) =>
        replace.has(l.entity_type) &&
        !keep.has(`${l.entity_type}:${l.entity_id}:${l.relation_type}`),
    );
    if (toDelete.length) {
      await supabase
        .from("image_links")
        .delete()
        .in("id", toDelete.map((l) => l.id));
      for (const l of toDelete) {
        changes.push({ field: `koppling:${l.entity_type}`, old: l.entity_id, next: null });
      }
      links = links.filter((l) => !toDelete.some((d) => d.id === l.id));
    }
    void removeIds;
  }

  for (const l of input.links || []) {
    const relation = l.relationType ?? "documentation";
    const already = links.find(
      (x) => x.entity_type === l.entityType && x.entity_id === l.entityId && x.relation_type === relation,
    );
    if (already) continue;
    const { data: ins, error } = await supabase
      .from("image_links")
      .insert({
        media_id: input.mediaId,
        entity_type: l.entityType,
        entity_id: l.entityId,
        relation_type: relation,
        created_by_staff_id: staffId,
      })
      .select("*")
      .single();
    if (error && error.code !== "23505") throw error;
    if (ins) links.push(ins as ImageLink);
    changes.push({ field: `koppling:${l.entityType}`, old: null, next: l.entityId });
  }

  // Fälten på bilden
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined && (input.title || null) !== (prev.title || null)) {
    patch.title = input.title || null;
    changes.push({ field: "titel", old: prev.title, next: input.title || null });
  }
  if (input.description !== undefined && (input.description || null) !== (prev.description || null)) {
    patch.description = input.description || null;
    changes.push({ field: "beskrivning", old: prev.description, next: input.description || null });
  }
  if (input.mediaKind !== undefined && (input.mediaKind || null) !== (prev.media_kind || null)) {
    patch.media_kind = input.mediaKind || null;
    changes.push({ field: "vad bilden visar", old: prev.media_kind, next: input.mediaKind || null });
  }
  if (input.tags) {
    const oldTags = (prev.tags || []).join(", ");
    const newTags = input.tags.join(", ");
    if (oldTags !== newTags) {
      patch.tags = input.tags;
      changes.push({ field: "taggar", old: oldTags || null, next: newTags || null });
    }
  }

  const nextKind = (patch.media_kind ?? prev.media_kind ?? null) as MediaKind | null;
  const status = deriveImageStatus(
    { media_kind: nextKind, entity_type: prev.entity_type, entity_id: prev.entity_id },
    links.map((l) => ({ entity_type: l.entity_type, entity_id: l.entity_id })),
    input.hasObservation ?? nextKind === "observation",
  );
  if (status !== prev.status) patch.status = status;

  if (Object.keys(patch).length || changes.length) {
    patch.last_edited_by_staff_id = staffId;
    patch.last_edited_at = new Date().toISOString();
    const { error } = await supabase
      .from("entity_images")
      .update(patch as never)
      .eq("id", input.mediaId);
    if (error) throw error;
  }

  // Historiken: en mänsklig händelse med fälten under. Ren statusändring
  // loggas aldrig som egen händelse.
  if (changes.length) {
    const rows = changes.map((c) => ({
      media_id: input.mediaId,
      staff_id: staffId,
      actor_name: input.note ? `${name ?? "Okänd"} (${input.note})` : name,
      action_type: prev.media_kind ? "reclassified" : "classified",
      change_group_id: groupId,
      field_name: c.field,
      old_value: c.old,
      new_value: c.next,
    }));
    await supabase.from("image_activity").insert(rows);
  }

  return status;
}

export function useClassifyImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: classifyImage,
    onSuccess: () => invalidate(qc),
  });
}

/** Massklassificering — samma statuslogik, märkt "Via massredigering". */
export function useBulkClassify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mediaIds,
      ...rest
    }: Omit<ClassifyInput, "mediaId"> & { mediaIds: string[] }) => {
      for (const id of mediaIds) {
        await classifyImage({ ...rest, mediaId: id, note: "Via massredigering" });
      }
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Tar bort en koppling. Bilden och övriga kopplingar ligger kvar. */
export function useRemoveImageLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ link }: { link: ImageLink }) => {
      const { staffId, name } = await actor();
      const { error } = await supabase.from("image_links").delete().eq("id", link.id);
      if (error) throw error;
      const { data: rest } = await supabase
        .from("image_links")
        .select("entity_type, entity_id")
        .eq("media_id", link.media_id);
      const { data: img } = await supabase
        .from("entity_images")
        .select("media_kind, entity_type, entity_id, status")
        .eq("id", link.media_id)
        .single();
      const cur = img as unknown as LibraryImage | null;
      if (cur) {
        const status = deriveImageStatus(
          cur,
          ((rest || []) as { entity_type: string; entity_id: string }[]) ?? [],
          cur.media_kind === "observation",
        );
        if (status !== cur.status) {
          await supabase
            .from("entity_images")
            .update({ status, last_edited_by_staff_id: staffId, last_edited_at: new Date().toISOString() } as never)
            .eq("id", link.media_id);
        }
      }
      await supabase.from("image_activity").insert({
        media_id: link.media_id,
        staff_id: staffId,
        actor_name: name,
        action_type: "unlinked",
        change_group_id: crypto.randomUUID(),
        field_name: `koppling:${link.entity_type}`,
        old_value: link.entity_id,
        new_value: null,
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

/**
 * Laddar upp en eller flera bilder. Ingen klassificering krävs: bilderna
 * skapas som oplacerade och kan sorteras senare av vem som helst i personalen.
 */
export function useUploadLibraryImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      files,
      storeId,
      zoneId,
      mediaKind,
      relationType,
      onProgress,
    }: {
      files: File[];
      /** Butiken bilden hör till, om man kommer från en butik. */
      storeId?: string | null;
      zoneId?: string | null;
      mediaKind?: MediaKind | null;
      relationType?: string;
      onProgress?: (done: number, total: number) => void;
    }) => {
      const { uid, staffId, name } = await actor();
      const created: string[] = [];
      let done = 0;
      for (const file of files) {
        const prepared = await prepareUpload(file, COMPRESS_PHOTO);
        const path = `entity-images/library/${storeId ?? "okand"}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${prepared.ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, prepared.file, { upsert: true, contentType: prepared.contentType });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

        // Hemvisten hålls bakåtkompatibel: butiksbilder behåller store som
        // hemvist så befintliga vyer fortsätter visa dem.
        const { data: inserted, error } = await supabase
          .from("entity_images")
          .insert({
            entity_type: storeId ? "store" : "library",
            entity_id: storeId ?? "00000000-0000-4000-8000-000000000009",
            url: urlData.publicUrl,
            sort_order: 0,
            uploaded_by: uid,
            uploaded_by_name: name,
            uploaded_by_staff_id: staffId,
            media_kind: mediaKind ?? null,
            status: "unclassified",
            captured_at: new Date(file.lastModified || Date.now()).toISOString(),
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        const mediaId = inserted?.id as string;
        created.push(mediaId);

        const links: { entityType: string; entityId: string; relationType?: string }[] = [];
        if (storeId) links.push({ entityType: "store", entityId: storeId, relationType: relationType ?? "documentation" });
        if (zoneId) links.push({ entityType: "zone", entityId: zoneId, relationType: relationType ?? "documentation" });
        if (links.length) {
          await supabase.from("image_links").insert(
            links.map((l) => ({
              media_id: mediaId,
              entity_type: l.entityType,
              entity_id: l.entityId,
              relation_type: l.relationType ?? "documentation",
              created_by_staff_id: staffId,
            })),
          );
          const status = deriveImageStatus(
            { media_kind: mediaKind ?? null },
            links.map((l) => ({ entity_type: l.entityType, entity_id: l.entityId })),
          );
          await supabase.from("entity_images").update({ status } as never).eq("id", mediaId);
        }

        await supabase.from("image_activity").insert({
          media_id: mediaId,
          staff_id: staffId,
          actor_name: name,
          action_type: "uploaded",
          change_group_id: crypto.randomUUID(),
        });
        done += 1;
        onProgress?.(done, files.length);
      }
      return created;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Sparar en iakttagelse och kopplar den till bilden. */
export function useCreateObservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      mediaId,
      storeId,
      zoneId,
      observationType,
      comment,
    }: {
      mediaId: string;
      storeId?: string | null;
      zoneId?: string | null;
      observationType: string;
      comment?: string | null;
    }) => {
      const { staffId } = await actor();
      const { data, error } = await supabase
        .from("image_observations")
        .insert({
          store_id: storeId ?? null,
          zone_id: zoneId ?? null,
          observation_type: observationType,
          comment: comment || null,
          created_by_staff_id: staffId,
        })
        .select("id")
        .single();
      if (error) throw error;
      const links: { entityType: string; entityId: string }[] = [
        { entityType: "observation", entityId: data.id as string },
      ];
      if (storeId) links.push({ entityType: "store", entityId: storeId });
      if (zoneId) links.push({ entityType: "zone", entityId: zoneId });
      await classifyImage({
        mediaId,
        mediaKind: "observation",
        links,
        hasObservation: true,
      });
    },
    onSuccess: () => invalidate(qc),
  });
}
