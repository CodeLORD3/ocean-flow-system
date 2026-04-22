import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserSession {
  id: string;
  user_id: string;
  staff_id: string | null;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  duration_seconds: number | null;
  user_agent: string | null;
  portal: string | null;
}

export interface PageVisit {
  id: string;
  user_id: string;
  staff_id: string | null;
  session_id: string | null;
  path: string;
  page_title: string | null;
  visited_at: string;
  portal: string | null;
}

export function useStaffSessions(staffId: string | null | undefined, userId?: string | null) {
  return useQuery({
    queryKey: ["staff-sessions", staffId, userId],
    enabled: !!(staffId || userId),
    queryFn: async () => {
      let q = supabase
        .from("user_sessions")
        .select("*")
        .order("login_at", { ascending: false })
        .limit(100);
      if (staffId && userId) {
        q = q.or(`staff_id.eq.${staffId},user_id.eq.${userId}`);
      } else if (staffId) {
        q = q.eq("staff_id", staffId);
      } else if (userId) {
        q = q.eq("user_id", userId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UserSession[];
    },
  });
}

export function useStaffPageVisits(staffId: string | null | undefined, userId?: string | null) {
  return useQuery({
    queryKey: ["staff-page-visits", staffId, userId],
    enabled: !!(staffId || userId),
    queryFn: async () => {
      let q = supabase
        .from("page_visits")
        .select("*")
        .order("visited_at", { ascending: false })
        .limit(200);
      if (staffId && userId) {
        q = q.or(`staff_id.eq.${staffId},user_id.eq.${userId}`);
      } else if (staffId) {
        q = q.eq("staff_id", staffId);
      } else if (userId) {
        q = q.eq("user_id", userId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PageVisit[];
    },
  });
}

export function useStaffActivityActions(performedBy: string | null | undefined) {
  return useQuery({
    queryKey: ["staff-activity", performedBy],
    enabled: !!performedBy,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("performed_by", performedBy!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAuthUsers() {
  // Lists auth user emails — used for manual linking
  // Note: regular client cannot read auth.users; we fetch from staff that have user_id, plus current.
  // Provide a lightweight lookup of staff records that already have user_id linked.
  return useQuery({
    queryKey: ["staff-with-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, email, user_id")
        .not("user_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });
}
