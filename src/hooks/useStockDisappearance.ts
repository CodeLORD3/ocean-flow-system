import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Vad som försvunnit ur en butiks lager under en period.
 *
 * Startsaldo plus inleveranser minus slutsaldo = försvunnet. Svinnrapporten
 * definierar hur mycket som slängts, resten är sålt.
 */
export interface DisappearanceRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  start_qty: number;
  received_qty: number;
  end_qty: number;
  disappeared_qty: number;
  waste_qty: number;
  sold_qty: number;
}

export function useStockDisappearance(
  storeId: string | null | undefined,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ["stock-disappearance", storeId, from, to],
    enabled: !!storeId && !!from && !!to,
    queryFn: async (): Promise<DisappearanceRow[]> => {
      const { data, error } = await supabase.rpc("store_stock_disappearance", {
        _store_id: storeId!,
        _from: from,
        _to: to,
      });
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        sku: r.sku,
        unit: r.unit || "kg",
        start_qty: Number(r.start_qty) || 0,
        received_qty: Number(r.received_qty) || 0,
        end_qty: Number(r.end_qty) || 0,
        disappeared_qty: Number(r.disappeared_qty) || 0,
        waste_qty: Number(r.waste_qty) || 0,
        sold_qty: Number(r.sold_qty) || 0,
      }));
    },
  });
}
