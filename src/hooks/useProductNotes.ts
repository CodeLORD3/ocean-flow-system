import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProductNote {
  productId: string;
  note: string;
  byName: string | null;
  at: string | null;
}

/**
 * Anteckningar som ligger kvar på varorna i en butik. Tabellen kan saknas i ett
 * utkast — då blir listan tom i stället för ett fel i telefonen.
 */
export function useProductNotes(storeId?: string | null) {
  return useQuery({
    queryKey: ["product-notes", storeId],
    enabled: !!storeId,
    queryFn: async (): Promise<Map<string, ProductNote>> => {
      const map = new Map<string, ProductNote>();
      const { data, error } = await (supabase as any)
        .from("product_notes")
        .select("product_id, note, created_by_name, updated_at")
        .eq("store_id", storeId!);
      if (error) return map;
      for (const r of (data || []) as any[])
        map.set(r.product_id, {
          productId: r.product_id,
          note: r.note ?? "",
          byName: r.created_by_name ?? null,
          at: r.updated_at ?? null,
        });
      return map;
    },
  });
}

/** Sparar (eller tömmer) anteckningen på en vara. */
export function useSaveProductNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      productId,
      note,
      staffId,
      staffName,
    }: {
      storeId: string;
      productId: string;
      note: string;
      staffId?: string | null;
      staffName?: string | null;
    }) => {
      const text = note.trim();
      if (!text) {
        const { error } = await (supabase as any)
          .from("product_notes")
          .delete()
          .eq("store_id", storeId)
          .eq("product_id", productId);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("product_notes").upsert(
        {
          store_id: storeId,
          product_id: productId,
          note: text,
          created_by: staffId ?? null,
          created_by_name: staffName ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,store_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["product-notes", v.storeId] });
    },
  });
}
