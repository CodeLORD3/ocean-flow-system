import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EntityImage } from "@/hooks/useEntityImages";

/**
 * Bildarkivet: alla bilder i systemet, senaste först. Används när man vill
 * återanvända en befintlig bild, t.ex. koppla den till en uppgift.
 */
export function useImageArchive(limit = 400) {
  return useQuery({
    queryKey: ["image-archive", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as EntityImage[];
    },
  });
}

/**
 * Kopplar befintliga bilder ur arkivet till en uppgift/yta. Bilden kopieras som
 * en ny rad så originalet ligger kvar där det laddades upp.
 */
export function useAttachArchiveImages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      images,
      entityType,
      entityId,
      checklistItemId,
      floorPlanId,
    }: {
      images: EntityImage[];
      entityType: string;
      entityId: string;
      checklistItemId?: string | null;
      floorPlanId?: string | null;
    }) => {
      if (!images.length) return 0;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      const rows = images.map((img, i) => ({
        entity_type: entityType,
        entity_id: entityId,
        url: img.url,
        caption: img.caption,
        sort_order: i,
        image_kind: "completion",
        checklist_item_id: checklistItemId ?? null,
        floor_plan_id: floorPlanId ?? null,
        uploaded_by: uid,
        uploaded_by_name: img.uploaded_by_name,
      }));
      const { error } = await supabase.from("entity_images").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entity-images"] });
      qc.invalidateQueries({ queryKey: ["task"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
