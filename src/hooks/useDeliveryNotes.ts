import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export function useDeliveryNotes() {
  return useQuery({
    queryKey: ["delivery_notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_notes")
        .select("*, stores(name), delivery_note_lines(*, products(name))")
        .order("created_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateDeliveryNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      delivery_date: string;
      notes?: string;
      lines: { product_id: string; quantity: number; wholesale_price: number }[];
    }) => {
      // Generate note number
      const { count } = await supabase.from("delivery_notes").select("*", { count: "exact", head: true });
      const num = (count || 0) + 1;
      const noteNumber = `FS-2026-${String(num).padStart(4, "0")}`;
      const totalWeight = params.lines.reduce((s, l) => s + l.quantity, 0);
      const totalAmount = params.lines.reduce((s, l) => s + l.quantity * l.wholesale_price, 0);

      const { data: dn, error } = await supabase.from("delivery_notes").insert({
        note_number: noteNumber,
        store_id: params.store_id,
        delivery_date: params.delivery_date,
        notes: params.notes,
        created_by: "Admin",
        status: "Skickad",
        total_weight: totalWeight,
        total_amount: totalAmount,
      }).select().single();
      if (error) throw error;

      // Insert lines
      const lines = params.lines.map(l => ({
        delivery_note_id: dn.id,
        product_id: l.product_id,
        quantity: l.quantity,
        wholesale_price: l.wholesale_price,
      }));
      const { error: lineErr } = await supabase.from("delivery_note_lines").insert(lines);
      if (lineErr) throw lineErr;

      // Decrease stock for each product
      for (const line of params.lines) {
        const { data: prod } = await supabase.from("products").select("stock").eq("id", line.product_id).single();
        if (prod) {
          await supabase.from("products").update({ stock: Number(prod.stock) - line.quantity }).eq("id", line.product_id);
        }
      }

      await logActivity({
        action_type: "create",
        description: `Följesedel skapad: ${noteNumber}`,
        entity_type: "delivery_note",
        entity_id: dn.id,
        store_id: params.store_id,
      });
      return dn;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery_notes"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
