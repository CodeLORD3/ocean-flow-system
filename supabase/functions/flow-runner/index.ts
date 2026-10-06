// CaballaFlow-körare: externa agenter (Claude, n8n) hämtar godkända promptar och skriver tillbaka resultat.
// Skyddas av FLOW_RUNNER_KEY i headern x-flow-key. Ingen körlogik finns i Makrill.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-flow-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha(s: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
async function safeEqual(a: string, b: string) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Endast POST" }, 405);

  const key = Deno.env.get("FLOW_RUNNER_KEY");
  if (!key) return json({ error: "flow-runner är inte konfigurerad" }, 503);
  const given = req.headers.get("x-flow-key") ?? "";
  if (!given || !(await safeEqual(given, key))) return json({ error: "Obehörig" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  let body: any = {};
  try { body = await req.json(); } catch { /* tom kropp ok */ }

  if (action === "claim") {
    const { data, error } = await sb.rpc("flow_claim_prompt");
    if (error) return json({ error: error.message }, 500);
    const p = Array.isArray(data) ? data[0] : data;
    return json({ prompt: p ?? null });
  }

  if (action === "result") {
    const { id, status, result } = body ?? {};
    if (typeof id !== "string" || !["klar", "fel"].includes(status)) return json({ error: "id och status (klar|fel) krävs" }, 400);
    const { data, error } = await sb.from("flow_prompts")
      .update({ status, result: typeof result === "string" ? result.slice(0, 100_000) : null, ran_at: new Date().toISOString() })
      .eq("id", id).eq("status", "kors").select("id, status").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Prompten finns inte eller körs inte" }, 409);
    return json({ ok: true, prompt: data });
  }

  if (action === "log") {
    const { agent, text } = body ?? {};
    if (typeof agent !== "string" || typeof text !== "string" || !agent.trim() || !text.trim()) {
      return json({ error: "agent och text krävs" }, 400);
    }
    const { error } = await sb.from("flow_agent_log").insert({ agent: agent.slice(0, 100), text: text.slice(0, 10_000) });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  return json({ error: "Okänt anrop. Använd /claim, /result eller /log" }, 404);
});
