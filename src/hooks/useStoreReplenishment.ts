import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  addDraftLine,
  cancelOrder,
  confirmOrder,
  dispatchOrder,
  receiveOrder,
  removeDraftLine,
  runAutoSend,
  savePicks,
  sendOrder,
  tomorrowSe,
  updateDraftLine,
  type ReplenishOrder,
  type Supplier,
} from "@/lib/storeReplenishment";

const db = supabase as any;

const SELECT =
  "*, stores(name, legal_entity_id, currency), store_replenishment_lines(*, products(name, unit, image_url), store_replenishment_picks(id, lot_id, quantity, dispatched))";

/** Butikens utkast för en leveransdag — dagens beställning. */
export function useDraftOrder(storeId?: string | null, wantedDate?: string, supplier: Supplier = "grossist") {
  const day = wantedDate ?? tomorrowSe();
  return useQuery({
    queryKey: ["store_replenishment_draft", storeId, day, supplier],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("store_replenishment_orders")
        .select(SELECT)
        .eq("store_id", storeId)
        .eq("supplier", supplier)
        .eq("wanted_date", day)
        .eq("status", "utkast")
        .maybeSingle();
      if (error) throw error;
      return (data || null) as ReplenishOrder | null;
    },
  });
}

/** Butikens beställningar som är på väg eller mottagna. */
export function useStoreOrders(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_replenishment_orders", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("store_replenishment_orders")
        .select(SELECT)
        .eq("store_id", storeId)
        .neq("status", "utkast")
        .order("wanted_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as ReplenishOrder[];
    },
  });
}

/** Inkomna beställningar hos grossisten/produktionen. */
export function useIncomingOrders() {
  return useQuery({
    queryKey: ["store_replenishment_incoming"],
    queryFn: async () => {
      const { data, error } = await db
        .from("store_replenishment_orders")
        .select(SELECT)
        .in("status", ["skickad", "bekraftad", "avsand", "delvis_mottagen"])
        .order("wanted_date", { ascending: true });
      if (error) throw error;
      return (data || []) as ReplenishOrder[];
    },
  });
}

/** Fakturaunderlag för internhandel. */
export function useInvoiceBasis() {
  return useQuery({
    queryKey: ["store_order_invoice_basis"],
    queryFn: async () => {
      const { data, error } = await db
        .from("store_order_invoice_basis")
        .select("*, store_replenishment_orders(order_number, wanted_date, stores(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["store_replenishment_draft"] });
    qc.invalidateQueries({ queryKey: ["store_replenishment_orders"] });
    qc.invalidateQueries({ queryKey: ["store_replenishment_incoming"] });
    qc.invalidateQueries({ queryKey: ["store_order_invoice_basis"] });
    qc.invalidateQueries({ queryKey: ["stock"] });
    qc.invalidateQueries({ queryKey: ["count_places"] });
  };
}

export function useAddOrderLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: Parameters<typeof addDraftLine>[0]) => addDraftLine(p),
    onSuccess: invalidate,
  });
}

export function useUpdateOrderLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: { lineId: string; quantity: number; comment?: string | null }) =>
      updateDraftLine(p.lineId, p.quantity, p.comment),
    onSuccess: invalidate,
  });
}

export function useRemoveOrderLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (lineId: string) => removeDraftLine(lineId),
    onSuccess: invalidate,
  });
}

export function useSendOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => sendOrder(id), onSuccess: invalidate });
}

export function useConfirmOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: { orderId: string; lines: Parameters<typeof confirmOrder>[1] }) =>
      confirmOrder(p.orderId, p.lines),
    onSuccess: invalidate,
  });
}

export function useSavePicks() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: { lineId: string; picks: { lotId: string | null; quantity: number }[] }) =>
      savePicks(p.lineId, p.picks),
    onSuccess: invalidate,
  });
}

export function useDispatchOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => dispatchOrder(id), onSuccess: invalidate });
}

export function useReceiveOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: { orderId: string; lines: Parameters<typeof receiveOrder>[1] }) =>
      receiveOrder(p.orderId, p.lines),
    onSuccess: invalidate,
  });
}

export function useCancelOrder() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => cancelOrder(id), onSuccess: invalidate });
}

/** Kör automatskicket. Tomma utkast rörs aldrig. */
export function useAutoSend() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: () => runAutoSend(), onSuccess: invalidate });
}
