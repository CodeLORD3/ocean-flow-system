import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Anläggningsregister enligt 853/2004. Varje anläggning bär godkännandenummer
 * och identifieringsmärke. Butiker och lagerplatser pekar på sin anläggning.
 */

export interface Establishment {
  id: string;
  name: string;
  approval_number: string | null;
  identification_mark: string | null;
  mark_image: string | null;
  approval_type: string | null;
  control_authority: string | null;
  legal_entity_id: string | null;
  registered_at: string | null;
  valid_to: string | null;
  active: boolean;
  note: string | null;
}

export function useEstablishments() {
  return useQuery({
    queryKey: ["establishments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as any as Establishment[];
    },
  });
}

export function useSaveEstablishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Establishment>) => {
      const payload = {
        name: input.name,
        approval_number: input.approval_number || null,
        identification_mark: input.identification_mark || null,
        approval_type: input.approval_type || null,
        control_authority: input.control_authority || null,
        legal_entity_id: input.legal_entity_id || null,
        registered_at: input.registered_at || null,
        valid_to: input.valid_to || null,
        active: input.active ?? true,
        note: input.note || null,
      };
      if (input.id) {
        const { error } = await supabase
          .from("establishments" as any)
          .update(payload)
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("establishments" as any)
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      return (data as any).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["establishments"] }),
  });
}

/** Butiker med anläggningskoppling och kravflagga. */
export function useMarkReceivers() {
  return useQuery({
    queryKey: ["mark_receivers"],
    queryFn: async () => {
      const [stores, customers] = await Promise.all([
        supabase
          .from("stores" as any)
          .select("id, name, establishment_id, requires_identification_mark, legal_entity_id")
          .order("name"),
        supabase
          .from("customers_retail" as any)
          .select("id, name, customer_type, requires_identification_mark, store_id")
          .order("name")
          .limit(500),
      ]);
      if (stores.error) throw stores.error;
      if (customers.error) throw customers.error;
      return {
        stores: (stores.data ?? []) as any[],
        customers: (customers.data ?? []) as any[],
      };
    },
  });
}

export function useUpdateStoreEstablishment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      storeId: string;
      establishmentId?: string | null;
      requiresMark?: boolean;
    }) => {
      const patch: Record<string, any> = {};
      if (input.establishmentId !== undefined) patch.establishment_id = input.establishmentId || null;
      if (input.requiresMark !== undefined) patch.requires_identification_mark = input.requiresMark;
      const { error } = await supabase.from("stores" as any).update(patch).eq("id", input.storeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mark_receivers"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

export function useUpdateCustomerMark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { customerId: string; requiresMark: boolean }) => {
      const { error } = await supabase
        .from("customers_retail" as any)
        .update({ requires_identification_mark: input.requiresMark })
        .eq("id", input.customerId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mark_receivers"] }),
  });
}
