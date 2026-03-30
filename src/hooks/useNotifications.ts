import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useEffect } from "react";

interface NotificationCount {
  target_page: string;
  count: number;
}

export function useNotifications() {
  const { site, activeStoreId } = useSite();
  const queryClient = useQueryClient();

  const portal = site === "shop" ? "shop" : site === "production" ? "production" : site === "trade" ? "trade" : "wholesale";

  const { data: counts = [] } = useQuery<NotificationCount[]>({
    queryKey: ["notification-counts", portal, activeStoreId],
    queryFn: async () => {
      let query = supabase
        .from("notifications")
        .select("target_page")
        .eq("portal", portal)
        .eq("is_read", false);

      if (portal === "shop" && activeStoreId) {
        query = query.eq("store_id", activeStoreId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by target_page and count
      const map: Record<string, number> = {};
      (data || []).forEach((n: { target_page: string }) => {
        map[n.target_page] = (map[n.target_page] || 0) + 1;
      });

      return Object.entries(map).map(([target_page, count]) => ({
        target_page,
        count,
      }));
    },
    refetchInterval: 15000, // Poll every 15s
  });

  // Realtime subscription for instant updates
  useEffect(() => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const getCount = (page: string): number => {
    return counts.find((c) => c.target_page === page)?.count || 0;
  };

  const markAsRead = useMutation({
    mutationFn: async (targetPage: string) => {
      let query = supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("portal", portal)
        .eq("target_page", targetPage)
        .eq("is_read", false);

      if (portal === "shop" && activeStoreId) {
        query = query.eq("store_id", activeStoreId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
    },
  });

  return { counts, getCount, markAsRead };
}
