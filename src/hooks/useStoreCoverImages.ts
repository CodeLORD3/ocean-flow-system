import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a lookup map of store_id -> cover image url, taken from entity_images.
 * The image flagged as cover wins, otherwise the first image by sort_order.
 */
export function useStoreCoverImages() {
  const { data = {} } = useQuery({
    queryKey: ["store-cover-images"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("entity_id, url, sort_order, is_cover")
        .eq("entity_type", "store")
        .order("is_cover", { ascending: false })
        .order("sort_order");
      if (error) throw error;

      const map: Record<string, string> = {};
      (data || []).forEach((img: any) => {
        if (!map[img.entity_id]) map[img.entity_id] = img.url;
      });
      return map;
    },
  });

  return data as Record<string, string>;
}
