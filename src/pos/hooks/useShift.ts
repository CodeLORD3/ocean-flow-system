import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PosShift {
  id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string | null;
  opening_float_ore: number;
  closing_cash_ore: number | null;
  notes: string | null;
}

export function useOpenShift(cashierId: string | undefined) {
  return useQuery({
    queryKey: ["pos_open_shift", cashierId],
    enabled: !!cashierId,
    queryFn: async (): Promise<PosShift | null> => {
      const { data, error } = await (supabase as any)
        .from("pos_shifts")
        .select("*")
        .eq("cashier_id", cashierId!)
        .is("closed_at", null)
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as PosShift) ?? null;
    },
  });
}
