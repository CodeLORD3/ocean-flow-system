import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Antal nya telefonmeddelanden. RLS ger 0 för icke-admin. */
export function useNyaTelefonMeddelanden() {
  return useQuery({
    queryKey: ["telefon-nya-meddelanden"],
    queryFn: async () => {
      const { count } = await (supabase as unknown as { from: (t: string) => any })
        .from("telefonsamtal").select("id", { count: "exact", head: true })
        .eq("atgard", "meddelande").eq("status", "ny");
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
}
