/**
 * nimpos-replay — spelar upp köade/parkerade kassahändelser igen.
 *
 * Endast för inloggad personalchef (JWT valideras i koden). Händelsen
 * bearbetas om från den råa payloaden i nimpos_webhook_events, så inget
 * kvitto behöver skickas på nytt från kassan.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processEvent } from "../_shared/nimpos.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: auth } = await userClient.auth.getUser();
  if (!auth?.user) return json({ error: "unauthorized" }, 401);
  const { data: isManager } = await userClient.rpc("is_staff_manager");
  if (isManager !== true) return json({ error: "forbidden" }, 403);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const ids: string[] = Array.isArray(body.event_ids) ? body.event_ids.slice(0, 200) : [];
  const statuses: string[] = Array.isArray(body.statuses) && body.statuses.length
    ? body.statuses
    : ["koad", "pending", "failed", "unmapped_store"];

  const db = service();
  let q = db
    .from("nimpos_webhook_events")
    .select("id, event_id, payload, status, test_mode, transaction_id")
    .order("received_at", { ascending: true })
    .limit(200);
  q = ids.length ? q.in("id", ids) : q.in("status", statuses);

  const { data: events, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const results: any[] = [];
  for (const ev of events ?? []) {
    if (ev.transaction_id) {
      results.push({ id: ev.id, skipped: "redan bokfört" });
      continue;
    }
    await db.from("nimpos_webhook_events").update({ status: "koad", last_error: null }).eq("id", ev.id);
    const res = await processEvent(db, ev.id, ev.payload, ev.event_id, ev.test_mode === true);
    results.push({ id: ev.id, event_id: ev.event_id, ...res.body });
  }

  return json({ ok: true, replayed: results.length, results });
});
