import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EntityImage } from "@/hooks/useEntityImages";
import {
  ADMIN_IMAGE_ENTITY_ID,
  PORTAL_IMAGE_ENTITY_TYPE,
  WHOLESALE_IMAGE_ENTITY_ID,
} from "@/lib/portalImages";

/**
 * Gemensam bildtidslinje: de bilder som butikerna, grossisten och admin har
 * markerat som utvalda (stjärnan i "Bilder från butiken") samlas här så att
 * personal på ett ställe kan se vad som finns hos de andra.
 */
export type FeedImage = EntityImage & {
  /** Butiksnamn, "Grossisten" eller "Admin" */
  sourceName: string;
  /** Nyckel för filtret: butikens id eller portalens sentinel-id */
  sourceId: string;
  sourceKind: "store" | "wholesale" | "admin";
  city: string | null;
  commentCount: number;
};

export type FeedSource = { id: string; name: string; kind: FeedImage["sourceKind"] };

export function useImageFeed(limit = 300) {
  return useQuery({
    queryKey: ["image-feed", limit],
    queryFn: async () => {
      const { data: imgs, error } = await supabase
        .from("entity_images")
        .select("*")
        .in("entity_type", ["store", PORTAL_IMAGE_ENTITY_TYPE])
        .eq("is_featured", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const images = (imgs || []) as EntityImage[];

      // Namnuppslagningen går via en scope-oberoende funktion. Tabellen stores är
      // bolagsfiltrerad, så ett direktanrop skulle dölja butiker från andra bolag
      // ("Okänd enhet") och tömma enhetsfiltret i flödet.
      let storeMap = new Map<string, { name: string; city: string | null }>();
      const { data: stores, error: sErr } = await supabase.rpc("image_feed_store_labels");
      if (sErr) throw sErr;
      storeMap = new Map(
        (stores || []).map((s: any) => [s.id as string, { name: s.name as string, city: (s.city ?? null) as string | null }]),
      );


      const counts = new Map<string, number>();
      if (images.length) {
        const { data: comments, error: cErr } = await supabase
          .from("entity_image_comments")
          .select("image_id")
          .in("image_id", images.map((i) => i.id));
        if (cErr) throw cErr;
        for (const c of comments || []) {
          const id = (c as { image_id: string }).image_id;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      }

      const rows: FeedImage[] = images.map((img) => {
        let sourceName = "Okänd enhet";
        let sourceKind: FeedImage["sourceKind"] = "store";
        let city: string | null = null;
        if (img.entity_type === PORTAL_IMAGE_ENTITY_TYPE) {
          if (img.entity_id === WHOLESALE_IMAGE_ENTITY_ID) {
            sourceName = "Grossisten";
            sourceKind = "wholesale";
          } else if (img.entity_id === ADMIN_IMAGE_ENTITY_ID) {
            sourceName = "Admin";
            sourceKind = "admin";
          }
        } else {
          const s = storeMap.get(img.entity_id);
          if (s) {
            sourceName = s.name;
            city = s.city;
          }
        }
        return {
          ...img,
          sourceName,
          sourceId: img.entity_id,
          sourceKind,
          city,
          commentCount: counts.get(img.id) ?? 0,
        };
      });

      const sources: FeedSource[] = Array.from(
        new Map(rows.map((r) => [r.sourceId, { id: r.sourceId, name: r.sourceName, kind: r.sourceKind }])).values(),
      ).sort((a, b) => a.name.localeCompare(b.name, "sv"));

      return { rows, sources };
    },
    staleTime: 30_000,
  });
}
