import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PosProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  vat_rate: number;
  unit_type: "piece" | "kg" | "custom";
  price_ore: number;
  image_url: string | null;
  barcode: string | null;
  active: boolean;
  sort_order: number;
}

export function usePosProducts() {
  return useQuery({
    queryKey: ["pos_products"],
    queryFn: async (): Promise<PosProduct[]> => {
      const { data, error } = await (supabase as any)
        .from("pos_products")
        .select("*")
        .eq("active", true)
        .order("category")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as PosProduct[];
    },
    staleTime: 60_000,
  });
}
