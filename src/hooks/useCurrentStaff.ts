import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CurrentStaff {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  store_id: string | null;
}

/**
 * Personalen kopplad till det INLOGGADE kontot (inte "aktiv användare"-väljaren).
 * Används där det måste gå att lita på vem som faktiskt utförde något.
 */
export function useCurrentStaff() {
  return useQuery({
    queryKey: ["current-staff"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CurrentStaff | null> => {
      const { data, error } = await supabase.rpc("current_staff");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as CurrentStaff) ?? null;
    },
  });
}

export function staffFullName(s?: CurrentStaff | null): string | null {
  if (!s) return null;
  const name = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}
