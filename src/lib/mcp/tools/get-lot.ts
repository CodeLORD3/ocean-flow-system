import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_lot",
  title: "Hämta parti för spårbarhet",
  description:
    "Hämtar ett parti på partinummer och visar art, fångstområde, redskap, fångstdatum, bäst före, kvarvarande mängd i kilo och status.",
  inputSchema: {
    lot_number: z.string().trim().min(1).describe("Partinummer, exakt eller del av."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lot_number }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Inte inloggad." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const safe = lot_number.replace(/[%,()]/g, " ").trim();
    const { data, error } = await supabase
      .from("lots")
      .select(
        "id, lot_number, commercial_name, latin_name, catch_area, fishing_gear, production_method, catch_date_from, catch_date_to, best_before, quantity_kg, status, vessel_name, parent_lot_id",
      )
      .ilike("lot_number", `%${safe}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: `Inget parti matchar ${lot_number}.` }], isError: true };
    }
    const lots = data.map((l) => ({
      id: String(l.id),
      lotNumber: String(l.lot_number ?? ""),
      commercialName: l.commercial_name ? String(l.commercial_name) : null,
      latinName: l.latin_name ? String(l.latin_name) : null,
      catchArea: l.catch_area ? String(l.catch_area) : null,
      fishingGear: l.fishing_gear ? String(l.fishing_gear) : null,
      productionMethod: l.production_method ? String(l.production_method) : null,
      catchDateFrom: l.catch_date_from ? String(l.catch_date_from) : null,
      catchDateTo: l.catch_date_to ? String(l.catch_date_to) : null,
      bestBefore: l.best_before ? String(l.best_before) : null,
      quantityKg: l.quantity_kg === null ? null : Number(Number(l.quantity_kg).toFixed(1)),
      status: l.status ? String(l.status) : null,
      vesselName: l.vessel_name ? String(l.vessel_name) : null,
      parentLotId: l.parent_lot_id ? String(l.parent_lot_id) : null,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(lots) }],
      structuredContent: { lots },
    };
  },
});
