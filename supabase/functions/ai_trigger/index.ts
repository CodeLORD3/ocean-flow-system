// Händelsetriggers till AI-teamet. Anropas av databastriggers via pg_net med
// { event, table, id }. Källraden läses om med service role, så anroparens
// innehåll litas aldrig på. Unikt index på (händelse, källtabell, käll_id)
// gör varje källrad idempotent.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const EVENTS = ["kundorder_24h", "avvikelse", "temperaturavvikelse", "negativt_lager", "stort_inkop", "shopify_stor_order"] as const;
type Ev = (typeof EVENTS)[number];
const TABLES: Record<Ev, string> = {
  kundorder_24h: "customer_orders", shopify_stor_order: "customer_orders", avvikelse: "deviations",
  temperaturavvikelse: "control_records", negativt_lager: "stock_negative_flags", stort_inkop: "purchase_reports",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function storeName(id: string | null) {
  if (!id) return null;
  const { data } = await db.from("stores").select("name").eq("id", id).maybeSingle();
  return data?.name ?? null;
}

/** Stockholmstid → UTC-ms för datum + tid. */
function stockholmMs(date: string, time: string | null) {
  const naive = new Date(`${date}T${(time ?? "00:00:00").slice(0, 8)}Z`).getTime();
  const off = new Date(naive).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", timeZoneName: "longOffset" }).match(/GMT([+-]\d{2}):?(\d{2})?/);
  const mins = off ? (Number(off[1]) * 60 + Math.sign(Number(off[1])) * Number(off[2] ?? 0)) : 60;
  return naive - mins * 60000;
}

type Task = { tilldelad: string; uppgift: string; prioritet: number; underlag: Record<string, unknown> } | null;

async function evaluate(ev: Ev, id: string): Promise<Task> {
  if (ev === "kundorder_24h" || ev === "shopify_stor_order") {
    const { data: o } = await db.from("customer_orders").select("id, order_number, store_id, order_type, wanted_date, wanted_time, customer_name_snapshot, source, paid_total, currency, fx_rate_to_sek, shopify_order_number").eq("id", id).maybeSingle();
    if (!o) return null;
    const butik = await storeName(o.store_id);
    if (ev === "kundorder_24h") {
      if (!o.wanted_date) return null;
      const t = stockholmMs(o.wanted_date, o.wanted_time);
      const now = Date.now();
      if (t < now - 3600_000 || t > now + 24 * 3600_000) return null;
      const typ = o.order_type === "leverans" ? "Leverans" : "Hämtning";
      return { tilldelad: "Driftchef", prioritet: 2, uppgift: `${typ} inom 24 h: order ${o.order_number ?? ""} (${butik ?? "okänd butik"})`,
        underlag: { order_id: o.id, order_number: o.order_number, butik, typ, datum: o.wanted_date, tid: o.wanted_time, kund: o.customer_name_snapshot } };
    }
    if (o.source !== "shopify") return null;
    const sek = Number(o.paid_total ?? 0) * (o.currency === "SEK" || !o.currency ? 1 : Number(o.fx_rate_to_sek ?? 0));
    if (!(sek > 3000)) return null;
    return { tilldelad: "Kundservice", prioritet: 2, uppgift: `Shopify-order över 3 000 kr: ${o.shopify_order_number ?? o.order_number} (${Math.round(sek).toLocaleString("sv-SE")} kr)`,
      underlag: { order_id: o.id, shopify_order: o.shopify_order_number, butik, belopp: o.paid_total, valuta: o.currency, belopp_sek: Math.round(sek), kund: o.customer_name_snapshot } };
  }
  if (ev === "avvikelse") {
    const { data: d } = await db.from("deviations").select("id, title, description, source, source_id, store_id, due_date").eq("id", id).maybeSingle();
    if (!d) return null;
    // Temperaturavvikelser hanteras med prioritet 1 via kontrollposten.
    if (d.source === "control_record" && d.source_id) {
      const { data: c } = await db.from("control_records").select("value_numeric").eq("id", d.source_id).maybeSingle();
      if (c?.value_numeric != null) return null;
    }
    const butik = await storeName(d.store_id);
    return { tilldelad: "Kvalitetschef", prioritet: 2, uppgift: `Ny avvikelse: ${d.title}${butik ? ` (${butik})` : ""}`,
      underlag: { deviation_id: d.id, titel: d.title, beskrivning: d.description, källa: d.source, butik, åtgärdas_senast: d.due_date } };
  }
  if (ev === "temperaturavvikelse") {
    const { data: c } = await db.from("control_records").select("id, value_numeric, status, measured_at, deviation_id, control_point_id").eq("id", id).maybeSingle();
    if (!c || c.status !== "avvikelse" || c.value_numeric == null) return null;
    const { data: cp } = await db.from("control_points").select("name, unit, limit_min, limit_max, store_id").eq("id", c.control_point_id).maybeSingle();
    const butik = await storeName(cp?.store_id ?? null);
    return { tilldelad: "Kvalitetschef", prioritet: 1, uppgift: `Temperaturavvikelse: ${cp?.name ?? "kontrollpunkt"} ${c.value_numeric} ${cp?.unit ?? ""}${butik ? ` (${butik})` : ""}`,
      underlag: { control_record_id: c.id, deviation_id: c.deviation_id, kontrollpunkt: cp?.name, värde: c.value_numeric, enhet: cp?.unit, min: cp?.limit_min, max: cp?.limit_max, mätt: c.measured_at, butik } };
  }
  if (ev === "stort_inkop") {
    const { data: p } = await db.from("purchase_reports").select("id, display_name, file_name, supplier_name_raw, total_amount, document_number, document_date, legal_entity_id").eq("id", id).maybeSingle();
    if (!p || !(Number(p.total_amount) > 50000)) return null;
    return { tilldelad: "Ekonomichef", prioritet: 2, uppgift: `Inköp över 50 000 kr: ${p.supplier_name_raw ?? p.display_name ?? p.file_name} (${Math.round(Number(p.total_amount)).toLocaleString("sv-SE")} kr)`,
      underlag: { purchase_report_id: p.id, leverantör: p.supplier_name_raw, belopp: p.total_amount, dokument: p.document_number, datum: p.document_date, bolag: p.legal_entity_id } };
  }
  return null;
}

async function webhook(ev: Ev, payload: Record<string, unknown>) {
  const { data: s } = await db.from("ai_trigger_settings").select("url, hemlighet, aktiv").eq("händelse", ev).maybeSingle();
  if (!s?.aktiv || !s.url) return "av";
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (s.hemlighet) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(s.hemlighet), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    headers["X-Makrill-Signature"] = "sha256=" + Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  try {
    const r = await fetch(s.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
    return `http ${r.status}`;
  } catch (e) {
    return `fel: ${(e as Error).message}`.slice(0, 200);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let ev: Ev, id: string, table: string;
  try {
    const b = await req.json();
    ev = b?.event; id = String(b?.id ?? ""); table = b?.table;
    if (!EVENTS.includes(ev) || TABLES[ev] !== table || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: "ogiltig händelse" }, 400);
  } catch { return json({ error: "ogiltig JSON" }, 400); }

  // Gör anspråk på källraden; finns den redan är det en dubblett.
  const { data: log, error: claimErr } = await db.from("ai_trigger_log")
    .insert({ händelse: ev, källtabell: table, käll_id: id }).select("id").single();
  if (claimErr) return json({ status: claimErr.code === "23505" ? "dubblett" : "fel", error: claimErr.message });

  try {
    let taskId: number | null = null;
    let payload: Record<string, unknown>;
    if (ev === "negativt_lager") {
      const { data: f } = await db.from("stock_negative_flags").select("id, product_id, location_id, resulting_qty, movement_type, created_at").eq("id", id).maybeSingle();
      if (!f) throw new Error("källraden saknas");
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { data: open } = await db.from("ai_uppgifter").select("id, underlag").eq("skapad_av", "Händelse").neq("status", "klar")
        .gte("skapad", since).like("underlag", '%"händelse":"negativt_lager"%').order("skapad", { ascending: false }).limit(1).maybeSingle();
      if (open) {
        const u = JSON.parse(open.underlag ?? "{}");
        u.antal = (u.antal ?? 0) + 1;
        u.flaggor = [...(u.flaggor ?? []), f.id].slice(-200);
        await db.from("ai_uppgifter").update({ underlag: JSON.stringify(u), uppgift: `Negativt lager: ${u.antal} nya flaggor senaste timmen` }).eq("id", open.id);
        taskId = open.id;
      } else {
        const u = { händelse: "negativt_lager", antal: 1, flaggor: [f.id], första: f.created_at };
        const { data: t, error } = await db.from("ai_uppgifter").insert({ skapad_av: "Händelse", tilldelad: "Systemägare Makrill ERP", prioritet: 2,
          uppgift: "Negativt lager: 1 ny flagga senaste timmen", underlag: JSON.stringify(u) }).select("id").single();
        if (error) throw error;
        taskId = t.id;
      }
      payload = { händelse: ev, källtabell: table, käll_id: id, ai_uppgift_id: taskId, flagga: f };
    } else {
      const task = await evaluate(ev, id);
      if (!task) {
        await db.from("ai_trigger_log").update({ fel: "villkor ej uppfyllt", webhook_status: "ej skickad" }).eq("id", log.id);
        return json({ status: "ignorerad" });
      }
      const underlag = { händelse: ev, källtabell: table, käll_id: id, ...task.underlag };
      const { data: t, error } = await db.from("ai_uppgifter").insert({ skapad_av: "Händelse", tilldelad: task.tilldelad,
        prioritet: task.prioritet, uppgift: task.uppgift, underlag: JSON.stringify(underlag) }).select("id").single();
      if (error) throw error;
      taskId = t.id;
      payload = { ...underlag, ai_uppgift_id: taskId, tilldelad: task.tilldelad, prioritet: task.prioritet, uppgift: task.uppgift };
    }
    const ws = await webhook(ev, payload);
    await db.from("ai_trigger_log").update({ ai_uppgift_id: taskId, webhook_status: ws }).eq("id", log.id);
    return json({ status: "ok", ai_uppgift_id: taskId, webhook: ws });
  } catch (e) {
    await db.from("ai_trigger_log").update({ fel: String((e as Error).message ?? e).slice(0, 500) }).eq("id", log.id);
    return json({ status: "fel", error: (e as Error).message });
  }
});
