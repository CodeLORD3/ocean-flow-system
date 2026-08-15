import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CustomerOrder, RetailCustomer } from "@/lib/customerOrders";

const db = supabase as any;

const ORDER_SELECT =
  "*, stores(id, name), customers_retail(*), customer_order_lines(*, products!customer_order_lines_product_id_fkey(id, name, sku, unit, image_url, shelf_life_days, shelf_life_open_days, category, allergens), lots(id, lot_number, best_before))";

/** En enskild butikskund (privat eller organisation) för kundkortet. */
export function useRetailCustomer(id?: string | null) {
  return useQuery({
    queryKey: ["customers_retail", "one", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await db
        .from("customers_retail")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as RetailCustomer | null;
    },
  });
}

/**
 * Alla beställningar för kunden, i hela kedjan och oavsett arkivstatus.
 * Kundkortet ska visa aktivitet över butiker, inte bara vald butik.
 */
export function useOrdersForCustomer(customerId?: string | null) {
  return useQuery({
    queryKey: ["customer_orders", "by-customer", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_orders")
        .select(ORDER_SELECT)
        .eq("customer_id", customerId)
        .order("wanted_date", { ascending: false });
      if (error) throw error;
      return (data || []) as CustomerOrder[];
    },
  });
}

/* ------------------------------------------------------------- preferenser */

export interface CustomerPreference {
  id: string;
  customer_id: string;
  body: string;
  sort_order: number;
  created_by_name: string | null;
  created_at: string;
}

export function useCustomerPreferences(customerId?: string | null) {
  return useQuery({
    queryKey: ["customer_retail_preferences", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_retail_preferences")
        .select("*")
        .eq("customer_id", customerId)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data || []) as CustomerPreference[];
    },
  });
}

async function actor() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  let name: string | null = auth?.user?.email ?? null;
  if (uid) {
    const { data: st } = await db
      .from("staff")
      .select("first_name, last_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (st) name = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || name;
  }
  return { uid, name };
}

export function useSavePreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id?: string; customer_id: string; body: string; sort_order?: number }) => {
      if (p.id) {
        const { error } = await db
          .from("customer_retail_preferences")
          .update({ body: p.body })
          .eq("id", p.id);
        if (error) throw error;
        return;
      }
      const { uid, name } = await actor();
      const { error } = await db.from("customer_retail_preferences").insert({
        customer_id: p.customer_id,
        body: p.body,
        sort_order: p.sort_order ?? 0,
        created_by: uid,
        created_by_name: name,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_retail_preferences"] }),
  });
}

export function useDeletePreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("customer_retail_preferences").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_retail_preferences"] }),
  });
}

/* ------------------------------------------------------------ anteckningar */

export interface CustomerNote {
  id: string;
  customer_id: string;
  body: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export function useCustomerNotes(customerId?: string | null) {
  return useQuery({
    queryKey: ["customer_retail_notes", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_retail_notes")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CustomerNote[];
    },
  });
}

export function useAddCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { customer_id: string; body: string }) => {
      const { uid, name } = await actor();
      const { error } = await db.from("customer_retail_notes").insert({
        customer_id: p.customer_id,
        body: p.body,
        created_by: uid,
        created_by_name: name,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_retail_notes"] }),
  });
}

export function useDeleteCustomerNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("customer_retail_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_retail_notes"] }),
  });
}
