import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Inte inloggad" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: auth } = await userClient.auth.getUser();
  if (!auth.user) return json({ error: "Inte inloggad" }, 401);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
  const sessionId = typeof body.inspector_session_id === "string" ? body.inspector_session_id : "";
  if (!employeeId || !sessionId) return json({ error: "Aktiv inspektörssession och person krävs." }, 400);
  const { data, error } = await userClient.rpc("clock_inspector_reveal_pnr", {
    _employee_id: employeeId,
    _inspector_session_id: sessionId,
    _reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "Personalliggare vid kontroll",
  });
  if (error) return json({ error: error.message }, error.message.includes("behörighet") ? 403 : 400);
  return json({ personal_identification_number: data });
});
