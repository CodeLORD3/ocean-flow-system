import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_customer_orders",
  title: "Lista kundbeställningar",
  description:
    "Listar kundbeställningar med ordernummer, kund, önskat datum och tid, status och packstatus. Kan filtreras på butik, datum och status.",
  inputSchema: {
    store_id: z.string().uuid().optional().describe("Butikens id, från list_stores."),
    wanted_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Önskat leveransdatum, ÅÅÅÅ-MM-DD."),
    status: z.string().trim().min(1).optional().describe("Orderstatus, exempelvis aktiv."),
    limit: z.number().int().min(1).max(100).optional().describe("Antal rader, standard 30."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ store_id, wanted_date, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Inte inloggad." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("customer_orders")
      .select(
        "id, order_number, store_id, customer_name_snapshot, wanted_date, wanted_time, status, pack_status, total_incl_vat, currency, archived_at",
      )
      .order("wanted_date", { ascending: false })
      .order("wanted_time", { ascending: true })
      .limit(limit ?? 30);
    if (store_id) query = query.eq("store_id", store_id);
    if (wanted_date) query = query.eq("wanted_date", wanted_date);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const orders = (data ?? []).map((o) => ({
      id: String(o.id),
      orderNumber: o.order_number ? String(o.order_number) : null,
      storeId: o.store_id ? String(o.store_id) : null,
      customerName: o.customer_name_snapshot ? String(o.customer_name_snapshot) : null,
      wantedDate: o.wanted_date ? String(o.wanted_date) : null,
      wantedTime: o.wanted_time ? String(o.wanted_time) : null,
      status: o.status ? String(o.status) : null,
      packStatus: o.pack_status ? String(o.pack_status) : null,
      totalInclVat: o.total_incl_vat === null ? null : Number(o.total_incl_vat),
      currency: o.currency ? String(o.currency) : null,
      archived: Boolean(o.archived_at),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(orders) }],
      structuredContent: { orders },
    };
  },
});
