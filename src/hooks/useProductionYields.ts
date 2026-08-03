import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";

export type Yield = Tables<"yields">;
export type CutSplit = Tables<"cut_splits">;
export type ProductionOrder = Tables<"production_orders">;
export type ProductionOrderLine = Tables<"production_order_lines">;
export type YieldActual = Tables<"yield_actuals">;
export type ProcessingSurcharge = Tables<"processing_surcharges">;
export type MarginTarget = Tables<"margin_targets">;
export type VatRate = Tables<"vat_rates">;
export type SpeciesCutModel = Tables<"species_cut_models">;
export type CutModelSplit = Tables<"cut_model_splits">;
export type DetailPrice = Tables<"detail_prices">;
export type AuctionCalc = Tables<"auction_calcs">;

/** Kanalprislistor. Butiken räknar inkl moms, grossisten exkl moms. */
export const PRICE_LIST_BUTIK = "butik_goteborg";
export const PRICE_LIST_GROSSIST = "grossist";


/* ── Styckningsmodeller ──────────────────────────────────────── */

export function useSpeciesCutModels() {
  return useQuery({
    queryKey: ["species_cut_models"],
    queryFn: async () => {
      const { data, error } = await supabase.from("species_cut_models").select("*").order("species_group");
      if (error) throw error;
      return data as SpeciesCutModel[];
    },
  });
}

export function useCutModelSplits() {
  return useQuery({
    queryKey: ["cut_model_splits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cut_model_splits")
        .select("*")
        .order("cut_model")
        .order("sort_order");
      if (error) throw error;
      return data as CutModelSplit[];
    },
  });
}

/* ── Referenspriser ──────────────────────────────────────────── */

export function useDetailPrices() {
  return useQuery({
    queryKey: ["detail_prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("detail_prices").select("*").order("species_group");
      if (error) throw error;
      return data as DetailPrice[];
    },
  });
}

export function useUpsertDetailPrice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      species_group: string;
      detail_form: string;
      price_list: string;
      /** Referenspris, alltså priset som gäller vid referenskostnaden. */
      price_incl_vat?: number | null;
      /** Råvarukostnad kr/kg som referenspriset avser. */
      reference_cost_per_kg?: number | null;
      role?: string;
    }) => {
      const payload: Record<string, any> = {
        species_group: row.species_group,
        detail_form: row.detail_form,
        price_list: row.price_list,
        cut_form: row.detail_form,
        valid_from: new Date().toISOString().slice(0, 10),
      };
      if (row.role) payload.role = row.role;
      if (row.price_incl_vat != null) {
        payload.price_incl_vat = row.price_incl_vat;
        payload.last_set_price = row.price_incl_vat;
      }
      if (row.reference_cost_per_kg !== undefined) {
        payload.reference_cost_per_kg = row.reference_cost_per_kg;
      }
      const { error } = await supabase
        .from("detail_prices")
        .upsert(payload as any, { onConflict: "price_list,species_group,detail_form" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["detail_prices"] }),
  });
}

/** Rad för en detalj i en given prislista. */
export function detailPriceRow(
  list: DetailPrice[],
  priceList: string,
  species: string,
  detailForm: string,
): DetailPrice | undefined {
  return list.find(
    (p) =>
      p.price_list === priceList &&
      (p.species_group ?? "").toLowerCase() === (species ?? "").toLowerCase() &&
      (p.detail_form ?? "").toLowerCase() === (detailForm ?? "").toLowerCase(),
  );
}

/** Referenspris för en detalj i en given prislista (null = pris saknas). */
export function priceFor(
  list: DetailPrice[],
  priceList: string,
  species: string,
  detailForm: string,
): number | null {
  const row = detailPriceRow(list, priceList, species, detailForm);
  const v = Number(row?.price_incl_vat ?? row?.last_set_price ?? 0);
  return v > 0 ? v : null;
}

/** Referenskostnad kr/kg som referenspriset avser (null = saknas). */
export function referenceCostFor(
  list: DetailPrice[],
  priceList: string,
  species: string,
  detailForm: string,
): number | null {
  const row = detailPriceRow(list, priceList, species, detailForm);
  const v = Number((row as any)?.reference_cost_per_kg ?? 0);
  return v > 0 ? v : null;
}



/* ── Auktionskalkyler ────────────────────────────────────────── */

export function useAuctionCalcs() {
  return useQuery({
    queryKey: ["auction_calcs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auction_calcs")
        .select("*")
        .order("calc_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as AuctionCalc[];
    },
  });
}

export function useSaveAuctionCalc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<AuctionCalc> & { species_group: string }) => {
      const { error } = await supabase.from("auction_calcs").insert(row as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auction_calcs"] }),
  });
}

export function useUpdateAuctionCalc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from("auction_calcs").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["auction_calcs"] }),
  });
}


/* ── Utbytesregister ─────────────────────────────────────────── */

export function useYields() {
  return useQuery({
    queryKey: ["yields"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("yields")
        .select("*")
        .order("species_group")
        .order("from_form");
      if (error) throw error;
      return data as Yield[];
    },
  });
}

export function useUpsertYield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<Yield> & { species_group: string; from_form: string; to_form: string; yield_pct: number }) => {
      const { error } = await supabase
        .from("yields")
        .upsert({ grade: "", ...row } as any, { onConflict: "species_group,from_form,to_form,grade" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yields"] }),
  });
}

export function useUpdateYield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Yield> & { id: string }) => {
      const { error } = await supabase.from("yields").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yields"] }),
  });
}

export function useDeleteYield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("yields").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["yields"] }),
  });
}

/* ── Detaljuppdelning ────────────────────────────────────────── */

export function useCutSplits() {
  return useQuery({
    queryKey: ["cut_splits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cut_splits")
        .select("*")
        .order("species_group")
        .order("sort_order");
      if (error) throw error;
      return data as CutSplit[];
    },
  });
}

export function useUpsertCutSplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: Partial<CutSplit> & { species_group: string; detail_form: string; pct_of_fillet: number }) => {
      const { error } = await supabase.from("cut_splits").upsert(row as any, { onConflict: "species_group,detail_form" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cut_splits"] }),
  });
}

export function useDeleteCutSplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cut_splits").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cut_splits"] }),
  });
}

/* ── Faktiskt utfall ─────────────────────────────────────────── */

export function useYieldActuals() {
  return useQuery({
    queryKey: ["yield_actuals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("yield_actuals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as YieldActual[];
    },
  });
}

/** Rullande snitt av de fem senaste verkliga utfallen per art/form. */
export function rollingAverage(actuals: YieldActual[], species: string, from: string, to: string) {
  const rows = actuals
    .filter((a) => a.species_group === species && a.from_form === from && a.to_form === to)
    .slice(0, 5);
  if (rows.length === 0) return null;
  const avg = rows.reduce((s, r) => s + Number(r.actual_pct), 0) / rows.length;
  return { avg, count: rows.length };
}

/* ── Inställningar ───────────────────────────────────────────── */

export function useProcessingSurcharges() {
  return useQuery({
    queryKey: ["processing_surcharges"],
    queryFn: async () => {
      const { data, error } = await supabase.from("processing_surcharges").select("*").order("category");
      if (error) throw error;
      return data as ProcessingSurcharge[];
    },
  });
}

export function useMarginTargets() {
  return useQuery({
    queryKey: ["margin_targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("margin_targets").select("*").order("region");
      if (error) throw error;
      return data as MarginTarget[];
    },
  });
}

export function useVatRates() {
  return useQuery({
    queryKey: ["vat_rates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vat_rates").select("*").order("category");
      if (error) throw error;
      return data as VatRate[];
    },
  });
}

export function useUpdateSetting(table: "processing_surcharges" | "margin_targets" | "vat_rates") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Record<string, any>) => {
      const { error } = await supabase.from(table).update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
}

/** Påslag kr/kg för en kategori (0 om det inte gäller). */
export function surchargeFor(list: ProcessingSurcharge[], category: string | null | undefined): number {
  const row = list.find((s) => s.category.toLowerCase() === (category ?? "").toLowerCase());
  if (!row || !row.applies) return 0;
  return Number(row.surcharge_per_kg) || 0;
}

/** Momssats för en kategori vid ett givet datum. */
export function vatFor(list: VatRate[], category: string | null | undefined, date = new Date()): number {
  const iso = date.toISOString().slice(0, 10);
  const valid = list.filter((v) => v.valid_from <= iso && (!v.valid_to || v.valid_to >= iso));
  const exact = valid.find((v) => v.category.toLowerCase() === (category ?? "").toLowerCase());
  if (exact) return Number(exact.rate);
  const fallback = valid.find((v) => v.category === "*");
  return fallback ? Number(fallback.rate) : 6;
}

/* ── Tillverkningsordrar ─────────────────────────────────────── */

export function useProductionOrders() {
  return useQuery({
    queryKey: ["production_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select("*, production_order_lines(*)")
        .order("production_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as (ProductionOrder & { production_order_lines: ProductionOrderLine[] })[];
    },
  });
}

export interface NewOrderLine {
  product_id: string | null;
  detail_name: string;
  detail_form: string;
  planned_pct: number;
  planned_qty: number;
  cost_price: number;
  margin_weight: number;
  is_processed: boolean;
  sort_order: number;
}

export function useCreateProductionOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      order: Partial<ProductionOrder> & { raw_name: string; raw_quantity: number };
      lines: NewOrderLine[];
      actuals?: { species_group: string; from_form: string; to_form: string; quantity_in: number; quantity_out: number; standard_pct: number }[];
    }) => {
      const { data: order, error } = await supabase
        .from("production_orders")
        .insert({ ...(params.order as any), status: "registered" })
        .select()
        .single();
      if (error) throw error;

      if (params.lines.length > 0) {
        const { error: lErr } = await supabase
          .from("production_order_lines")
          .insert(params.lines.map((l) => ({ ...l, order_id: order.id })) as any);
        if (lErr) throw lErr;
      }

      if (params.actuals?.length) {
        const rows = params.actuals.map((a) => {
          const actual_pct = a.quantity_in > 0 ? (a.quantity_out / a.quantity_in) * 100 : 0;
          return {
            order_id: order.id,
            species_group: a.species_group,
            from_form: a.from_form,
            to_form: a.to_form,
            quantity_in: a.quantity_in,
            quantity_out: a.quantity_out,
            actual_pct,
            standard_pct: a.standard_pct,
            deviation_pct: actual_pct - a.standard_pct,
          };
        });
        const { error: aErr } = await supabase.from("yield_actuals").insert(rows as any);
        if (aErr) throw aErr;
      }

      return order as ProductionOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["yield_actuals"] });
      qc.invalidateQueries({ queryKey: ["lagersaldo"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useUpdateOrderLineActual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; actual_qty: number | null; cost_price?: number }) => {
      const { id, ...updates } = params;
      const { error } = await supabase.from("production_order_lines").update(updates as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production_orders"] }),
  });
}

export function useRegisterActuals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      order: ProductionOrder;
      lines: { id: string; actual_qty: number; cost_price: number; detail_form: string; planned_pct: number }[];
    }) => {
      for (const l of params.lines) {
        const { error } = await supabase
          .from("production_order_lines")
          .update({ actual_qty: l.actual_qty, cost_price: l.cost_price } as any)
          .eq("id", l.id);
        if (error) throw error;
      }
      const totalOut = params.lines.reduce((s, l) => s + l.actual_qty, 0);
      const rawQty = Number(params.order.raw_quantity) || 0;
      const wastePct = rawQty > 0 ? Math.max(0, ((rawQty - totalOut) / rawQty) * 100) : 0;
      await supabase
        .from("production_orders")
        .update({ actual_waste_pct: wastePct, status: "completed" } as any)
        .eq("id", params.order.id);

      if (params.order.species_group) {
        const rows = params.lines.map((l) => {
          const actual_pct = rawQty > 0 ? (l.actual_qty / rawQty) * 100 : 0;
          return {
            order_id: params.order.id,
            species_group: params.order.species_group!,
            from_form: params.order.raw_form,
            to_form: l.detail_form,
            quantity_in: rawQty,
            quantity_out: l.actual_qty,
            actual_pct,
            standard_pct: l.planned_pct,
            deviation_pct: actual_pct - l.planned_pct,
          };
        });
        if (rows.length) await supabase.from("yield_actuals").insert(rows as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production_orders"] });
      qc.invalidateQueries({ queryKey: ["yield_actuals"] });
    },
  });
}
