import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hjärtan, kommentarer och visningar för en bild. Visningen registreras en gång
 * per person och bild — antalet är alltså antalet personer som sett bilden.
 */
export function useImageEngagement(mediaId?: string | null) {
  return useQuery({
    queryKey: ["image-engagement", mediaId],
    queryFn: async () => {
      const [hearts, comments, views] = await Promise.all([
        supabase
          .from("entity_image_favorites")
          .select("id", { count: "exact", head: true })
          .eq("image_id", mediaId!),
        supabase
          .from("entity_image_comments")
          .select("id", { count: "exact", head: true })
          .eq("image_id", mediaId!),
        supabase
          .from("image_views")
          .select("id", { count: "exact", head: true })
          .eq("media_id", mediaId!),
      ]);
      return {
        hearts: hearts.count ?? 0,
        comments: comments.count ?? 0,
        views: views.count ?? 0,
      };
    },
    enabled: !!mediaId,
    staleTime: 15_000,
  });
}

/** Registrerar att den inloggade personen har sett bilden. Räknas bara en gång. */
export function useRecordImageView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mediaId: string) => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      let name: string | null = auth?.user?.email ?? null;
      const { data: st } = await supabase
        .from("staff")
        .select("first_name, last_name")
        .eq("user_id", uid)
        .maybeSingle();
      if (st) name = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || name;
      const { error } = await supabase
        .from("image_views")
        .insert({ media_id: mediaId, user_id: uid, viewer_name: name });
      // 23505 = personen har redan sett bilden, det är inget fel.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: (_d, mediaId) => {
      qc.invalidateQueries({ queryKey: ["image-engagement", mediaId] });
      qc.invalidateQueries({ queryKey: ["image-viewers", mediaId] });
    },
  });
}

/** Personerna som sett bilden, senast först. */
export function useImageViewers(mediaId?: string | null) {
  return useQuery({
    queryKey: ["image-viewers", mediaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("image_views")
        .select("id, viewer_name, created_at")
        .eq("media_id", mediaId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as { id: string; viewer_name: string | null; created_at: string }[];
    },
    enabled: !!mediaId,
    staleTime: 15_000,
  });
}
