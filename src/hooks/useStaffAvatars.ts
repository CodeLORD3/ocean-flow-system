import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Profilbild per personal-id — används som avatar i chatten. */
export function useStaffAvatars() {
  const { data } = useQuery({
    queryKey: ["chat-staff-avatars"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, profile_image_url");
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((s: any) => {
        if (s.profile_image_url) map[s.id] = s.profile_image_url;
      });
      return map;
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? {};
}
