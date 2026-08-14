/**
 * booking-reminders — schemalagd påminnelse för förbokningar.
 *
 * Kl 17 svensk tid: påminnelse till bokningar med hämtdag i morgon.
 * Kl 10 svensk tid: tidig påminnelse till bokningar med hämtdag om 3 dagar,
 * men bara de som lagts minst 4 dagar före hämtning — det är de som glöms.
 *
 * Svensk tid räknas ur Europe/Stockholm, så sommartiden sköter sig själv.
 * Avbokningsvägen står i VARJE påminnelse, inte bara i bekräftelsen.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSms } from "../_shared/sms.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function service(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Delar av svensk lokaltid, sommartidssäkert. */
function seNow() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

async function remind(db: SupabaseClient, date: string, kind: "paminnelse" | "paminnelse_tidig") {
  let q = db
    .from("customer_orders")
    .select(
      "id, order_number, wanted_date, wanted_time_window, customer_name_snapshot, customer_phone_snapshot, created_at, stores(name, address, phone)",
    )
    .eq("source", "bokningssida")
    .eq("wanted_date", date)
    .neq("status", "avbruten");
  const { data: orders, error } = await q;
  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  for (const o of orders ?? []) {
    const phone = o.customer_phone_snapshot as string | null;
    if (!phone) continue;
    // Tidig påminnelse endast till bokningar lagda i god tid.
    if (kind === "paminnelse_tidig") {
      const lead = (new Date(`${date}T00:00:00Z`).getTime() - new Date(o.created_at as string).getTime()) / 86400_000;
      if (lead < 4) continue;
    }
    // Aldrig två likadana påminnelser på samma order.
    const { data: already } = await db
      .from("sms_log")
      .select("id")
      .eq("customer_order_id", o.id)
      .eq("type", kind)
      .limit(1);
    if (already?.length) continue;

    const store: any = (o as any).stores ?? {};
    const first = String(o.customer_name_snapshot ?? "").split(/\s+/)[0] || "hej";
    const weekday = WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const window = o.wanted_time_window ?? "";
    const text =
      kind === "paminnelse"
        ? `Hej ${first}! I morgon ${weekday} kl ${window} väntar din bokning ${o.order_number} i vår butik ${store.name}. Du betalar i butiken. Behöver du avboka? Ring ${store.phone ?? "butiken"}.`
        : `Hej ${first}! Påminnelse: ${weekday} kl ${window} hämtar du din bokning ${o.order_number} i ${store.name}. Behöver du avboka? Ring ${store.phone ?? "butiken"}.`;

    const res = await sendSms(db, { phone, type: kind, text, orderId: o.id as string });
    if (res.ok) sent++;
    else failed++;
  }
  return { sent, failed, candidates: (orders ?? []).length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = service();
  try {
    const body = await req.json().catch(() => ({}));
    const force = String((body as any)?.force ?? ""); // "kvall" | "morgon" för test
    const { date, hour } = seNow();

    const result: Record<string, unknown> = { date, hour, evening: null, early: null };
    if (force === "kvall" || (!force && hour === 17)) {
      result.evening = await remind(db, addDays(date, 1), "paminnelse");
    }
    if (force === "morgon" || (!force && hour === 10)) {
      result.early = await remind(db, addDays(date, 3), "paminnelse_tidig");
    }
    await db.rpc("purge_booking_otp");
    return json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("booking-reminders", message);
    return json({ ok: false, error: message }, 500);
  }
});
