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

/**
 * Personal per butik.
 *
 * En person kan vara kopplad till flera butiker: hemmabutiken (store_id) plus
 * de butiker som behörigheten (user_scopes) ger. Tom butikslista + butiksportal
 * = alla butiker, och då syns personen i varje butiks personallista.
 */
export function useStaff(storeId?: string) {
  return useQuery({
    queryKey: ["staff", storeId],
    queryFn: async () => {
      // staff_access = personal + behörigheter (user_scopes) i en vy.
      const { data, error } = await supabase
        .from("staff_access")
        .select("*")
        .order("first_name", { ascending: true });
      if (error) throw error;
      let rows = (data ?? []) as any[];
      if (storeId) {
        rows = rows.filter((r) => {
          const ids: string[] = r.allowed_store_ids ?? [];
          const portals: string[] = r.portal_access ?? [];
          if (r.store_id === storeId) return true;
          if (ids.includes(storeId)) return true;
          // Tom lista = alla butiker
          return ids.length === 0 && portals.includes("shop");
        });
      }
      return rows.map((r) => ({
        ...r,
        stores: r.store_name ? { name: r.store_name } : null,
      })) as (StaffMember & { stores: { name: string } | null })[];
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
      await logActivity({
        action_type: "update",
        description: `Personal uppdaterad: ${rest.first_name || ""} ${rest.last_name || ""}`.trim(),
        entity_type: "staff",
        entity_id: id,
        store_id: rest.store_id,
      });
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
