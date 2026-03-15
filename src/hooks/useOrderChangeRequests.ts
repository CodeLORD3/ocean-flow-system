import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

export function useOrderChangeRequests(shopOrderId?: string) {
  return useQuery({
    queryKey: ["order_change_requests", shopOrderId],
    queryFn: async () => {
      let q = supabase
        .from("shop_order_change_requests")
        .select("*, products(name, unit)")
        .order("created_at", { ascending: false });
      if (shopOrderId) q = q.eq("shop_order_id", shopOrderId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!shopOrderId || shopOrderId === undefined,
  });
}

export function useAllPendingChangeRequests() {
  return useQuery({
    queryKey: ["order_change_requests_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_order_change_requests")
        .select("*, products(name, unit), shop_orders(order_week, store_id, stores(name))")
        .eq("status", "Väntande")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Pending wholesaler-initiated requests for a specific store's orders */
export function usePendingWholesaleRequests(storeId?: string) {
  return useQuery({
    queryKey: ["order_change_requests_wholesale_pending", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_order_change_requests")
        .select("*, products(name, unit), shop_orders(order_week, store_id, stores(name))")
        .eq("status", "Väntande")
        .eq("requested_by", "grossist")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (storeId) {
        return (data || []).filter((cr: any) => cr.shop_orders?.store_id === storeId);
      }
      return data;
    },
    enabled: !!storeId,
  });
}

export function useCreateChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      shop_order_id: string;
      order_line_id?: string;
      change_type: string;
      product_id?: string;
      old_value?: string;
      new_value: string;
      unit?: string;
      requested_by?: string;
    }) => {
      const { error } = await supabase
        .from("shop_order_change_requests")
        .insert(params as any);
      if (error) throw error;
      await logActivity({
        action_type: "create",
        description: `Ändringsförfrågan skapad: ${params.change_type}`,
        portal: params.requested_by === "grossist" ? "wholesale" : "shop",
        entity_type: "change_request",
        entity_id: params.shop_order_id,
        details: { change_type: params.change_type, new_value: params.new_value },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_change_requests"] });
      qc.invalidateQueries({ queryKey: ["order_change_requests_pending"] });
      qc.invalidateQueries({ queryKey: ["order_change_requests_wholesale_pending"] });
    },
  });
}

export function useResolveChangeRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: "Godkänd" | "Nekad" }) => {
      const { data: cr, error: fetchErr } = await supabase
        .from("shop_order_change_requests")
        .select("*")
        .eq("id", params.id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await supabase
        .from("shop_order_change_requests")
        .update({
          status: params.status,
          resolved_at: new Date().toISOString(),
        } as any)
        .eq("id", params.id);
      if (error) throw error;

      const isWholesalerRequest = (cr as any).requested_by === "grossist";

      if (isWholesalerRequest) {
        if (cr.change_type === "product_unavailable") {
          if (params.status === "Godkänd") {
            if (cr.order_line_id) {
              const { error: upErr } = await supabase
                .from("shop_order_lines")
                .update({ status: "Ej tillgänglig", deviation: "Ej tillgänglig – godkänd av butik" })
                .eq("id", cr.order_line_id);
              if (upErr) throw upErr;
            }
          } else {
            if (cr.order_line_id) {
              const { error: delErr } = await supabase
                .from("shop_order_lines")
                .delete()
                .eq("id", cr.order_line_id);
              if (delErr) throw delErr;
            }
          }
        } else if (cr.change_type === "product_alternative") {
          if (params.status === "Godkänd") {
            if (cr.order_line_id && cr.product_id) {
              const { error: upErr } = await supabase
                .from("shop_order_lines")
                .update({
                  product_id: cr.product_id,
                  deviation: `Ersatt från ursprunglig produkt – godkänd av butik`,
                })
                .eq("id", cr.order_line_id);
              if (upErr) throw upErr;
            }
          } else {
            if (cr.order_line_id) {
              const { error: delErr } = await supabase
                .from("shop_order_lines")
                .delete()
                .eq("id", cr.order_line_id);
              if (delErr) throw delErr;
            }
          }
        }
      } else {
        if (params.status === "Godkänd") {
          if (cr.change_type === "quantity_change" && cr.order_line_id) {
            const { error: upErr } = await supabase
              .from("shop_order_lines")
              .update({ quantity_ordered: Number(cr.new_value) })
              .eq("id", cr.order_line_id);
            if (upErr) throw upErr;
          } else if (cr.change_type === "add_line" && cr.product_id) {
            const { error: insErr } = await supabase
              .from("shop_order_lines")
              .insert({
                shop_order_id: cr.shop_order_id,
                product_id: cr.product_id,
                quantity_ordered: Number(cr.new_value),
                unit: cr.unit || "ST",
                order_date: new Date().toISOString().slice(0, 10),
              });
            if (insErr) throw insErr;
          } else if (cr.change_type === "delivery_date") {
            const { error: upErr } = await supabase
              .from("shop_orders")
              .update({ desired_delivery_date: cr.new_value } as any)
              .eq("id", cr.shop_order_id);
            if (upErr) throw upErr;
          }
        }
      }

      await logActivity({
        action_type: params.status === "Godkänd" ? "approve" : "status_change",
        description: `Ändringsförfrågan ${params.status.toLowerCase()}: ${cr.change_type}`,
        entity_type: "change_request",
        entity_id: params.id,
        details: { resolution: params.status, change_type: cr.change_type },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order_change_requests"] });
      qc.invalidateQueries({ queryKey: ["order_change_requests_pending"] });
      qc.invalidateQueries({ queryKey: ["order_change_requests_wholesale_pending"] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    },
  });
}
