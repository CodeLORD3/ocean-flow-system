// TILLFÄLLIG diagnostik: provocerar lagerspärrarna och returnerar felmeddelandena
// i klartext. Tas bort direkt efter körning.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result: Record<string, unknown> = {};

  // 1. Direktskrivning mot saldot
  const { data: row } = await admin
    .from("product_stock_locations")
    .select("id, product_id, location_id, quantity")
    .limit(1)
    .maybeSingle();

  const direct = await admin
    .from("product_stock_locations")
    .update({ quantity: 999 })
    .eq("id", (row as any)?.id);

  result.direktskrivning = {
    row_id: (row as any)?.id ?? null,
    blocked: !!direct.error,
    message: direct.error?.message ?? "INGEN SPÄRR — skrivningen gick igenom",
  };

  // 2. Rörelse mot inaktiverad lagerplats
  const { data: inactive } = await admin
    .from("storage_locations")
    .select("id, name")
    .eq("active", false)
    .limit(1)
    .maybeSingle();

  const mv = await admin.from("stock_movements").insert({
    product_id: (row as any)?.product_id,
    location_id: (inactive as any)?.id,
    movement_type: "justering",
    quantity_kg: 1,
  });

  result.inaktiv_plats = {
    location: (inactive as any)?.name ?? null,
    blocked: !!mv.error,
    message: mv.error?.message ?? "INGEN SPÄRR — rörelsen bokfördes",
  };

  return new Response(JSON.stringify(result, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
