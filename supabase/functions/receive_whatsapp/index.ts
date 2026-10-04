// Publik Twilio-webhook för inkommande WhatsApp. Verifierar X-Twilio-Signature
// med TWILIO_AUTH_TOKEN, sparar meddelandet i staff_feedback och svarar med tom
// TwiML — inget automatiskt svar skickas.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (s = 200) => new Response(TWIML, { status: s, headers: { "Content-Type": "text/xml" } });

async function signature(token: string, url: string, params: URLSearchParams) {
  const keys = [...new Set([...params.keys()])].sort();
  let data = url;
  for (const k of keys) for (const v of params.getAll(k)) data += k + v;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return xml(405);
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!token) { console.error("TWILIO_AUTH_TOKEN saknas"); return xml(500); }

  const params = new URLSearchParams(await req.text());
  const given = req.headers.get("X-Twilio-Signature") ?? "";
  // Twilio signerar den publika URL:en, inte den interna.
  const u = new URL(req.url);
  const candidates = [
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/receive_whatsapp${u.search}`,
    req.url,
  ];
  let ok = false;
  for (const c of candidates) if (safeEqual(await signature(token, c, params), given)) { ok = true; break; }
  if (!ok) { console.warn("Ogiltig Twilio-signatur"); return xml(403); }

  const sid = params.get("MessageSid") ?? params.get("SmsMessageSid");
  if (!sid) return xml(400);
  const phone = (params.get("From") ?? "").replace(/^whatsapp:/, "").trim();
  const body = params.get("Body") ?? "";

  const { data: rec } = await db.from("notification_recipients")
    .select("id, store_id").eq("phone_e164", phone).order("active", { ascending: false }).limit(1).maybeSingle();

  const { error } = await db.from("staff_feedback").upsert({
    twilio_message_sid: sid, sender_phone: phone, message: body,
    recipient_id: rec?.id ?? null, store_id: rec?.store_id ?? null,
  }, { onConflict: "twilio_message_sid", ignoreDuplicates: true });
  if (error) { console.error("Kunde inte spara meddelande", error); return xml(500); }
  return xml();
});
