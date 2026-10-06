// Skickar Telegram-meddelanden från Makrill. Anropas av inloggad personal
// (svar, utskick, filvisning, webhook-registrering) eller av triggern på
// ai_utkast när ett Telegram-utkast godkänts. Agenter skickar aldrig själva.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { hasBotToken, sleep, tg, tgFile } from "../_shared/telegram.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBHOOK_URL = "https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/telegram-webhook";

type Target =
  | { type: "employee"; id: string }
  | { type: "conversation"; id: string }
  | { type: "group"; thread_id?: number | null }
  | { type: "all" }
  | { type: "company"; id: string }
  | { type: "store"; id: string };

interface Dest { chat_id: number; chat_type: string; thread_id?: number | null; bc?: string | null; employee_id?: string | null; store_id?: string | null; legal_entity_id?: string | null }

async function employeesWithEmployment(filter: { company?: string; store?: string; employee?: string }) {
  let q = db.from("telegram_users").select("telegram_user_id, employee_id").eq("active", true).not("consent_at", "is", null).not("employee_id", "is", null);
  if (filter.employee) q = q.eq("employee_id", filter.employee);
  const { data: users } = await q;
  const ids = [...new Set((users ?? []).map((u) => u.employee_id as string))];
  if (!ids.length) return [];
  const { data: emps } = await db.from("employments").select("employee_id, store_id, legal_entity_id").eq("is_active", true).in("employee_id", ids);
  const empMap = new Map<string, { store_id: string | null; legal_entity_id: string | null }>();
  (emps ?? []).forEach((e) => { if (!empMap.has(e.employee_id)) empMap.set(e.employee_id, e); });
  const storeSet = new Map<string, Set<string>>();
  (emps ?? []).forEach((e) => {
    if (!storeSet.has(e.employee_id)) storeSet.set(e.employee_id, new Set());
    if (e.store_id) storeSet.get(e.employee_id)!.add(e.store_id);
    if (e.legal_entity_id) storeSet.get(e.employee_id)!.add(`le:${e.legal_entity_id}`);
  });
  return (users ?? []).filter((u) => {
    const s = storeSet.get(u.employee_id as string) ?? new Set();
    if (filter.store && !s.has(filter.store)) return false;
    if (filter.company && !s.has(`le:${filter.company}`)) return false;
    return true;
  }).map((u): Dest => ({
    chat_id: Number(u.telegram_user_id), chat_type: "private", employee_id: u.employee_id,
    store_id: empMap.get(u.employee_id as string)?.store_id ?? null, legal_entity_id: empMap.get(u.employee_id as string)?.legal_entity_id ?? null,
  }));
}

async function resolve(t: Target): Promise<Dest[]> {
  if (t.type === "employee") return employeesWithEmployment({ employee: t.id });
  if (t.type === "store") return employeesWithEmployment({ store: t.id });
  if (t.type === "company") return employeesWithEmployment({ company: t.id });
  if (t.type === "all") return employeesWithEmployment({});
  if (t.type === "group") {
    const { data } = await db.from("telegram_settings").select("staff_group_chat_id").maybeSingle();
    if (!data?.staff_group_chat_id) throw new Error("Personalgruppens chat-id saknas i Telegram-inställningarna.");
    return [{ chat_id: Number(data.staff_group_chat_id), chat_type: "supergroup", thread_id: t.thread_id ?? null }];
  }
  const { data } = await db.from("telegram_messages").select("chat_id, chat_type, thread_id, business_connection_id, employee_id, store_id, legal_entity_id")
    .eq("conv_key", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error("Konversationen finns inte.");
  return [{ chat_id: Number(data.chat_id), chat_type: data.chat_type ?? "private", thread_id: data.thread_id, bc: data.business_connection_id, employee_id: data.employee_id, store_id: data.store_id, legal_entity_id: data.legal_entity_id }];
}

async function sendAll(dests: Dest[], text: string, sentBy: string | null, aiGenerated: boolean) {
  let sent = 0, failed = 0;
  for (let i = 0; i < dests.length; i++) {
    const d = dests[i];
    const body: Record<string, unknown> = { chat_id: d.chat_id, text };
    if (d.thread_id) body.message_thread_id = d.thread_id;
    if (d.bc) body.business_connection_id = d.bc;
    const r = await tg("sendMessage", body);
    await db.from("telegram_messages").insert({
      chat_id: d.chat_id, chat_type: d.chat_type, thread_id: d.thread_id ?? null, business_connection_id: d.bc ?? null,
      employee_id: d.employee_id ?? null, store_id: d.store_id ?? null, legal_entity_id: d.legal_entity_id ?? null,
      direction: "ut", kind: "text", body: text, status: r.ok ? "skickad" : "fel", error: r.error ?? null,
      sent_by: sentBy, ai_generated: aiGenerated,
    });
    r.ok ? sent++ : failed++;
    if (i < dests.length - 1) await sleep(40); // högst 25 per sekund
  }
  return { sent, failed };
}

function draftTarget(m: string): Target | null {
  const s = m.trim();
  if (s === "alla") return { type: "all" };
  const [k, v] = s.split(":", 2).map((x) => x?.trim());
  if (k === "grupp") return { type: "group", thread_id: v ? Number(v) : null };
  if (k === "bolag" && v) return { type: "company", id: v };
  if (k === "butik" && v && UUID.test(v)) return { type: "store", id: v };
  if (k === "anstalld" && v && UUID.test(v)) return { type: "employee", id: v };
  if (UUID.test(s)) return { type: "employee", id: s };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { /* tom */ }

  // Godkänt utkast (från trigger). Läser om utkastet — anroparen litas inte på.
  if (body.draft_id != null && !req.headers.get("Authorization")?.startsWith("Bearer ey") || (body.draft_id != null && Object.keys(body).length === 1)) {
    const { data: d } = await db.from("ai_utkast").select("id, kanal, status, mottagare, innehall").eq("id", Number(body.draft_id)).maybeSingle();
    if (!d || d.kanal !== "telegram" || d.status !== "godkänt") return json({ skipped: "inte ett godkänt Telegram-utkast" });
    if (!hasBotToken()) return json({ skipped: "TELEGRAM_BOT_TOKEN saknas, utkastet ligger kvar som godkänt" });
    const t = draftTarget(d.mottagare ?? "");
    if (!t || !d.innehall?.trim()) return json({ error: "Utkastet saknar giltig mottagare eller innehåll" }, 400);
    try {
      const res = await sendAll(await resolve(t), d.innehall, null, true);
      if (res.sent > 0 && res.failed === 0) await db.from("ai_utkast").update({ status: "skickat", skickad: new Date().toISOString() }).eq("id", d.id);
      return json(res);
    } catch (e) { return json({ error: String((e as Error).message) }, 400); }
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Inte inloggad" }, 401);
  const user = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: u } = await db.auth.getUser(auth.slice(7));
  const uid = u.user?.id;
  if (!uid) return json({ error: "Inte inloggad" }, 401);
  const { data: isAdm } = await user.rpc("is_telegram_admin");

  if (body.action === "file") {
    if (typeof body.file_id !== "string") return json({ error: "file_id saknas" }, 400);
    const { data: row } = await user.from("telegram_messages").select("id, kind").eq("file_id", body.file_id).limit(1).maybeSingle();
    if (!row) return json({ error: "Saknar behörighet" }, 403);
    const f = await tgFile(body.file_id);
    if (!f || !f.ok) return json({ error: hasBotToken() ? "Filen kunde inte hämtas" : "TELEGRAM_BOT_TOKEN saknas" }, 502);
    return new Response(f.body, { headers: { ...corsHeaders, "Content-Type": f.headers.get("Content-Type") ?? "application/octet-stream" } });
  }

  if (body.action === "register_webhook" || body.action === "webhook_info") {
    if (!isAdm) return json({ error: "Endast admin" }, 403);
    if (!hasBotToken()) return json({ error: "TELEGRAM_BOT_TOKEN saknas i Cloud › Secrets" }, 400);
    let set: unknown = null;
    if (body.action === "register_webhook") {
      set = await tg("setWebhook", {
        url: WEBHOOK_URL, secret_token: Deno.env.get("TELEGRAM_WEBHOOK_SECRET"),
        allowed_updates: ["message", "edited_message", "callback_query", "business_connection", "business_message", "edited_business_message"],
      });
      const me = await tg("getMe", {});
      if (me.ok && me.result?.username) await db.from("telegram_settings").update({ bot_username: me.result.username, updated_at: new Date().toISOString() }).eq("id", true);
    }
    const info = await tg("getWebhookInfo", {});
    return json({ setWebhook: set, webhookInfo: info.result ?? info.error });
  }

  // Vanligt utskick eller svar
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const t = body.target as Target | undefined;
  if (!t?.type || !["employee", "conversation", "group", "all", "company", "store"].includes(t.type)) return json({ error: "Ogiltig mottagare" }, 400);
  if (!isAdm) {
    // Tilldelad butikschef får bara svara i sina konversationer.
    if (t.type !== "conversation") return json({ error: "Endast admin/kommunikation kan göra utskick" }, 403);
    const { data: own } = await user.from("telegram_messages").select("id").eq("conv_key", (t as any).id).eq("assigned_to", uid).limit(1).maybeSingle();
    if (!own) return json({ error: "Saknar behörighet" }, 403);
  }
  let dests: Dest[];
  try { dests = await resolve(t); } catch (e) { return json({ error: (e as Error).message }, 400); }
  if (body.preview) return json({ recipients: dests.length });
  if (!text || text.length > 4000) return json({ error: "Text saknas eller är för lång (max 4000 tecken)" }, 400);
  if (!hasBotToken()) return json({ error: "TELEGRAM_BOT_TOKEN saknas i Cloud › Secrets – inget skickades" }, 503);
  return json(await sendAll(dests, text, uid, false));
});
