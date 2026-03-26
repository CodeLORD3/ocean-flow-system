import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncBehandlasFromStock } from "@/lib/orderStatusSync";
import { logActivity } from "@/hooks/useActivityLog";

export function useShopOrders(storeId?: string) {
  return useQuery({
    queryKey: ["shop_orders", storeId],
    queryFn: async () => {
      let q = supabase
        .from("shop_orders")
        .select("*, desired_delivery_date, packer_name, invoice_status, stores(name, address, phone, city), shop_order_lines(*, products(name, unit, category, hs_code, weight_per_piece, wholesale_price))")
        .order("created_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateShopOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      store_id: string;
      order_week: string;
      lines: { product_id: string; quantity_ordered: number; unit?: string; order_date?: string; delivery_date?: string; category_section?: string }[];
    }) => {
      const { data: order, error } = await supabase
        .from("shop_orders")
        .insert({ store_id: params.store_id, order_week: params.order_week })
        .select()
        .single();
      if (error) throw error;

      const lines = params.lines.map((l) => ({
        shop_order_id: order.id,
        product_id: l.product_id,
        quantity_ordered: l.quantity_ordered,
        unit: l.unit,
        order_date: l.order_date || new Date().toISOString().slice(0, 10),
        delivery_date: l.delivery_date,
        category_section: l.category_section,
      }));
      const { error: lineErr } = await supabase.from("shop_order_lines").insert(lines);
      if (lineErr) throw lineErr;
      // After creating the order, sync statuses with existing stock
      await syncBehandlasFromStock();
      await logActivity({
        action_type: "create",
        description: `Ny butiksorder skapad (vecka ${params.order_week})`,
        portal: "shop",
        store_id: params.store_id,
        entity_type: "shop_order",
        entity_id: order.id,
      });
      return order;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_orders"] }),
  });
}

export function useUpdateOrderLineDelivered() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; quantity_delivered: number; status?: string }) => {
      const { error } = await supabase
        .from("shop_order_lines")
        .update({ quantity_delivered: params.quantity_delivered, status: params.status || "Klar / Levererad" })
        .eq("id", params.id);
      if (error) throw error;
      await logActivity({
        action_type: "update",
        description: `Orderrad levererad: ${params.quantity_delivered} st`,
        entity_type: "shop_order_line",
        entity_id: params.id,
        details: { quantity_delivered: params.quantity_delivered, status: params.status || "Klar / Levererad" },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_orders"] }),
  });
}
