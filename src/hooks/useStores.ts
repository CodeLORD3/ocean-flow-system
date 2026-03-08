import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables, TablesUpdate } from "@/integrations/supabase/types";

export type Store = Tables<"stores">;

export function useStores(wholesaleOnly = false) {
  return useQuery({
    queryKey: ["stores", wholesaleOnly],
    queryFn: async () => {
      let q = supabase.from("stores").select("*").order("name");
      if (wholesaleOnly) q = q.eq("is_wholesale", false);
      const { data, error } = await q;
      if (error) throw error;
      return data as Store[];
    },
  });
}

export function useUpdateStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: TablesUpdate<"stores"> & { id: string }) => {
      const { data, error } = await supabase.from("stores").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}
