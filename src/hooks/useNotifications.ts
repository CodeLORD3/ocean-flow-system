import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useEffect } from "react";

interface NotificationRow {
  id: string;
  target_page: string;
  message: string;
  created_at: string;
}

/**
 * Notiser är personliga: varje inloggat konto har sina egna läsmarkeringar i
 * notification_reads. Att en kollega i samma portal läst en notis påverkar
 * alltså inte dina olästa notiser.
 */
export function useNotifications() {
  const { site, activeStoreId } = useSite();
  const queryClient = useQueryClient();

  const portal = site === "shop" ? "shop" : site === "production" ? "production" : "wholesale";

  const { data: userId = null } = useQuery<string | null>({
    queryKey: ["auth-user-id"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: unread = [] } = useQuery<NotificationRow[]>({
    queryKey: ["notification-counts", portal, activeStoreId, userId],
    enabled: !!userId,
    queryFn: async () => {

      let query = supabase
        .from("notifications")
        .select("id, target_page, message, created_at")
        .eq("portal", portal)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(500);

      if (portal === "shop" && activeStoreId) {
        query = query.eq("store_id", activeStoreId);
      }

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data || []) as NotificationRow[];
      if (!rows.length) return [];

      // Filtrera bort de notiser som just det här kontot redan läst.
      const { data: reads, error: readErr } = await supabase
        .from("notification_reads")
        .select("notification_id")
        .in(
          "notification_id",
          rows.map((r) => r.id)
        );
      if (readErr) throw readErr;
      const seen = new Set((reads || []).map((r) => r.notification_id));
      return rows.filter((r) => !seen.has(r.id));
    },
    refetchInterval: 15000,
  });

  // Realtime: både nya notiser och egna läsmarkeringar
  useEffect(() => {
    const invalidate = () =>
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });

    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notification_reads" },
        invalidate
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const counts = Object.entries(
    unread.reduce<Record<string, number>>((acc, n) => {
      acc[n.target_page] = (acc[n.target_page] || 0) + 1;
      return acc;
    }, {})
  ).map(([target_page, count]) => ({ target_page, count }));

  const getCount = (page: string): number =>
    counts.find((c) => c.target_page === page)?.count || 0;

  const markAsRead = useMutation({
    mutationFn: async (targetPage: string) => {
      if (!userId) return;
      const ids = unread.filter((n) => n.target_page === targetPage).map((n) => n.id);
      if (!ids.length) return;
      const { error } = await supabase
        .from("notification_reads")
        .upsert(
          ids.map((notification_id) => ({ notification_id, user_id: userId })),
          { onConflict: "notification_id,user_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      if (!userId || !unread.length) return;
      const { error } = await supabase
        .from("notification_reads")
        .upsert(
          unread.map((n) => ({ notification_id: n.id, user_id: userId })),
          { onConflict: "notification_id,user_id", ignoreDuplicates: true }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-counts"] });
    },
  });

  return { counts, unread, total: unread.length, getCount, markAsRead, markAllAsRead };
}
