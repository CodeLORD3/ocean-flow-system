import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Bolagslagret. Varje butik tillhör ett bolag under en period, aldrig fast.
 * Uppslag sker på datum via store_company_periods.
 */

export interface LegalEntity {
  legal_entity_id: string;
  legal_name: string;
  org_nr: string | null;
  country: string | null;
  currency: string | null;
  vat_registration: string | null;
  vat_regime: string | null;
  fiscal_year_end: string | null;
  active: boolean;
}

export interface StoreCompanyPeriod {
  id: string;
  store_id: string;
  legal_entity_id: string;
  valid_from: string;
  valid_to: string | null;
  note: string | null;
}

export interface IntercompanyInvoice {
  id: string;
  transfer_order_id: string;
  seller_legal_entity_id: string;
  buyer_legal_entity_id: string;
  currency: string;
  vat_regime: string | null;
  amount_ex_vat: number;
  vat_amount: number;
  status: string;
  document_number: string | null;
  note: string | null;
  created_at: string;
}

export function useLegalEntities() {
  return useQuery({
    queryKey: ["legal_entities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_entities" as any)
        .select("*")
        .order("legal_name");
      if (error) throw error;
      return (data ?? []) as any as LegalEntity[];
    },
  });
}

export function useSaveLegalEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<LegalEntity> & { legal_entity_id: string }) => {
      const { error } = await supabase
        .from("legal_entities" as any)
        .update({
          legal_name: input.legal_name,
          org_nr: input.org_nr || null,
          country: input.country || null,
          currency: input.currency || null,
          vat_registration: input.vat_registration || null,
          vat_regime: input.vat_regime || null,
          fiscal_year_end: input.fiscal_year_end || null,
          active: input.active ?? true,
        })
        .eq("legal_entity_id", input.legal_entity_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legal_entities"] }),
  });
}

export function useStoreCompanyPeriods() {
  return useQuery({
    queryKey: ["store_company_periods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_company_periods" as any)
        .select("*")
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as StoreCompanyPeriod[];
    },
  });
}

/** Flyttar en butik till nytt bolag: stänger öppen period och öppnar en ny. */
export function useMoveStoreToCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { store_id: string; legal_entity_id: string; valid_from: string; note?: string }) => {
      const prevEnd = new Date(input.valid_from);
      prevEnd.setDate(prevEnd.getDate() - 1);
      const { error: closeErr } = await supabase
        .from("store_company_periods" as any)
        .update({ valid_to: prevEnd.toISOString().slice(0, 10) })
        .eq("store_id", input.store_id)
        .is("valid_to", null);
      if (closeErr) throw closeErr;

      const { error } = await supabase.from("store_company_periods" as any).insert({
        store_id: input.store_id,
        legal_entity_id: input.legal_entity_id,
        valid_from: input.valid_from,
        note: input.note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_company_periods"] }),
  });
}

export function useIntercompanyInvoices() {
  return useQuery({
    queryKey: ["intercompany_invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intercompany_invoices" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as IntercompanyInvoice[];
    },
  });
}
