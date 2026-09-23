import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_stores",
  title: "Lista butiker och driftställen",
  description:
    "Listar butiker och grossistenheter med stad, land, valuta och om enheten är aktiv.",
  inputSchema: {
    only_active: z.boolean().optional().describe("Visa bara aktiva enheter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ only_active }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Inte inloggad." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("stores")
      .select("id, name, city, country, currency, is_wholesale, active")
      .order("name");
    if (only_active) query = query.eq("active", true);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const stores = (data ?? []).map((s) => ({
      id: String(s.id),
      name: String(s.name ?? ""),
      city: s.city ? String(s.city) : null,
      country: s.country ? String(s.country) : null,
      currency: s.currency ? String(s.currency) : null,
      isWholesale: Boolean(s.is_wholesale),
      active: s.active === null ? null : Boolean(s.active),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(stores) }],
      structuredContent: { stores },
    };
  },
});
