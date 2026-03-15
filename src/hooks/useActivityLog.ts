import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ActivityLog {
  id: string;
  created_at: string;
  store_id: string | null;
  portal: string;
  action_type: string;
  description: string;
  entity_type: string | null;
  entity_id: string | null;
  performed_by: string | null;
  details: Record<string, unknown> | null;
}

export function useActivityLogs(options?: { storeId?: string; portal?: string; limit?: number }) {
  const { storeId, portal, limit = 200 } = options || {};
  return useQuery({
    queryKey: ["activity_logs", storeId, portal, limit],
    queryFn: async () => {
      let q = supabase
        .from("activity_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (storeId) q = q.eq("store_id", storeId);
      if (portal) q = q.eq("portal", portal);
      const { data, error } = await q;
      if (error) throw error;
      return data as ActivityLog[];
    },
  });
}

export function useLogActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      action_type: string;
      description: string;
      portal?: string;
      store_id?: string | null;
      entity_type?: string;
      entity_id?: string;
      performed_by?: string;
      details?: Record<string, unknown>;
    }) => {
      const { error } = await supabase.from("activity_logs").insert({
        action_type: params.action_type,
        description: params.description,
        portal: params.portal || "wholesale",
        store_id: params.store_id || null,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        performed_by: params.performed_by,
        details: params.details,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["activity_logs"] }),
  });
}

/** Fire-and-forget log helper for use outside of React components */
export async function logActivity(params: {
  action_type: string;
  description: string;
  portal?: string;
  store_id?: string | null;
  entity_type?: string;
  entity_id?: string;
  performed_by?: string;
  details?: Record<string, unknown>;
}) {
  await supabase.from("activity_logs").insert({
    action_type: params.action_type,
    description: params.description,
    portal: params.portal || "wholesale",
    store_id: params.store_id || null,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    performed_by: params.performed_by,
    details: params.details,
  } as any);
}
