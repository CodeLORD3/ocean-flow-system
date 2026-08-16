import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { resolveVatRate, type VatRateRow } from "@/lib/vatRates";
import type { CatalogDiff, CatalogRow } from "@/lib/sumupCatalog";

/** Bolaget och butiken som säljer i CHF via SumUp. */
export const CH_ENTITY_ID = "fsab-ch";

export type SumupCatalogAudit = {
  id: string;
  merchant_code: string;
  legal_entity_id: string | null;
  currency: string;
  source_filename: string | null;
  row_count: number;
  matched_count: number;
  price_diff_count: number;
  missing_in_pos_count: number;
  missing_in_erp_count: number;
  details: any;
  created_at: string;
};

/**
 * Aktuellt CHF-sortiment för Zollikon: senaste prislistan per produkt ur den
 * kassamarkerade prislistan för det schweiziska bolaget, med moms per kategori.
 */
export function useChCatalog(entityId = CH_ENTITY_ID) {
  return useQuery({
    queryKey: ["ch-catalog", entityId],
    queryFn: async (): Promise<{ rows: CatalogRow[]; currency: string; listName: string | null }> => {
      const { data: lists, error: lerr } = await (supabase as any)
        .from("price_lists")
        .select("id, name, currency, valid_from, pos_enabled, legal_entity_id")
        .eq("legal_entity_id", entityId)
        .eq("pos_enabled", true)
        .order("valid_from", { ascending: false })
        .limit(1);
      if (lerr) throw lerr;
      const list = (lists ?? [])[0];
      if (!list) return { rows: [], currency: "CHF", listName: null };

      const { data: items, error: ierr } = await (supabase as any)
        .from("price_list_items")
        .select("product_id, product_name, sku, unit, category, price, vat_rate, pos_enabled")
        .eq("price_list_id", list.id)
        .order("sort_order");
      if (ierr) throw ierr;

      const { data: vats } = await (supabase as any)
        .from("vat_rates")
        .select("legal_entity_id, category, rate");

      const currency = (list.currency ?? "CHF").toUpperCase();
      const rows: CatalogRow[] = (items ?? [])
        .filter((i: any) => i.pos_enabled !== false)
        .map((i: any) => ({
          product_id: i.product_id,
          name: i.product_name,
          sku: i.sku,
          unit: i.unit,
          category: i.category,
          price: Number(i.price ?? 0),
          vat_rate:
            i.vat_rate != null
              ? Number(i.vat_rate)
              : resolveVatRate((vats ?? []) as VatRateRow[], entityId, i.category, currency),
        }));
      return { rows, currency, listName: list.name };
    },
  });
}

export function useSumupCatalogAudits(limit = 10) {
  return useQuery({
    queryKey: ["sumup-catalog-audits", limit],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sumup_catalog_audits")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SumupCatalogAudit[];
    },
  });
}

/** Sparar en katalogavstämning så avvikelserna finns kvar i historiken. */
export function useSaveCatalogAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      merchantCode: string;
      storeId?: string | null;
      currency: string;
      filename: string | null;
      diff: CatalogDiff;
    }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("sumup_catalog_audits").insert({
        merchant_code: input.merchantCode,
        legal_entity_id: CH_ENTITY_ID,
        store_id: input.storeId ?? null,
        currency: input.currency,
        source_filename: input.filename,
        row_count: input.diff.rows.length,
        matched_count: input.diff.matched,
        price_diff_count: input.diff.priceDiff,
        missing_in_pos_count: input.diff.missingInPos,
        missing_in_erp_count: input.diff.missingInErp,
        details: input.diff.rows.filter((r) => r.kind !== "ok").slice(0, 500),
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sumup-catalog-audits"] }),
  });
}
