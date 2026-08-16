/**
 * SumUp etapp 2: bearbetar kön till transaktionsregister och lagerrörelser.
 *
 * Lägen:
 *   POST {}                                → bearbetar alla köade händelser
 *   POST { merchant_code }                 → bara en handlare
 *   POST { event_id }                      → en enskild händelse (omspelning)
 *
 * Schemaläggaren kör funktionen med service-nyckel. Manuella anrop från appen
 * kräver inloggad personal (verify_jwt = false, JWT valideras i koden).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processQueue } from "../_shared/sumup-process.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function isStaffRequest(req: Request, db: SupabaseClient): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return false;
  const { data: staff } = await db.from("staff").select("id").eq("user_id", data.user.id).maybeSingle();
  return !!staff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = service();

  let body: any = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch (_e) {
    body = {};
  }

  // Anrop från appen måste komma från personal. Schemaläggaren skickar ingen
  // användartoken utan service-nyckeln, och känns igen på apikey-huvudet.
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const fromScheduler = authHeader.includes(serviceKey) || req.headers.get("apikey") === serviceKey;
  if (!fromScheduler && !(await isStaffRequest(req, db))) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const results = await processQueue(db, {
      merchantCode: body?.merchant_code ? String(body.merchant_code) : null,
      eventId: body?.event_id ? String(body.event_id) : null,
      limit: Number(body?.limit ?? 200),
    });
    const summary = {
      bearbetade: results.filter((r) => r.status === "bearbetad").length,
      duplikat: results.filter((r) => r.status === "duplikat").length,
      fel: results.filter((r) => r.status === "fel").length,
      rorelser: results.reduce((a, r) => a + (r.movements ?? 0), 0),
      omatchade: results.reduce((a, r) => a + (r.unmatched ?? 0), 0),
      ej_lagerforda: results.reduce((a, r) => a + (r.not_stocked ?? 0), 0),
    };
    return json({ ok: true, ...summary, results });
  } catch (e: any) {
    console.error("sumup-process fel", e);
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
