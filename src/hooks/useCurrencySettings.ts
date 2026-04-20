import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type CurrencySettings = {
  id: string;
  sek_to_chf: number;
  transport_chf_per_kg: number;
};

export function useCurrencySettings() {
  return useQuery({
    queryKey: ["currency_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as CurrencySettings | null) ?? {
        id: "",
        sek_to_chf: 0.095,
        transport_chf_per_kg: 5,
      };
    },
  });
}

export function useUpdateCurrencySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; sek_to_chf: number; transport_chf_per_kg: number }) => {
      if (!params.id) {
        const { error } = await supabase.from("currency_settings").insert({
          sek_to_chf: params.sek_to_chf,
          transport_chf_per_kg: params.transport_chf_per_kg,
        });
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("currency_settings")
        .update({
          sek_to_chf: params.sek_to_chf,
          transport_chf_per_kg: params.transport_chf_per_kg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currency_settings"] }),
  });
}

/**
 * Convert a SEK cost to a CHF cost adding a per-kg transport surcharge.
 * Used when stock arrives at a CHF-based shop (Zollikon).
 */
export function convertSekToChfCost(sekCost: number, settings: { sek_to_chf: number; transport_chf_per_kg: number }) {
  return Number((sekCost * settings.sek_to_chf + settings.transport_chf_per_kg).toFixed(2));
}
