// Skapar ett AI-förslag (ai_utkast, kanal telegram) för ett inkommande
// Telegram-meddelande. Väcks av en trigger med bara {id}; raden läses om här,
// så anroparen litas inte på. Inget skickas – förslaget väntar på en människa.
import { createClient } from "npm:@supabase/supabase-js@2";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATS = ["schema_pass", "fraga", "lager_rapport", "ide_klagomal", "ovrigt"];
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `Du föreslår svar åt kontoret på Fisk & Skaldjursspecialisten (även DE No.1 och Componia) i personalens Telegram-kanal.
Skriv alltid på svenska, kort (högst 3 meningar), vänligt och personligt. Använd förnamn.
Lova aldrig något om lön, schema, pass, ledighet eller semester – hänvisa då vänligt till butikschefen.
Hitta aldrig på fakta. Om du inte vet, säg att någon återkommer.
Välj en kategori: schema_pass (schema och pass), fraga (fråga), lager_rapport (lager och rapport), ide_klagomal (idé och klagomål), ovrigt (övrigt).`;

async function logCall(start: number, result: string, error: string | null, msgId: string) {
  await db.from("mcp_calls").insert({
    agent: "telegram-ai-forslag", tool: "telegram_ai_forslag", args_summary: `meddelande ${msgId}`,
    result, error, duration_ms: Date.now() - start,
  });
}

async function callAi(input: string): Promise<{ svar: string; kategori: string }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY saknas");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false, instructions: INSTRUCTIONS, input,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "forslag", strict: true, schema: {
        type: "object", additionalProperties: false, required: ["svar", "kategori"],
        properties: { svar: { type: "string" }, kategori: { type: "string", enum: CATS } },
      } } },
    }),
  });
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => "");
    throw new Error(`AI ${r.status}: ${t.slice(0, 200)}`);
  }
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
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error(ev.response?.error?.message ?? ev.message ?? "AI-fel");
        else if (ev.type === "response.completed") done = true;
      } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
    }
  }
  if (!out.trim()) throw new Error("Tomt AI-svar");
  const j = JSON.parse(out);
  return { svar: String(j.svar ?? "").trim(), kategori: CATS.includes(j.kategori) ? j.kategori : "ovrigt" };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let id = "";
  try { id = String((await req.json())?.id ?? ""); } catch { /* tom */ }
  if (!UUID.test(id)) return json({ error: "ogiltigt id" }, 400);

  const { data: m } = await db.from("telegram_messages")
    .select("id, conv_key, direction, kind, chat_type, body, employee_id, store_id, legal_entity_id").eq("id", id).maybeSingle();
  if (!m || m.direction !== "in" || m.chat_type !== "private" || !["text", "voice"].includes(m.kind)) return json({ skipped: "ej aktuell" });
  const body = (m.body ?? "").trim();
  if (!body || /sjuk/i.test(body) || /^\/start/i.test(body)) return json({ skipped: "ingen text eller sjukanmälan" });
  const { data: exists } = await db.from("ai_utkast").select("id").eq("telegram_message_id", m.id).maybeSingle();
  if (exists) return json({ skipped: "finns redan", id: exists.id });

  const [emp, store, le, hist] = await Promise.all([
    m.employee_id ? db.from("employees").select("first_name, last_name").eq("id", m.employee_id).maybeSingle() : Promise.resolve({ data: null }),
    m.store_id ? db.from("stores").select("name").eq("id", m.store_id).maybeSingle() : Promise.resolve({ data: null }),
    m.legal_entity_id ? db.from("legal_entities").select("legal_name").eq("legal_entity_id", m.legal_entity_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("telegram_messages").select("direction, body, kind, created_at").eq("conv_key", m.conv_key).order("created_at", { ascending: false }).limit(10),
  ]);
  const name = emp.data ? `${emp.data.first_name ?? ""} ${emp.data.last_name ?? ""}`.trim() : "okänd anställd";
  const history = [...(hist.data ?? [])].reverse()
    .map((h: any) => `${h.direction === "in" ? "Anställd" : "Kontoret"}: ${h.body ?? `[${h.kind}]`}`).join("\n");
  const input = `Anställd: ${name}\nButik: ${store.data?.name ?? "okänd"}\nBolag: ${le.data?.legal_name ?? "okänt"}\n\nSenaste meddelanden (äldst först):\n${history}\n\nFöreslå ett svar på det senaste meddelandet.`;

  const start = Date.now();
  try {
    const f = await callAi(input);
    if (!f.svar) throw new Error("Tomt förslag");
    const { data: ins, error } = await db.from("ai_utkast").insert({
      skapad_av: "telegram-ai-forslag", typ: "telegram_svar", titel: `AI-förslag till ${name}`.slice(0, 200),
      mottagare: `konversation:${m.conv_key}`, kanal: "telegram", innehall: f.svar, status: "utkast",
      ai_generated: true, telegram_message_id: m.id, conv_key: m.conv_key, foreslagen_kategori: f.kategori,
      segment: m.legal_entity_id,
    }).select("id").single();
    if (error) {
      if (error.code === "23505") { await logCall(start, "dubblett", null, m.id); return json({ skipped: "dubblett" }); }
      throw new Error(error.message);
    }
    await logCall(start, "ok", null, m.id);
    return json({ ok: true, id: ins.id });
  } catch (e) {
    await logCall(start, "fel", String((e as Error).message).slice(0, 300), m.id);
    return json({ error: "Förslaget kunde inte skapas" }, 502);
  }
});
