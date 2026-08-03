import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { speciesKey } from "@/lib/asciiFold";
import { rollingPurchaseAverage } from "@/lib/filletMath";

export interface DetailPriceApplication {
  id: string;
  price_list: string;
  species_group: string;
  detail_form: string;
  product_id: string | null;
  applied_price: number;
  reference_price: number | null;
  scale_factor: number | null;
  avg_cost_per_kg: number | null;
  yield_pct: number | null;
  manual_override: boolean;
  production_order_id: string | null;
  applied_by: string | null;
  created_at: string;
}

/** Nyckel för senast satta pris: prislista + produkt. */
export const applicationKey = (priceList: string, productId: string) => `${priceList}::${productId}`;

/**
 * Senaste appliceringen per produkt och prislista. Används för att visa vad
 * priset var förra gången och för samma dygn-kontrollen.
 */
export function useLatestPriceApplications() {
  return useQuery({
    queryKey: ["detail_price_applications", "latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("detail_price_applications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const map = new Map<string, DetailPriceApplication>();
      for (const row of (data ?? []) as any[]) {
        if (!row.product_id) continue;
        const key = applicationKey(row.price_list, row.product_id);
        if (!map.has(key)) map.set(key, row as DetailPriceApplication);
      }
      return map;
    },
    staleTime: 30_000,
  });
}

/** Sattes priset inom det senaste dygnet? */
export function isSameDayApplication(row?: DetailPriceApplication | null): boolean {
  if (!row) return false;
  return Date.now() - new Date(row.created_at).getTime() < 24 * 60 * 60 * 1000;
}

export interface ApplyPriceParams {
  priceList: string;
  /** Prislistan räknar inkl moms (butik) eller exkl moms (grossist). */
  inclVat: boolean;
  speciesGroup: string;
  detailForm: string;
  productId: string;
  price: number;
  referencePrice?: number | null;
  scaleFactor?: number | null;
  avgCostPerKg?: number | null;
  yieldPct?: number | null;
  manualOverride?: boolean;
  productionOrderId?: string | null;
  appliedBy?: string | null;
  orderLabel?: string | null;
}

/**
 * Applicerar ett utpris. Priset landar på produkten — butikskanalen skriver
 * retail_suggested (inkl moms) och grossistkanalen wholesale_price (exkl moms)
 * — och loggas både i price_history och i detail_price_applications.
 * Referenspriset i detail_prices lämnas orört, även vid manuell överskrivning.
 */
export function useApplyDetailPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ApplyPriceParams) => {
      const field = p.inclVat ? "retail_suggested" : "wholesale_price";

      const { data: current, error: readErr } = await supabase
        .from("products")
        .select("cost_price, wholesale_price, retail_suggested")
        .eq("id", p.productId)
        .maybeSingle();
      if (readErr) throw readErr;

      const { error: upErr } = await supabase
        .from("products")
        .update({ [field]: p.price } as any)
        .eq("id", p.productId);
      if (upErr) throw upErr;

      const { error: histErr } = await supabase.from("price_history").insert({
        product_id: p.productId,
        cost_price: current?.cost_price ?? null,
        wholesale_price: p.inclVat ? (current?.wholesale_price ?? null) : p.price,
        retail_suggested: p.inclVat ? p.price : (current?.retail_suggested ?? null),
        changed_by: p.appliedBy ?? null,
        reason: p.orderLabel ? `Tillverkningsorder ${p.orderLabel}` : "Tillverkningsorder",
      } as any);
      if (histErr) throw histErr;

      const { error: appErr } = await supabase.from("detail_price_applications").insert({
        price_list: p.priceList,
        species_group: p.speciesGroup,
        detail_form: p.detailForm,
        product_id: p.productId,
        applied_price: p.price,
        reference_price: p.referencePrice ?? null,
        scale_factor: p.scaleFactor ?? null,
        avg_cost_per_kg: p.avgCostPerKg ?? null,
        yield_pct: p.yieldPct ?? null,
        manual_override: Boolean(p.manualOverride),
        production_order_id: p.productionOrderId ?? null,
        applied_by: p.appliedBy ?? null,
      } as any);
      if (appErr) throw appErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["price_history"] });
      qc.invalidateQueries({ queryKey: ["detail_price_applications"] });
    },
  });
}

export interface SpeciesPurchaseStat {
  speciesGroup: string;
  /** Antal inköpsrader — används för att sortera de viktigaste arterna först. */
  purchaseCount: number;
  /** Rullande snitt av de tre senaste inköpen, kr/kg. */
  rollingAvgCost: number | null;
}

/**
 * Inköpsfrekvens och rullande snittkostnad per artgrupp, hämtat ur
 * inköpsrapportraderna. Ger både sorteringen och förslaget på referenskostnad.
 */
export function useSpeciesPurchaseStats() {
  return useQuery({
    queryKey: ["species_purchase_stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_report_lines")
        .select("unit_price, purchase_date, created_at, products!inner(species_group)")
        .order("purchase_date", { ascending: false })
        .limit(2000);
      if (error) throw error;

      const buckets = new Map<string, { species: string; rows: any[] }>();
      for (const row of (data ?? []) as any[]) {
        const species = row.products?.species_group;
        if (!species) continue;
        const key = speciesKey(species);
        if (!buckets.has(key)) buckets.set(key, { species, rows: [] });
        buckets.get(key)!.rows.push(row);
      }

      const stats = new Map<string, SpeciesPurchaseStat>();
      for (const [key, b] of buckets) {
        stats.set(key, {
          speciesGroup: b.species,
          purchaseCount: b.rows.length,
          rollingAvgCost: rollingPurchaseAverage(b.rows, 3),
        });
      }
      return stats;
    },
    staleTime: 60_000,
  });
}
