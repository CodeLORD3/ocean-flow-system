// Röstrapport v1. Röstmeddelande (Telegram eller appen) → ljud sparas i lagring
// → ElevenLabs Scribe (svenska) → AI tolkar till rader → människa trycker Spara.
// Lagerrörelser skrivs bara av databasfunktionen voice_report_save.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { tg, tgFile } from "../_shared/telegram.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const BUCKET = "rostrapporter";
const MODEL = "openai/gpt-6-astra";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ["inventering", "svinn", "inleverans"];
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const TYP_SV: Record<string, string> = { inventering: "Inventering", svinn: "Svinn", inleverans: "Inleverans" };

type Line = { product_id: string; product_name: string; mangd: number; enhet: string; typ: string; orsak: string | null };

async function logCall(tool: string, start: number, result: string, error: string | null, ref: string) {
  await db.from("mcp_calls").insert({ agent: "rostrapport", tool, args_summary: `rapport ${ref}`, result, error: error?.slice(0, 300) ?? null, duration_ms: Date.now() - start });
}

async function storeLocation(storeId: string): Promise<string | null> {
  const { data: s } = await db.from("stores").select("inventory_location_id").eq("id", storeId).maybeSingle();
  if (s?.inventory_location_id) return s.inventory_location_id;
  const { data: l } = await db.from("storage_locations").select("id").eq("store_id", storeId).eq("active", true).eq("location_type", "butik").limit(1).maybeSingle();
  return l?.id ?? null;
}

async function transcribe(blob: Blob, filename: string): Promise<string> {
  const key = Deno.env.get("ELEVENLABS_API_KEY")!;
  const fd = new FormData();
  fd.append("file", blob, filename);
  fd.append("model_id", "scribe_v2");
  fd.append("language_code", "swe");
  fd.append("tag_audio_events", "false");
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: fd });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return String(j.text ?? "").trim();
}

async function interpret(transcript: string, products: { name: string; unit: string }[]) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY saknas");
  const list = products.map((p, i) => `${i}|${p.name}|${p.unit}`).join("\n");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false, reasoning: { effort: "low" },
      instructions: `Du tolkar en svensk röstrapport från en fiskbutik till lagerrader.
Varje rad: vilken vara (index i produktlistan, matcha även vanliga smeknamn, t.ex. "räkor" → räkor, "lax" → laxfilé om det är tydligt), mängd (tal), enhet (kg eller st), typ: inventering (räknat/finns kvar), svinn (kastat/slängt/dåligt) eller inleverans (kommit in/levererats). Orsak för svinn om den sägs, annars null.
Om du inte säkert vet vilken vara som menas: sätt product_index till -1 och sagt_namn till det som sades. Gissa aldrig. Hitta inte på rader som inte sägs.
Produktlista (index|namn|enhet):
${list}`,
      input: transcript,
      text: { format: { type: "json_schema", name: "rader", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["rader"],
        properties: { rader: { type: "array", items: {
          type: "object", additionalProperties: false, required: ["product_index", "sagt_namn", "mangd", "enhet", "typ", "orsak"],
          properties: {
            product_index: { type: "integer" }, sagt_namn: { type: "string" }, mangd: { type: "number" },
            enhet: { type: "string", enum: ["kg", "st"] }, typ: { type: "string", enum: TYPES }, orsak: { type: ["string", "null"] },
          } } } },
      } } },
    }),
  });
  if (!r.ok || !r.body) throw new Error(`AI ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "", out = "", done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (d) break;
    buf += value;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim();
      if (p === "[DONE]") { done = true; break; }
      let ev: any; try { ev = JSON.parse(p); } catch { continue; }
      if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
      else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message ?? ev.message ?? "AI-fel");
      else if (ev.type === "response.completed") done = true;
    }
  }
  if (!out.trim()) throw new Error("Tomt AI-svar");
  return (JSON.parse(out).rader ?? []) as { product_index: number; sagt_namn: string; mangd: number; enhet: string; typ: string; orsak: string | null }[];
}

/** Vanlig mängd för varan i butiken: snitt av senaste 90 dagarnas rörelser av samma typ (inventering: även saldot). */
async function typical(productId: string, locationId: string, typ: string): Promise<number | null> {
  const since = new Date(Date.now() - 90 * 864e5).toISOString();
  const { data } = await db.from("stock_movements").select("quantity_kg").eq("product_id", productId).eq("location_id", locationId)
    .eq("movement_type", typ).gte("created_at", since).limit(200);
  const vals = (data ?? []).map((x: any) => Math.abs(Number(x.quantity_kg) || 0)).filter((x) => x > 0);
  let base = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  if (typ === "inventering") {
    const { data: b } = await db.from("product_stock_locations").select("quantity").eq("product_id", productId).eq("location_id", locationId).maybeSingle();
    base = Math.max(base, Math.abs(Number(b?.quantity) || 0));
  }
  return base > 0 ? base : null;
}

const fmtQ = (n: number, u: string) => (u === "kg" ? n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : String(Math.round(n))) + " " + u;

function summary(lines: Line[], questions: string[]) {
  const rows = lines.map((l) => `• ${TYP_SV[l.typ]}: ${l.product_name} ${fmtQ(l.mangd, l.enhet)}${l.orsak ? ` (${l.orsak})` : ""}`);
  let t = rows.length ? `Jag uppfattade:\n${rows.join("\n")}` : "Jag hittade inga rader.";
  if (questions.length) t += `\n\nInnan något sparas behöver jag veta:\n${questions.map((q) => `– ${q}`).join("\n")}\n\nSpela in igen med rättelsen.`;
  return t;
}

async function process(reportId: string) {
  const { data: r } = await db.from("voice_reports").select("*").eq("id", reportId).single();
  if (!r?.audio_path) return r;
  if (!Deno.env.get("ELEVENLABS_API_KEY")) {
    await db.from("voice_reports").update({ status: "vantar_nyckel", error: null, updated_at: new Date().toISOString() }).eq("id", reportId);
    return { ...r, status: "vantar_nyckel" };
  }
  try {
    let transcript = r.transcript as string | null;
    if (!transcript) {
      const { data: file, error } = await db.storage.from(BUCKET).download(r.audio_path);
      if (error || !file) throw new Error("Ljudfilen kunde inte läsas");
      const t0 = Date.now();
      try { transcript = await transcribe(file, r.audio_path.split("/").pop()!); await logCall("scribe", t0, "ok", null, reportId); }
      catch (e) { await logCall("scribe", t0, "fel", (e as Error).message, reportId); throw e; }
      await db.from("voice_reports").update({ transcript, updated_at: new Date().toISOString() }).eq("id", reportId);
      if (r.telegram_message_id && transcript) {
        await db.from("telegram_messages").update({ body: transcript }).eq("id", r.telegram_message_id).is("body", null);
        // AI-förslaget i Personalinkorgen får nu text att arbeta med.
        await fetch(`${URL_}/functions/v1/telegram-ai-suggest`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON }, body: JSON.stringify({ id: r.telegram_message_id }) }).catch(() => {});
      }
    }
    if (!transcript) throw new Error("Ingen text kunde uppfattas");

    const { data: prods } = await db.from("products").select("id, name, unit").eq("active", true).order("name").limit(3000);
    const products = (prods ?? []) as { id: string; name: string; unit: string }[];
    const t1 = Date.now();
    let raw;
    try { raw = await interpret(transcript, products); await logCall("tolka", t1, "ok", null, reportId); }
    catch (e) { await logCall("tolka", t1, "fel", (e as Error).message, reportId); throw e; }

    const lines: Line[] = []; const questions: string[] = [];
    for (const x of raw) {
      const p = x.product_index >= 0 ? products[x.product_index] : undefined;
      if (!p) { questions.push(`Vilken vara menade du med "${x.sagt_namn}"?`); continue; }
      if (!(x.mangd > 0)) { questions.push(`Hur mycket ${p.name}?`); continue; }
      const enhet = (p.unit || x.enhet || "kg").toLowerCase() === "kg" ? "kg" : x.enhet;
      const mangd = enhet === "kg" ? Math.round(x.mangd * 10) / 10 : x.mangd;
      if (r.location_id) {
        const typ = await typical(p.id, r.location_id, x.typ);
        if (typ && mangd > typ * 3) { questions.push(`${fmtQ(mangd, enhet)} ${p.name} är mer än tre gånger det vanliga (${fmtQ(typ, enhet)}). Stämmer det?`); continue; }
      }
      lines.push({ product_id: p.id, product_name: p.name, mangd, enhet, typ: x.typ, orsak: x.orsak });
    }
    const status = questions.length || !lines.length ? "tolkad" : "vantar_spara";
    await db.from("voice_reports").update({ lines, questions, status, error: r.location_id ? null : "Butiken saknar lagerplats", updated_at: new Date().toISOString() }).eq("id", reportId);

    if (r.source === "telegram" && r.chat_id) {
      const body: Record<string, unknown> = { chat_id: r.chat_id, text: summary(lines, questions) };
      if (status === "vantar_spara") body.reply_markup = { inline_keyboard: [[{ text: "Spara", callback_data: `vr:s:${reportId}` }, { text: "Ändra", callback_data: `vr:e:${reportId}` }]] };
      const sent = await tg("sendMessage", body);
      if (!sent.skipped) {
        await db.from("telegram_messages").insert({ chat_id: r.chat_id, chat_type: "private", employee_id: r.employee_id, store_id: r.store_id, direction: "ut", kind: "text", body: body.text, status: sent.ok ? "skickad" : "fel", error: sent.error ?? null });
      }
    }
    return { ...r, transcript, lines, questions, status };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await db.from("voice_reports").update({ status: "fel", error: msg, updated_at: new Date().toISOString() }).eq("id", reportId);
    return { ...r, status: "fel", error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* tom */ }

  // Från trigger: läser om meddelandet, anroparen litas inte på.
  if (body.telegram_message_id) {
    const id = String(body.telegram_message_id);
    if (!UUID.test(id)) return json({ error: "ogiltigt id" }, 400);
    const { data: m } = await db.from("telegram_messages").select("id, kind, direction, chat_type, chat_id, telegram_user_id, employee_id, store_id, file_id").eq("id", id).maybeSingle();
    if (!m || m.kind !== "voice" || m.direction !== "in" || m.chat_type !== "private" || !m.employee_id || !m.store_id || !m.file_id) return json({ skipped: "ej aktuell" });
    const { data: st } = await db.from("stores").select("voice_report_enabled").eq("id", m.store_id).maybeSingle();
    if (!st?.voice_report_enabled) return json({ skipped: "röstrapport av för butiken" });
    const { data: rep, error } = await db.from("voice_reports").insert({
      source: "telegram", telegram_message_id: m.id, chat_id: m.chat_id, telegram_user_id: m.telegram_user_id,
      employee_id: m.employee_id, store_id: m.store_id, location_id: await storeLocation(m.store_id), status: "mottagen",
    }).select("id").single();
    if (error) return json({ skipped: error.code === "23505" ? "finns redan" : error.message });
    // Spara ljudet först, innan något tolkas.
    const f = await tgFile(m.file_id);
    if (!f || !f.ok) {
      await db.from("voice_reports").update({ status: "fel", error: "Ljudfilen kunde inte hämtas från Telegram" }).eq("id", rep.id);
      return json({ error: "ljud saknas" });
    }
    const path = `telegram/${rep.id}.ogg`;
    const up = await db.storage.from(BUCKET).upload(path, await f.blob(), { contentType: "audio/ogg" });
    if (up.error) { await db.from("voice_reports").update({ status: "fel", error: "Ljudet kunde inte sparas" }).eq("id", rep.id); return json({ error: "lagring" }); }
    await db.from("voice_reports").update({ audio_path: path }).eq("id", rep.id);
    const res = await process(rep.id);
    return json({ ok: true, status: res?.status });
  }

  // Inloggad användare från appen
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Inte inloggad" }, 401);
  const { data: u } = await db.auth.getUser(auth.slice(7));
  const uid = u.user?.id;
  if (!uid) return json({ error: "Inte inloggad" }, 401);
  const user = createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });

  if (body.action === "record") {
    const storeId = String(body.store_id ?? "");
    if (!UUID.test(storeId) || typeof body.audio !== "string") return json({ error: "Butik eller ljud saknas" }, 400);
    const { data: canSee } = await user.rpc("can_see_store", { _store_id: storeId });
    if (!canSee) return json({ error: "Saknar behörighet för butiken" }, 403);
    const { data: st } = await db.from("stores").select("voice_report_enabled").eq("id", storeId).maybeSingle();
    if (!st?.voice_report_enabled) return json({ error: "Röstrapport är inte påslagen för butiken" }, 400);
    const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
    if (bytes.length < 500 || bytes.length > 15_000_000) return json({ error: "Inspelningen är för kort eller för lång" }, 400);
    const mime = typeof body.mime === "string" && body.mime.startsWith("audio/") ? body.mime.split(";")[0] : "audio/webm";
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const { data: rep, error } = await db.from("voice_reports").insert({ source: "app", user_id: uid, store_id: storeId, location_id: await storeLocation(storeId), status: "mottagen" }).select("id").single();
    if (error) return json({ error: error.message }, 500);
    const path = `app/${rep.id}.${ext}`;
    const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime });
    if (up.error) { await db.from("voice_reports").update({ status: "fel", error: "Ljudet kunde inte sparas" }).eq("id", rep.id); return json({ error: "Ljudet kunde inte sparas" }, 500); }
    await db.from("voice_reports").update({ audio_path: path }).eq("id", rep.id);
    return json(await process(rep.id));
  }

  const id = String(body.id ?? "");
  if (!UUID.test(id)) return json({ error: "ogiltigt id" }, 400);
  const { data: visible } = await user.from("voice_reports").select("id, audio_path, status").eq("id", id).maybeSingle();
  if (!visible) return json({ error: "Saknar behörighet" }, 403);

  if (body.action === "audio") {
    if (!visible.audio_path) return json({ error: "Inget ljud" }, 404);
    const { data } = await db.storage.from(BUCKET).createSignedUrl(visible.audio_path, 600);
    return json({ url: data?.signedUrl ?? null });
  }
  if (body.action === "retry") {
    if (!["vantar_nyckel", "fel", "mottagen"].includes(visible.status)) return json({ error: "Rapporten kan inte tolkas om" }, 400);
    return json(await process(id));
  }
  if (body.action === "save") {
    const { data, error } = await user.rpc("voice_report_save", { _id: id });
    if (error) return json({ error: error.message }, 400);
    return json(data);
  }
  return json({ error: "Okänd åtgärd" }, 400);
});
