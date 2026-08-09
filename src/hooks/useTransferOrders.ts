import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  createTransferOrder,
  markPicklistPrinted,
  registerPicking,
  approveOutbound,
  approveInbound,
  rejectTransfer,
  type TransferLineInput,
  type SourceDocumentType,
} from "@/lib/transferOrders";

/**
 * Överföringsordrar för gränssnittet. Skrivvägarna går alltid via
 * src/lib/transferOrders.ts så att flödesreglerna i databasen gäller.
 */

export interface TransferOrderRow {
  id: string;
  order_number: string;
  status: string;
  from_location_id: string;
  to_location_id: string;
  source_document_type: string | null;
  source_document_id: string | null;
  reason: string | null;
  deviation_note: string | null;
  picklist_printed_at: string | null;
  picked_at: string | null;
  approved_out_at: string | null;
  approved_in_at: string | null;
  created_at: string;
  from_location?: { name: string; location_type: string } | null;
  to_location?: { name: string; location_type: string; store_id?: string | null } | null;
  transfer_order_lines?: any[];
}

export function useTransferOrders(locationIds?: string[]) {
  return useQuery({
    queryKey: ["transfer_orders", locationIds?.slice().sort().join(",") ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_orders" as any)
        .select(
          `*,
           from_location:storage_locations!transfer_orders_from_location_id_fkey(name, location_type),
           to_location:storage_locations!transfer_orders_to_location_id_fkey(name, location_type, store_id),
           transfer_order_lines(*, products(name, sku, unit), lots(lot_number))`,
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (data ?? []) as any as TransferOrderRow[];
      if (!locationIds?.length) return rows;
      const allowed = new Set(locationIds);
      return rows.filter((r) => allowed.has(r.from_location_id) || allowed.has(r.to_location_id));
    },
    refetchInterval: 60_000,
  });
}

/** Statusar där varan är avsänd men ännu inte mottagen. */
export const INCOMING_STATUSES = ["under_transport", "delvis_levererad"];

/**
 * Inkommande överföringar till en butik/enhet — det mottagaren måste ta emot.
 * Utan storeId räknas alla inkommande (Admin och Grossist).
 */
export function useIncomingTransfers(storeId?: string | null) {
  return useQuery({
    queryKey: ["incoming_transfers", storeId ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfer_orders" as any)
        .select(
          `*,
           from_location:storage_locations!transfer_orders_from_location_id_fkey(name, location_type),
           to_location:storage_locations!transfer_orders_to_location_id_fkey(name, location_type, store_id),
           transfer_order_lines(*, products(name, sku, unit), lots(lot_number))`,
        )
        .in("status", INCOMING_STATUSES)
        .order("approved_out_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any as TransferOrderRow[];
      if (!storeId) return rows;
      return rows.filter((r) => (r as any).to_location?.store_id === storeId);
    },
    refetchInterval: 30_000,
  });
}

/** Antal inkommande leveranser — används för siffran i menyn. */
export function useIncomingTransferCount(storeId?: string | null) {
  const { data = [] } = useIncomingTransfers(storeId);
  return data.length;
}

function useTransferMutation<T>(fn: (input: T) => Promise<any>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transfer_orders"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
    },
  });
}

export function useCreateTransferOrder() {
  return useTransferMutation(
    (input: {
      fromLocationId: string;
      toLocationId: string;
      sourceDocumentType?: SourceDocumentType | null;
      sourceDocumentId?: string | null;
      reason?: string | null;
      lines: TransferLineInput[];
    }) => createTransferOrder(input),
  );
}

export function useMarkPicklistPrinted() {
  return useTransferMutation((orderId: string) => markPicklistPrinted(orderId));
}

export function useRegisterPicking() {
  return useTransferMutation(
    (input: {
      orderId: string;
      lines: { id: string; quantityPicked: number; deviationReason?: string | null }[];
    }) => registerPicking(input.orderId, input.lines),
  );
}

export function useApproveOutbound() {
  return useTransferMutation((orderId: string) => approveOutbound(orderId));
}

export function useApproveInbound() {
  return useTransferMutation(
    (input: {
      orderId: string;
      lines: { id: string; quantityReceived: number; deviationReason?: string | null }[];
    }) => approveInbound(input.orderId, input.lines),
  );
}

export function useRejectTransfer() {
  return useTransferMutation((input: { orderId: string; reason: string }) =>
    rejectTransfer(input.orderId, input.reason),
  );
}

export function useWasteReports(locationIds?: string[]) {
  return useQuery({
    queryKey: ["waste_reports", locationIds?.slice().sort().join(",") ?? "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waste_reports" as any)
        .select(
          `*,
           storage_locations!waste_reports_location_id_fkey(name, location_type),
           waste_report_lines(*, products(name, sku, unit), lots(lot_number))`,
        )
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      if (!locationIds?.length) return rows;
      const allowed = new Set(locationIds);
      return rows.filter((r) => allowed.has(r.location_id));
    },
  });
}
