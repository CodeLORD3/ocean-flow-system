import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bildinkorgen för utrustning och material.
 *
 * Personalen kan fota saker i butiken utan att veta vad de ska heta eller
 * var de hör hemma. Bilden landar i inkorgen och namnges i efterhand, och
 * kopplas då till rätt sak i registret — och till butiken där den finns.
 */
export const RESOURCE_INBOX_TYPE = "resurs_inkorg";
export const RESOURCE_ITEM_TYPE = "resource_item";

export type ResourcePhoto = {
  id: string;
  entity_type: string;
  entity_id: string;
  url: string;
  title: string | null;
  caption: string | null;
  created_at: string;
  uploaded_by_name: string | null;
};

const FIELDS = "id, entity_type, entity_id, url, title, caption, created_at, uploaded_by_name";

/** Bilder som väntar på namn och koppling. Utan butik: alla butiker. */
export function useResourceInbox(storeId?: string | null) {
  return useQuery({
    queryKey: ["resource-inbox", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("entity_images")
        .select(FIELDS)
        .eq("entity_type", RESOURCE_INBOX_TYPE)
        .order("created_at", { ascending: false });
      if (storeId) q = q.eq("entity_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as ResourcePhoto[];
    },
  });
}

/** Bilder som redan hör till en sak i registret. */
export function useResourceItemPhotos(resourceIds: string[]) {
  const key = [...resourceIds].sort().join(",");
  return useQuery({
    queryKey: ["resource-item-photos", key],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select(FIELDS)
        .eq("entity_type", RESOURCE_ITEM_TYPE)
        .in("entity_id", resourceIds);
      if (error) throw error;
      return (data || []) as unknown as ResourcePhoto[];
    },
    enabled: resourceIds.length > 0,
  });
}

/** Namnger bilden — namnet gör det enkelt att sortera och söka senare. */
export function useNameResourcePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; title: string; caption?: string | null }) => {
      const patch: Record<string, unknown> = { title: input.title.trim() || null };
      if (input.caption !== undefined) patch.caption = input.caption?.trim() || null;
      const { error } = await supabase.from("entity_images").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource-inbox"] });
      qc.invalidateQueries({ queryKey: ["resource-item-photos"] });
    },
  });
}

/**
 * Kopplar bilden till en sak i registret. Saknar saken bild blir den här
 * bilden sakens bild. Platsen skrivs bara i resource_locations.
 */
export function useLinkPhotoToResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { photoId: string; url: string; resourceId: string; title?: string }) => {
      const patch: Record<string, unknown> = {
        entity_type: RESOURCE_ITEM_TYPE,
        entity_id: input.resourceId,
      };
      if (input.title?.trim()) patch.title = input.title.trim();
      const { error } = await supabase.from("entity_images").update(patch).eq("id", input.photoId);
      if (error) throw error;

      const { data: item } = await supabase
        .from("resource_items")
        .select("id, image")
        .eq("id", input.resourceId)
        .maybeSingle();
      if (item && !item.image) {
        const { error: iErr } = await supabase
          .from("resource_items")
          .update({ image: input.url })
          .eq("id", input.resourceId);
        if (iErr) throw iErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource-inbox"] });
      qc.invalidateQueries({ queryKey: ["resource-item-photos"] });
      qc.invalidateQueries({ queryKey: ["resource-items"] });
    },
  });
}

/** Lägger bilden tillbaka i inkorgen, t.ex. om den kopplats fel. */
export function useUnlinkResourcePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { photoId: string; storeId: string }) => {
      const { error } = await supabase
        .from("entity_images")
        .update({ entity_type: RESOURCE_INBOX_TYPE, entity_id: input.storeId })
        .eq("id", input.photoId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["resource-inbox"] });
      qc.invalidateQueries({ queryKey: ["resource-item-photos"] });
    },
  });
}
