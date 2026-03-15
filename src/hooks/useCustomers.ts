import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  contact_person: string | null;
  notes: string | null;
  store_id: string | null;
  created_at: string | null;
};

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: Omit<Customer, "id" | "created_at">) => {
      // If store_id is already set (shop-created customer), just insert the customer
      if (customer.store_id) {
        const { error } = await supabase.from("customers").insert(customer);
        if (error) throw error;
        return;
      }

      // Grossist-created customer: also create a store entry for the portal switcher
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .insert({
          name: customer.name,
          city: customer.city || "–",
          address: customer.address || null,
          phone: customer.phone || null,
          manager: customer.contact_person || null,
          is_wholesale: false,
        })
        .select()
        .single();
      if (storeError) throw storeError;

      const { error } = await supabase.from("customers").insert({
        ...customer,
        store_id: store.id,
      });
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Kund skapad: ${customer.name}`,
        entity_type: "customer",
        store_id: store.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Customer> & { id: string }) => {
      const { error } = await supabase.from("customers").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers"] }),
  });
}
