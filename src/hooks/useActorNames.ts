import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Slår upp personalnamn för user_id (created_by/updated_by).
 * Namnen kommer från personalregistret via vyn actor_names.
 */
export function useActorNames() {
  const query = useQuery({
    queryKey: ["actor_names"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("actor_names")
        .select("user_id, display_name");
      if (error) throw error;
      const map = new Map<string, string>();
      for (const row of data || []) {
        if (row.user_id && row.display_name) map.set(row.user_id, row.display_name);
      }
      return map;
    },
  });

  const names = query.data ?? new Map<string, string>();
  return {
    ...query,
    names,
    nameOf: (id?: string | null) => (id ? names.get(id) : undefined),
  };
}
