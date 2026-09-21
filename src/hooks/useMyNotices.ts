import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mina personliga notiser: kommentarer på det man lagt ut, ändringar av det man
 * gjort och uppgifter man blivit tilldelad. Ligger i portal "personal" och är
 * alltid knutna till ett konto, så de syns oavsett vilken portal man står i.
 */

export interface MyNotice {
  id: string;
  message: string;
  target_page: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useMyNotices() {
  const qc = useQueryClient();

  const { data: userId = null } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: notices = [] } = useQuery<MyNotice[]>({
    queryKey: ["my-notices", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, message, target_page, entity_type, entity_id, is_read, created_at")
        .eq("user_id", userId!)
        .eq("portal", "personal")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as MyNotice[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-notices-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ["my-notices"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, userId]);

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-notices"] }),
  });

  const unread = notices.filter((n) => !n.is_read);

  return { notices, unread, markRead };
}
