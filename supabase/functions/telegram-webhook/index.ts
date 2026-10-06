// Tar emot uppdateringar från Telegram (bot och Telegram Business för Kontoret).
// Kontrollerar hemligheten, sparar i telegram_messages (dubbletter stoppas av
// update_id) och svarar 200 direkt. Automatsvar körs i bakgrunden.
import { createClient } from "npm:@supabase/supabase-js@2";
import { safeEqual, tg } from "../_shared/telegram.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const ok = () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });

const LINK_HELP = "Hej! Den här kanalen är för personal i Fisk & Skaldjursspecialisten, DE No.1 och Componia. Koppla ditt konto via Makrill-appen: Profil → Koppla Telegram, och öppna länken du får.";

async function employeeContext(employeeId: string | null) {
  if (!employeeId) return { store_id: null, legal_entity_id: null };
  const { data } = await db.from("employments").select("store_id, legal_entity_id")
    .eq("employee_id", employeeId).eq("is_active", true).order("start_date", { ascending: false }).limit(1).maybeSingle();
  return { store_id: data?.store_id ?? null, legal_entity_id: data?.legal_entity_id ?? null };
}

async function reply(chatId: number, text: string, opts: { thread?: number | null; bc?: string | null; ctx?: Record<string, unknown> }) {
  const body: Record<string, unknown> = { chat_id: chatId, text };
  if (opts.thread) body.message_thread_id = opts.thread;
  if (opts.bc) body.business_connection_id = opts.bc;
  const r = await tg("sendMessage", body);
  if (r.skipped) return;
  await db.from("telegram_messages").insert({
    chat_id: chatId, chat_type: "private", thread_id: opts.thread ?? null, business_connection_id: opts.bc ?? null,
    direction: "ut", kind: "text", body: text, status: r.ok ? "skickad" : "fel", error: r.error ?? null, ...(opts.ctx ?? {}),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expected || !safeEqual(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), expected)) {
    return new Response("Unauthorized", { status: 401 });
  }
  let u: any;
  try { u = await req.json(); } catch { return ok(); }
  if (typeof u?.update_id !== "number") return ok();

  // Business-koppling till Kontoret
  if (u.business_connection) {
    const b = u.business_connection;
    await db.from("telegram_business_connections").upsert({
      business_connection_id: b.id, telegram_user_id: b.user?.id ?? null, user_chat_id: b.user_chat_id ?? null,
      can_reply: b.can_reply ?? b.rights?.can_reply ?? null, is_enabled: b.is_enabled !== false, updated_at: new Date().toISOString(),
    });
    return ok();
  }
  if (u.callback_query) {
    const cq = u.callback_query;
    const vr = typeof cq.data === "string" ? cq.data.match(/^vr:([se]):([0-9a-f-]{36})$/) : null;
    if (!vr) {
      EdgeRuntime.waitUntil(tg("answerCallbackQuery", { callback_query_id: cq.id }));
      return ok();
    }
    // Röstrapport: Spara eller Ändra. Bara den som skickade rapporten får trycka.
    EdgeRuntime.waitUntil((async () => {
      const { data: rep } = await db.from("voice_reports").select("id, telegram_user_id, chat_id, status").eq("id", vr[2]).maybeSingle();
      if (!rep || Number(rep.telegram_user_id) !== cq.from?.id) { await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "Inte din rapport" }); return; }
      if (cq.message?.message_id) await tg("editMessageReplyMarkup", { chat_id: cq.message.chat.id, message_id: cq.message.message_id, reply_markup: { inline_keyboard: [] } });
      let text: string;
      if (vr[1] === "e") text = "Okej, inget sparades. Spela in ett nytt röstmeddelande med rättelsen.";
      else {
        const { data, error } = await db.rpc("voice_report_save", { _id: rep.id });
        text = error ? `Kunde inte spara: ${error.message}` : (data as any)?.already ? "Den här rapporten är redan sparad." : `Sparat i lagret (${(data as any)?.count ?? 0} rader). Tack!`;
      }
      await tg("answerCallbackQuery", { callback_query_id: cq.id });
      await reply(Number(rep.chat_id), text, {});
    })());
    return ok();
  }

  const m = u.message ?? u.edited_message ?? u.business_message ?? u.edited_business_message;
  if (!m?.chat?.id) return ok();
  const bc: string | null = m.business_connection_id ?? null;
  const fromId: number | null = m.from?.id ?? null;
  const chatType: string = m.chat.type;

  // Meddelande som Kontoret självt skickat i en business-chatt räknas som utgående.
  let ownerId: number | null = null;
  if (bc) {
    const { data } = await db.from("telegram_business_connections").select("telegram_user_id").eq("business_connection_id", bc).maybeSingle();
    ownerId = data?.telegram_user_id ?? null;
  }
  const outgoing = bc && fromId && ownerId === fromId;
  const peerId = outgoing ? m.chat.id : fromId;

  const { data: link } = peerId
    ? await db.from("telegram_users").select("employee_id").eq("telegram_user_id", peerId).eq("active", true).maybeSingle()
    : { data: null };
  const employeeId: string | null = link?.employee_id ?? null;
  const ctx = await employeeContext(employeeId);

  let kind = "text", fileId: string | null = null;
  if (m.voice) { kind = "voice"; fileId = m.voice.file_id; }
  else if (m.photo?.length) { kind = "photo"; fileId = m.photo[m.photo.length - 1].file_id; }
  else if (m.document) { kind = "document"; fileId = m.document.file_id; }
  const text: string = m.text ?? m.caption ?? "";

  const { error } = await db.from("telegram_messages").insert({
    update_id: u.update_id, chat_id: m.chat.id, chat_type: ["private", "group", "supergroup", "channel"].includes(chatType) ? chatType : "private",
    thread_id: m.message_thread_id ?? null, telegram_user_id: fromId, employee_id: employeeId,
    store_id: ctx.store_id, legal_entity_id: ctx.legal_entity_id, business_connection_id: bc,
    direction: outgoing ? "ut" : "in", kind, body: text || null, file_id: fileId, status: outgoing ? "skickad" : "mottagen",
  });
  if (error) {
    if (error.code === "23505") return ok(); // dubblett
    console.error("Kunde inte spara Telegram-meddelande", error);
    return ok();
  }
  if (outgoing || u.edited_message || u.edited_business_message) return ok();

  const rctx = { employee_id: employeeId, store_id: ctx.store_id, legal_entity_id: ctx.legal_entity_id };
  EdgeRuntime.waitUntil((async () => {
    const start = text.match(/^\/start(?:@\w+)?\s+([a-f0-9]{6,64})\s*$/i);
    if (start && chatType === "private" && fromId) {
      const { data: code } = await db.from("telegram_link_codes").select("code, employee_id, expires_at, used_at")
        .eq("code", start[1].toLowerCase()).maybeSingle();
      if (!code || code.used_at || new Date(code.expires_at) < new Date()) {
        await reply(m.chat.id, "Koden är ogiltig eller har gått ut. Skapa en ny under Profil → Koppla Telegram i Makrill-appen.", { bc, ctx: rctx });
        return;
      }
      await db.from("telegram_users").upsert({
        telegram_user_id: fromId, employee_id: code.employee_id, username: m.from?.username ?? null, first_name: m.from?.first_name ?? null,
        linked_at: new Date().toISOString(), active: true, consent_at: new Date().toISOString(),
      }, { onConflict: "telegram_user_id" });
      await db.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("code", code.code);
      await db.from("telegram_messages").update({ employee_id: code.employee_id }).eq("chat_id", m.chat.id).is("employee_id", null);
      const { data: emp } = await db.from("employees").select("first_name").eq("id", code.employee_id).maybeSingle();
      await reply(m.chat.id, `Välkommen ${emp?.first_name ?? ""}! Ditt Telegram är nu kopplat till Makrill. Här får du besked från kontoret och kan skriva till oss.`.replace("  ", " "), { bc, ctx: { ...rctx, employee_id: code.employee_id } });
      return;
    }
    if (/\bsjuk/i.test(text) && chatType === "private") {
      const { data: s } = await db.from("telegram_settings").select("sick_reply").maybeSingle();
      await reply(m.chat.id, s?.sick_reply ?? "Sjukanmäl dig i Makrill-appen eller ring din butikschef.", { bc, ctx: rctx });
      return;
    }
    if (!employeeId && chatType === "private" && !bc) {
      await reply(m.chat.id, LINK_HELP, { ctx: rctx });
    }
  })());
  return ok();
});
