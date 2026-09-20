import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  cancelAuctionPurchase,
  createAuctionPurchase,
  nominalWeight,
  swedishToday,
  updateAuctionPurchase,
  type AuctionPurchaseRow,
  type NewAuctionPurchase,
} from "@/lib/auctionPurchases";

/** Dagens auktionsinköp med partiets uppgifter och tolkade förslag. */
export function useAuctionDay(date?: string) {
  const day = date ?? swedishToday();
  return useQuery({
    queryKey: ["auction_purchases", day],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_purchases")
        .select(
          "*, lots(id, lot_number, product_id, commercial_name, vessel_name, quantity_kg, colli_count, nominal_weight_per_colli, auction_status, auction_lot_number)",
        )
        .eq("purchase_date", day)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as AuctionPurchaseRow[];
    },
  });
}

/** Summering överst i dagens lista. */
export function auctionDaySummary(rows: AuctionPurchaseRow[]) {
  const live = rows.filter((r) => r.status !== "makulerat");
  let weight = 0;
  let amount = 0;
  let missingWeight = 0;
  for (const row of live) {
    const w = nominalWeight(row);
    if (w === null) {
      missingWeight += 1;
      continue;
    }
    weight += w;
    amount += w * Number(row.price_per_kg);
  }
  return {
    count: live.length,
    colli: live.reduce((sum, r) => sum + Number(r.colli || 0), 0),
    weight: Math.round(weight * 10) / 10,
    amount: Math.round(amount),
    missingWeight,
  };
}

export function useCreateAuctionPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewAuctionPurchase) => createAuctionPurchase(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auction_purchases"] }),
  });
}

export function useCancelAuctionPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ row, reason }: { row: AuctionPurchaseRow; reason: string }) =>
      cancelAuctionPurchase(row, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auction_purchases"] }),
  });
}

export function useUpdateAuctionPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; pricePerKg?: number; colli?: number }) =>
      updateAuctionPurchase(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auction_purchases"] }),
  });
}

/** Delar en låda i delpartier med egna destinationer. */
export function useSplitAuctionLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ row, parts }: { row: AuctionPurchaseRow; parts: SplitPart[] }) =>
      splitAuctionLot(row, parts),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["auction_purchases"] });
      qc.invalidateQueries({ queryKey: ["lot_split_children", vars.row.lot_id] });
    },
  });
}
