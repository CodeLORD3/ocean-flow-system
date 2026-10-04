// Skickar godkända WhatsApp-utkast (ai_utkast kanal='whatsapp', status='godkänt')
// via Twilio. Startas av admin (knapp på /meddelanden) eller av schemat 18:45
// Stockholm. Vid fel behålls status och felet loggas.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function isAdmin(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const { data } = await db.auth.getUser(auth.slice(7));
  const uid = data.user?.id;
  if (!uid) return false;
  const [{ data: a }, { data: p }] = await Promise.all([
    db.rpc("has_role", { _user_id: uid, _role: "admin" }),
    db.rpc("is_platform_admin", { _user_id: uid }),
  ]);
  return a === true || p === true;
}

function stockholmTime() {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit", hour12: false });
  const [h, m] = s.split(":").map(Number);
  return { h, m };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: { cron?: boolean } = {};
  try { body = await req.json(); } catch { /* tom kropp */ }

  if (body.cron === true) {
    // Schemat körs både 16:45 och 17:45 UTC; bara den som motsvarar 18:45 Stockholm skickar.
    const { h, m } = stockholmTime();
    if (h !== 18 || m < 40) return json({ skipped: "inte 18:45 Stockholm" });
  } else if (!(await isAdmin(req))) {
    return json({ error: "Endast admin" }, 403);
  }

  const SID = Deno.env.get("TWILIO_ACCOUNT_SID"), TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN"), FROM = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!SID || !TOKEN || !FROM) return json({ error: "Twilio-hemligheter saknas (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)" }, 500);
  const from = FROM.startsWith("whatsapp:") ? FROM : `whatsapp:${FROM}`;

  const { data: drafts, error } = await db.from("ai_utkast").select("id, mottagare, innehall")
    .eq("kanal", "whatsapp").eq("status", "godkänt").order("skapad");
  if (error) return json({ error: error.message }, 500);

  const results: { id: number; ok: boolean; sent?: number; error?: string }[] = [];
  for (const d of drafts ?? []) {
    const m = (d.mottagare ?? "").trim();
    if (!m || !d.innehall?.trim()) { console.error(`Utkast ${d.id}: saknar mottagare eller innehåll`); results.push({ id: d.id, ok: false, error: "saknar mottagare eller innehåll" }); continue; }
    let q = db.from("notification_recipients").select("phone_e164").eq("active", true).eq("channel", "whatsapp").not("consent_at", "is", null);
    q = UUID.test(m) ? q.eq("store_id", m) : q.eq("name", m);
    const { data: recs } = await q;
    const phones = [...new Set((recs ?? []).map((r) => r.phone_e164))];
    if (!phones.length) { console.error(`Utkast ${d.id}: ingen aktiv mottagare med samtycke för "${m}"`); results.push({ id: d.id, ok: false, error: "ingen mottagare med samtycke" }); continue; }

    const errs: string[] = [];
    for (const p of phones) {
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + btoa(`${SID}:${TOKEN}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: from, To: `whatsapp:${p}`, Body: d.innehall }),
      });
      if (!r.ok) { const t = await r.text(); console.error(`Utkast ${d.id} till ${p} [${r.status}]: ${t}`); errs.push(`${p}: ${r.status} ${t.slice(0, 200)}`); }
    }
    if (errs.length) { results.push({ id: d.id, ok: false, error: errs.join("; ") }); continue; }
    const { error: ue } = await db.from("ai_utkast").update({ status: "skickat", skickad: new Date().toISOString() }).eq("id", d.id);
    if (ue) console.error(`Utkast ${d.id}: skickat men status kunde inte sättas`, ue);
    results.push({ id: d.id, ok: true, sent: phones.length });
  }
  return json({ total: results.length, skickade: results.filter((r) => r.ok).length, results });
});
