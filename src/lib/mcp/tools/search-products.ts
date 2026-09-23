import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_products",
  title: "Sök varor",
  description:
    "Söker varor på namn, artikelnummer eller streckkod och visar kategori, enhet och priser.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Sökord, artikelnummer eller streckkod."),
    limit: z.number().int().min(1).max(50).optional().describe("Antal träffar, standard 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Inte inloggad." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const safe = query.replace(/[%,()]/g, " ").trim();
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, sku, name, category, unit, cost_price, wholesale_price, retail_suggested, active",
      )
      .or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`)
      .order("name")
      .limit(limit ?? 20);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const products = (data ?? []).map((p) => ({
      id: String(p.id),
      sku: p.sku ? String(p.sku) : null,
      name: String(p.name ?? ""),
      category: p.category ? String(p.category) : null,
      unit: p.unit ? String(p.unit) : null,
      costPrice: p.cost_price === null ? null : Number(p.cost_price),
      wholesalePrice: p.wholesale_price === null ? null : Number(p.wholesale_price),
      retailSuggested: p.retail_suggested === null ? null : Number(p.retail_suggested),
      active: p.active === null ? null : Boolean(p.active),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(products) }],
      structuredContent: { products },
    };
  },
});
