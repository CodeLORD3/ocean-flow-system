import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateOrderLineStatus } from "@/hooks/useUpdateOrderLineStatus";
import { logActivity } from "@/hooks/useActivityLog";

const db = supabase as any;

export interface ProductionCheckLine {
  lineId: string;
  productId: string;
  checked: boolean;
  qty: number;
  isProduction: boolean;
}

/** Admin kontrolleras i databasen. */
export function useIsHrAdmin() {
  return useQuery({
    queryKey: ["is_hr_admin"],
    queryFn: async () => {
      const { data } = await db.rpc("is_hr_admin");
      return !!data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useMarkProductionDone() {
  const qc = useQueryClient();
  const updateLine = useUpdateOrderLineStatus();
  return useMutation({
    mutationFn: async (p: { order: any; lines: ProductionCheckLine[]; byName: string | null }) => {
      const { data: auth } = await supabase.auth.getUser();
      const orderLines: any[] = p.order.shop_order_lines || [];
      const packed: { line_id: string; prev_status: string | null; prev_qty: number | null }[] = [];

      for (const l of p.lines.filter((x) => x.checked)) {
        const cur = orderLines.find((x) => x.id === l.lineId);
        packed.push({ line_id: l.lineId, prev_status: cur?.status ?? null, prev_qty: cur?.quantity_delivered ?? null });
        const qty = Math.round(Number(l.qty || 0) * 10) / 10;
        const { error } = await supabase.from("shop_order_lines").update({ quantity_delivered: qty, production_missing: false } as any).eq("id", l.lineId);
        if (error) throw error;
        await updateLine.mutateAsync({ lineId: l.lineId, newStatus: "Packad", orderId: p.order.id });
      }
      const missing = p.lines.filter((x) => x.isProduction && !x.checked);
      for (const l of missing) {
        const { error } = await supabase.from("shop_order_lines").update({ production_missing: true } as any).eq("id", l.lineId);
        if (error) throw error;
      }
      const prevPacked = p.order.production_done_snapshot?.packed ?? [];
      const { error } = await supabase.from("shop_orders").update({
        production_done_at: new Date().toISOString(),
        production_done_by: auth?.user?.id ?? null,
        production_done_by_name: p.byName,
        production_missing_count: missing.length,
        production_changed_after_done: false,
        production_done_snapshot: { packed: [...prevPacked, ...packed] },
      } as any).eq("id", p.order.id);
      if (error) throw error;

      await logActivity({
        action_type: "status_change",
        description: missing.length ? `Produktionen färdigpackad, ${missing.length} saknas` : "Produktionen färdigpackad, inget saknas",
        entity_type: "shop_order",
        entity_id: p.order.id,
        store_id: p.order.store_id,
        performed_by: p.byName ?? undefined,
        details: { packed_lines: packed, missing_lines: missing.map((m) => m.lineId) },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_orders"] }),
  });
}

export function useUndoProductionDone() {
  const qc = useQueryClient();
  const updateLine = useUpdateOrderLineStatus();
  return useMutation({
    mutationFn: async (p: { order: any; byName: string | null }) => {
      const packed: any[] = p.order.production_done_snapshot?.packed ?? [];
      // Stämpeln tas bort först så att databasen prövar behörigheten innan något ändras.
      const { error } = await supabase.from("shop_orders").update({
        production_done_at: null, production_done_by: null, production_done_by_name: null,
        production_missing_count: 0, production_changed_after_done: false, production_done_snapshot: null,
      } as any).eq("id", p.order.id);
      if (error) throw error;
      await supabase.from("shop_order_lines").update({ production_missing: false } as any).eq("shop_order_id", p.order.id);
      for (const l of packed) {
        await supabase.from("shop_order_lines").update({ quantity_delivered: l.prev_qty ?? 0 }).eq("id", l.line_id);
        await updateLine.mutateAsync({ lineId: l.line_id, newStatus: l.prev_status ?? "", orderId: p.order.id });
        if (l.prev_status == null) await supabase.from("shop_order_lines").update({ status: null }).eq("id", l.line_id);
      }
      await logActivity({
        action_type: "status_change",
        description: "Klarmarkering från produktionen ångrad",
        entity_type: "shop_order",
        entity_id: p.order.id,
        store_id: p.order.store_id,
        performed_by: p.byName ?? undefined,
        details: { restored_lines: packed },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shop_orders"] }),
  });
}

export function useMarkProductsAsProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("products").update({ is_production_item: true } as any).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
