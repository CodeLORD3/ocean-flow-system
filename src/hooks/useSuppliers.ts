import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export type Supplier = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  country: string | null;
  address: string | null;
  supplier_type: string | null;
  created_at: string | null;
};

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: Omit<Supplier, "id" | "created_at">) => {
      const { data, error } = await supabase.from("suppliers").insert(supplier).select().single();
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Leverantör skapad: ${supplier.name}`,
        entity_type: "supplier",
        entity_id: data.id,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Supplier> & { id: string }) => {
      const { error } = await supabase.from("suppliers").update(data).eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "update",
        description: `Leverantör uppdaterad: ${data.name || id}`,
        entity_type: "supplier",
        entity_id: id,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error: unlinkErr } = await supabase
        .from("products")
        .update({ supplier_id: null })
        .eq("supplier_id", id);
      if (unlinkErr) throw unlinkErr;

      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "delete",
        description: `Leverantör borttagen`,
        entity_type: "supplier",
        entity_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
