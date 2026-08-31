import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HrNotification {
  id: string;
  template_key: string;
  category: string;
  body: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
  status: string;
}

const key = ["hr-notifications"];

export function useHrNotifications() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_notifications")
        .select("id, template_key, category, body, payload, created_at, read_at, status")
        .eq("channel", "in_app")
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) throw error;
      return (data ?? []) as HrNotification[];
    },
    refetchInterval: 15000,
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("hr_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .eq("channel", "in_app");
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });

  const unread = (query.data ?? []).filter((item) => !item.read_at);
  return { ...query, notifications: query.data ?? [], unread, markRead };
}
