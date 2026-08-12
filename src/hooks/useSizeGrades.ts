import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import type { SizeGrade } from "@/lib/sizeGrades";

/** Sorteringsregistret — klasser per artgrupp. */
export function useSizeGrades() {
  return useQuery({
    queryKey: ["size_grades"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("size_grades")
        .select("*")
        .order("species_group")
        .order("grade_no");
      if (error) throw error;
      return (data ?? []) as SizeGrade[];
    },
  });
}

export type SizeGradeDraft = Partial<SizeGrade> & { species_group: string; grade_no: number };

export function useSaveSizeGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draft: SizeGradeDraft) => {
      const row = {
        species_group: draft.species_group,
        grade_no: draft.grade_no,
        label: draft.label ?? String(draft.grade_no),
        min_weight_kg: draft.min_weight_kg ?? null,
        max_weight_kg: draft.max_weight_kg ?? null,
        min_count_per_kg: draft.min_count_per_kg ?? null,
        max_count_per_kg: draft.max_count_per_kg ?? null,
        note: draft.note ?? null,
        active: draft.active ?? true,
      };
      if (draft.id) {
        const { error } = await supabase.from("size_grades").update(row).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("size_grades").insert(row);
        if (error) throw error;
      }
      await logActivity({
        action_type: draft.id ? "update" : "create",
        description: `Sorteringsklass ${draft.species_group} ${draft.grade_no} ${draft.id ? "uppdaterad" : "skapad"}`,
        entity_type: "size_grade",
        entity_id: draft.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["size_grades"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteSizeGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("size_grades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["size_grades"] }),
  });
}

/** Partier med kvarvarande saldo som ligger på en spärrad grundprodukt. */
export function useLotsOnBlockedProducts() {
  return useQuery({
    queryKey: ["lots_on_blocked_products"],
    queryFn: async () => {
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id, sku, name, species_group")
        .eq("purchasable", false);
      if (pErr) throw pErr;
      const blocked = (products ?? []).filter((p) => p.species_group);
      if (blocked.length === 0) return [];
      const ids = blocked.map((p) => p.id);

      const { data: lots, error: lErr } = await supabase
        .from("lots")
        .select("id, lot_number, product_id, quantity_kg, unit_cost, best_before, species_fao_code, latin_name, created_at")
        .in("product_id", ids)
        .order("created_at", { ascending: false });
      if (lErr) throw lErr;
      if (!lots?.length) return [];

      const { data: moves, error: mErr } = await supabase
        .from("stock_movements")
        .select("lot_id, quantity_kg, location_id, storage_locations(name)")
        .in("lot_id", lots.map((l) => l.id));
      if (mErr) throw mErr;

      const balance = new Map<string, number>();
      const places = new Map<string, Set<string>>();
      for (const m of moves ?? []) {
        const key = String((m as any).lot_id);
        balance.set(key, (balance.get(key) ?? 0) + Number((m as any).quantity_kg || 0));
        const name = (m as any).storage_locations?.name;
        if (name) {
          const set = places.get(key) ?? new Set<string>();
          set.add(name);
          places.set(key, set);
        }
      }

      const productMap = new Map(blocked.map((p) => [p.id, p]));
      return lots
        .map((l) => ({
          ...l,
          product: productMap.get(l.product_id!),
          remaining_kg: Math.round((balance.get(l.id) ?? 0) * 1000) / 1000,
          locations: Array.from(places.get(l.id) ?? []),
        }))
        .filter((l) => l.remaining_kg > 0);
    },
  });
}

export function useReclassifyLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { lotId: string; productId: string }) => {
      const { data, error } = await supabase.rpc("reclassify_lot_product", {
        _lot_id: params.lotId,
        _new_product_id: params.productId,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lots_on_blocked_products"] });
      qc.invalidateQueries({ queryKey: ["lots_traceability"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/** Sparade kopplingar leverantörsartikel → produkt (systemets minne). */
export function useSupplierArticleMap() {
  return useQuery({
    queryKey: ["supplier_article_map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_article_map")
        .select("supplier_id, supplier_article_no, product_id");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Lär systemet ett manuellt val: nästa gång samma leverantörsartikel kommer in
 * matchas raden automatiskt.
 */
export async function learnSupplierArticle(
  supplierId: string | null | undefined,
  articleNo: string | null | undefined,
  productId: string,
) {
  const art = String(articleNo ?? "").trim();
  if (!supplierId || !art) return;
  const { data: existing } = await supabase
    .from("supplier_article_map")
    .select("id")
    .eq("supplier_id", supplierId)
    .eq("supplier_article_no", art)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from("supplier_article_map").update({ product_id: productId }).eq("id", existing.id);
  } else {
    await supabase
      .from("supplier_article_map")
      .insert({ supplier_id: supplierId, supplier_article_no: art, product_id: productId });
  }
}
