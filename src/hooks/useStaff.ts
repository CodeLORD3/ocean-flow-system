import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  age: number | null;
  phone: string | null;
  email: string | null;
  workplace: string | null;
  profile_image_url: string | null;
  store_id: string | null;
  created_at: string | null;
}

export function useStaff(storeId?: string) {
  return useQuery({
    queryKey: ["staff", storeId],
    queryFn: async () => {
      let q = supabase
        .from("staff")
        .select("*, stores(name)")
        .order("first_name", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as (StaffMember & { stores: { name: string } | null })[];
    },
  });
}

export function useCreateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Omit<StaffMember, "id" | "created_at">) => {
      const { data, error } = await supabase.from("staff").insert(params as any).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Personal skapad: ${params.first_name} ${params.last_name}`,
        entity_type: "staff",
        entity_id: data.id,
        store_id: params.store_id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useUpdateStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: Partial<StaffMember> & { id: string }) => {
      const { id, ...rest } = params;
      const { error } = await supabase.from("staff").update(rest as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}

export function useDeleteStaff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("staff").delete().eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "delete",
        description: `Personal borttagen`,
        entity_type: "staff",
        entity_id: id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff"] }),
  });
}
