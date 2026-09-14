import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchEffectiveCosts } from "@/lib/effectiveCost";
import { setBalance } from "@/lib/stockLedger";
import { isoWeekOf } from "@/lib/purchaseReconciliation";

const db = supabase as any;

/** Veckoetikett i samma format som butiksordrarna sparas med, t.ex. "V38". */
export const orderWeekLabel = (dateIso: string) => `V${isoWeekOf(dateIso).week}`;

/**
 * Butikens lagerplats för snabbinmatning från totallistan. Butiksplatsen väljs
 * först, annars första aktiva platsen — samma platser som inventeringen använder.
 */
export function useStoreEntryLocation(storeId: string | null | undefined) {
  return useQuery({
    queryKey: ["total_list_entry_location", storeId ?? "none"],
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<{ id: string; name: string } | null> => {
      const { data, error } = await db
        .from("storage_locations")
        .select("id, name, location_type")
        .eq("store_id", storeId)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const butik = rows.find((r) => r.location_type === "butik");
      const pick = butik ?? rows[0];
      return pick ? { id: pick.id, name: pick.name } : null;
    },
  });
}

/**
 * Skriver in beställd mängd hos grossisten från totallistan. Mängden hamnar på
 * butikens öppna beställning för veckan — den skapas om den inte finns.
 * Mängd 0 tar bort raden igen.
 */
export function useSaveTotalListOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      storeId: string;
      productId: string;
      quantity: number;
      unit?: string | null;
      /** Datum i perioden — styr vilken vecka beställningen hör till. */
      dateIso: string;
    }) => {
      const week = orderWeekLabel(params.dateIso);

      const { data: existing, error: findErr } = await db
        .from("shop_orders")
        .select("id")
        .eq("store_id", params.storeId)
        .eq("order_week", week)
        .eq("status", "Öppen")
        .order("created_at", { ascending: false })
        .limit(1);
      if (findErr) throw findErr;

      let orderId: string | undefined = (existing ?? [])[0]?.id;
      if (!orderId) {
        if (params.quantity <= 0) return null;
        const { data: created, error: createErr } = await db
          .from("shop_orders")
          .insert({ store_id: params.storeId, order_week: week, status: "Öppen" })
          .select("id")
          .single();
        if (createErr) throw createErr;
        orderId = created.id;
      }

      const { data: lines, error: lineErr } = await db
        .from("shop_order_lines")
        .select("id, quantity_ordered")
        .eq("shop_order_id", orderId)
        .eq("product_id", params.productId)
        .limit(1);
      if (lineErr) throw lineErr;
      const line = (lines ?? [])[0];

      if (params.quantity <= 0) {
        if (line) {
          const { error } = await db.from("shop_order_lines").delete().eq("id", line.id);
          if (error) throw error;
        }
        return null;
      }

      if (line) {
        const { error } = await db
          .from("shop_order_lines")
          .update({ quantity_ordered: params.quantity })
          .eq("id", line.id);
        if (error) throw error;
        return line.id as string;
      }

      // Gällande pris låses på raden vid ordertillfället, som i övriga orderflöden.
      const costMap = await fetchEffectiveCosts([params.productId]);
      const eff = costMap.get(params.productId);
      const { data: inserted, error } = await db
        .from("shop_order_lines")
        .insert({
          shop_order_id: orderId,
          product_id: params.productId,
          quantity_ordered: params.quantity,
          unit: params.unit ?? undefined,
          order_date: params.dateIso,
          delivery_date: params.dateIso,
          cost_at_order: eff ? eff.value : null,
          cost_source_at_order: eff ? eff.source : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return inserted.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["recon_shop_order_lines"] });
    },
  });
}

/**
 * Snabbjustering av butikens lagersaldo från totallistan. Skrivs alltid som en
 * spårbar lagerrörelse (inventering) — aldrig direkt mot saldotabellen.
 */
export function useSaveTotalListStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      productId: string;
      locationId: string;
      quantity: number;
      note?: string | null;
    }) => {
      await setBalance({
        productId: params.productId,
        locationId: params.locationId,
        targetQuantityKg: params.quantity,
        movementType: "inventering",
        note: params.note ?? "Totallista",
        referenceType: "total_list",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["total_list_store_stock"] });
      qc.invalidateQueries({ queryKey: ["stock_by_location"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
    },
  });
}
