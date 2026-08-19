/**
 * booking-api — enda kopplingen mellan den publika förbokningssidan och
 * Makrilltrades databas. Den publika sidan har inga databasnycklar: allt
 * valideras här, server-side, med service role.
 *
 * Endpoints (POST om inget annat anges):
 *   GET  /catalog?store=<uuid>   butiker + bokningsbart sortiment
 *        /send-code              honeypot + tidsfälla + rate limit → engångskod
 *        /verify-code            konstant-tidsjämförelse av kodhash
 *        /create-booking         skapar kundorder + rader i befintlig modul
 *        /staff-booking          telefonvägen: butikspersonal bokar åt kund
 *
 * Regler som aldrig bryts: ingen bokning utan verifierat nummer (utom
 * staff-booking, som är den mänskliga reservvägen), inga låsta priser
 * (dagspris sätts vid hämtning) och bokningen rör aldrig lagret.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { normalizePhoneSe, sendSms, smsTestMode } from "../_shared/sms.ts";
import { createPayment, paymentStatus, swishCallback } from "./swish.ts";

/** Exakt felmeddelande vid ogiltigt eller utländskt nummer — samma text överallt. */
const PHONE_ERROR = "Ange ett svenskt mobilnummer, eller ring butiken så bokar vi åt dig.";

/** Kastas när anroparen inte är inloggad butikspersonal → svarar 401. */
class AuthError extends Error {}

const ALLOWED_ORIGINS = [
  "https://bokafiskskaldjur.se",
  "https://www.bokafiskskaldjur.se",
  // Förhandsvisningen under etapp 2-bygget:
  "https://ocean-flow-system.lovable.app",
  "https://id-preview--dc92d94e-c472-4cf5-a88c-37dbe635baaa.lovable.app",
  "https://dc92d94e-c472-4cf5-a88c-37dbe635baaa.lovableproject.com",
  // Bokningssajtens eget projekt (etapp 2):
  "https://id-preview--e69a8370-7972-4560-b5fa-a06f34cf1f5b.lovable.app",
  "https://e69a8370-7972-4560-b5fa-a06f34cf1f5b.lovableproject.com",
  // Bokningssajtens publicerade förhandsvisning:
  "https://preview--snabb-bokning-start.lovable.app",
  "https://snabb-bokning-start.lovable.app",
  "http://localhost:8080",
];

function cors(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}


function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayIso = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------ engångskoder */

async function hashCode(phone: string, code: string): Promise<string> {
  const pepper = Deno.env.get("BOOKING_OTP_PEPPER") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${phone}|${code}|${pepper}`),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------- spärrar och räknare */

async function guard(
  db: SupabaseClient,
  kind: string,
  detail: string,
  phone: string | null,
  ip: string | null,
) {
  await db.from("booking_guard_events").insert({ kind, detail, phone_normalized: phone, ip });
}

/** Räknare per nyckel och tidsfönster. Returnerar true om gränsen spräckts. */
async function overLimit(
  db: SupabaseClient,
  key: string,
  windowMs: number,
  max: number,
): Promise<boolean> {
  const bucket = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  const { data } = await db
    .from("booking_rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", bucket)
    .maybeSingle();
  const count = Number(data?.count ?? 0);
  if (count >= max) return true;
  await db
    .from("booking_rate_limits")
    .upsert({ key, window_start: bucket, count: count + 1 }, { onConflict: "key,window_start" });
  return false;
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/* ------------------------------------------------------------------ katalog */

async function catalog(db: SupabaseClient, storeId: string | null) {
  const { data: stores, error: storeErr } = await db
    .from("stores")
    .select("id, name, address, phone, booking_open, booking_closed_message, booking_note")
    .eq("region", "vast")
    .eq("is_wholesale", false)
    .order("name");
  if (storeErr) throw new Error(storeErr.message);

  const ids = (stores ?? []).map((s: any) => s.id);
  const { data: hours } = ids.length
    ? await db
      .from("store_opening_hours")
      .select("store_id, weekday, open_time, close_time, closed")
      .in("store_id", ids)
    : { data: [] as any[] };

  // Helgdagskalendern: avvikande öppettider och stängda dagar framåt i tiden.
  const { data: specialDays } = ids.length
    ? await db
      .from("store_special_days")
      .select("store_id, day, closed, open_time, close_time, note")
      .in("store_id", ids)
      .gte("day", todayIso())
      .order("day")
    : { data: [] as any[] };

  const { data: products } = await db
    .from("products")
    .select(
      "id, name, booking_display_name, booking_circa_price, day_price, unit, booking_step, booking_lead_days, image_url",
    )
    .eq("bookable_online", true)
    .eq("active", true)
    .order("name");

  // Butiksfoto: omslagsbilden i entity_images, annars första bilden.
  const { data: storeImages } = ids.length
    ? await db
      .from("entity_images")
      .select("entity_id, url, is_cover, sort_order")
      .eq("entity_type", "store")
      .in("entity_id", ids)
      .order("is_cover", { ascending: false })
      .order("sort_order")
    : { data: [] as any[] };
  const imageByStore = new Map<string, string>();
  (storeImages ?? []).forEach((img: any) => {
    if (!imageByStore.has(img.entity_id)) imageByStore.set(img.entity_id, img.url);
  });

  // Produktfoto: products.image_url först, annars omslagsbilden i entity_images.
  const productIdsWithoutImage = (products ?? []).filter((p: any) => !p.image_url).map((p: any) => p.id);
  const { data: productImages } = productIdsWithoutImage.length
    ? await db
      .from("entity_images")
      .select("entity_id, url, is_cover, sort_order")
      .eq("entity_type", "product")
      .in("entity_id", productIdsWithoutImage)
      .order("is_cover", { ascending: false })
      .order("sort_order")
    : { data: [] as any[] };
  const imageByProduct = new Map<string, string>();
  (productImages ?? []).forEach((img: any) => {
    if (!imageByProduct.has(img.entity_id)) imageByProduct.set(img.entity_id, img.url);
  });


  const shaped = (stores ?? [])
    .filter((s: any) => !storeId || s.id === storeId)
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      address: s.address ?? null,
      phone: s.phone ?? null,
      booking_open: s.booking_open !== false,
      booking_closed_message: s.booking_closed_message ?? null,
      booking_note: s.booking_note ?? null,
      image_url: imageByStore.get(s.id) ?? null,
      opening_hours: (hours ?? [])
        .filter((h: any) => h.store_id === s.id)
        .map((h: any) => ({
          weekday: h.weekday,
          open_time: h.open_time,
          close_time: h.close_time,
          closed: !!h.closed,
        }))
        .sort((a: any, b: any) => a.weekday - b.weekday),
      special_days: (specialDays ?? [])
        .filter((d: any) => d.store_id === s.id)
        .map((d: any) => ({
          day: d.day,
          closed: !!d.closed,
          open_time: d.open_time,
          close_time: d.close_time,
          note: d.note ?? null,
        })),
    }));

  return {
    stores: shaped,
    products: (products ?? []).map((p: any) => ({
      id: p.id,
      name: p.booking_display_name || p.name,
      circa_price:
        Number(p.booking_circa_price) > 0
          ? Number(p.booking_circa_price)
          : Number(p.day_price) > 0
            ? Number(p.day_price)
            : null,
      unit: p.unit,
      step: p.booking_step != null ? Number(p.booking_step) : (p.unit === "st" ? 1 : 0.5),
      lead_days: Number(p.booking_lead_days ?? 1),
      image_url: p.image_url ?? imageByProduct.get(p.id) ?? null,
    })),
  };
}

/* -------------------------------------------------------------- kundmatchning */

const nameKey = (v: unknown) => String(v ?? "").trim().toLowerCase() || null;
const lastWord = (v: unknown) => {
  const parts = String(v ?? "").trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
};
const normEmail = (v: unknown) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s.includes("@") ? s : null;
};

/**
 * Samma matchningsordning som webbordrarna, inom bolaget:
 * e-post → telefon + efternamn → annars ny kund. Flera kandidater ger
 * granskning, aldrig tyst första rad, och ingen kundpost slås någonsin ihop.
 */
async function resolveCustomer(
  db: SupabaseClient,
  storeId: string,
  input: { phone: string; firstName: string; lastName: string; email: string | null },
) {
  const { phone, firstName, lastName, email } = input;
  const { data: store } = await db
    .from("stores")
    .select("legal_entity_id")
    .eq("id", storeId)
    .maybeSingle();
  const entityId = (store?.legal_entity_id as string | null) ?? null;
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();

  const base = () => {
    let q = db
      .from("customers_retail")
      .select("id, name, first_name, last_name, email, phone, booking_blocked")
      .is("anonymized_at", null);
    if (entityId) q = q.eq("legal_entity_id", entityId);
    return q;
  };

  const emailNorm = normEmail(email);
  let match: { id: string; via: string } | null = null;
  let review: string | null = null;

  if (emailNorm) {
    const { data } = await base().eq("email_normalized", emailNorm);
    const rows = data ?? [];
    if (rows.length === 1) match = { id: rows[0].id, via: "e-post" };
    else if (rows.length > 1) review = `Tvetydig kundmatchning på e-post: ${rows.length} kandidater`;
  }
  if (!match && !review) {
    const lk = nameKey(lastName);
    const { data } = await base().eq("phone_normalized", phone);
    const rows = (data ?? []).filter(
      (r: any) => (nameKey(r.last_name) ?? lastWord(r.name)) === lk,
    );
    if (rows.length === 1) match = { id: rows[0].id, via: "telefon + efternamn" };
    else if (rows.length > 1) review = `Tvetydig kundmatchning på telefon + efternamn: ${rows.length} kandidater`;
  }

  if (review) {
    return { id: null as string | null, via: "granskning", review, blocked: false, name, phone };
  }

  if (match) {
    const { data: existing } = await db
      .from("customers_retail")
      .select("*")
      .eq("id", match.id)
      .maybeSingle();
    const patch: Record<string, unknown> = {};
    if (email && !existing?.email) patch.email = email;
    if (!existing?.phone) patch.phone = phone;
    if (Object.keys(patch).length) await db.from("customers_retail").update(patch).eq("id", match.id);
    return {
      id: match.id,
      via: match.via,
      review: null as string | null,
      blocked: !!existing?.booking_blocked,
      name: existing?.name ?? name,
      phone: existing?.phone ?? phone,
    };
  }

  const { data, error } = await db
    .from("customers_retail")
    .insert({
      store_id: storeId,
      legal_entity_id: entityId,
      name,
      first_name: firstName,
      last_name: lastName,
      phone,
      email: email ?? null,
      source: "bokningssida",
    })
    .select("id")
    .single();
  if (error) throw new Error(`kunden kunde inte sparas: ${error.message}`);
  return { id: data.id as string, via: "ny kund", review: null as string | null, blocked: false, name, phone };
}

/* ----------------------------------------------------------- bokningen */

type Line = { product_id: string; quantity: number };

async function validateBooking(
  db: SupabaseClient,
  body: any,
): Promise<{
  storeId: string;
  store: any;
  lines: { product: any; qty: number }[];
  wantedDate: string;
  timeWindow: string;
}> {
  const storeId = String(body?.store_id ?? "");
  if (!storeId) throw new Error("Välj en butik.");
  const { data: store } = await db
    .from("stores")
    .select("id, name, address, phone, booking_open, booking_closed_message, city, region, is_wholesale")
    .eq("id", storeId)
    .maybeSingle();
  if (!store || store.is_wholesale || store.region !== "vast") throw new Error("Butiken kan inte tas emot bokningar.");

  const rawLines: Line[] = Array.isArray(body?.lines) ? body.lines : [];
  if (!rawLines.length) throw new Error("Välj minst en vara.");
  if (rawLines.length > 8) throw new Error("Högst åtta varor per bokning.");

  const ids = [...new Set(rawLines.map((l) => String(l.product_id)))];
  const { data: products } = await db
    .from("products")
    .select("id, name, booking_display_name, unit, booking_step, booking_lead_days, booking_circa_price, bookable_online, active")
    .in("id", ids);
  const byId = new Map((products ?? []).map((p: any) => [p.id, p]));

  const lines = rawLines.map((l) => {
    const product = byId.get(String(l.product_id));
    if (!product || !product.bookable_online || !product.active) {
      throw new Error("En av varorna går inte att förboka just nu.");
    }
    const qty = round3(Number(l.quantity));
    if (!(qty > 0)) throw new Error(`Ange mängd för ${product.booking_display_name || product.name}.`);
    // Inget volymtak: bokad volym syns i inköpsunderlaget i stället.
    return { product, qty };
  });

  const leadDays = Math.max(...lines.map((l) => Number(l.product.booking_lead_days ?? 1)), 1);
  const wantedDate = String(body?.wanted_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wantedDate)) throw new Error("Välj hämtdag.");
  const earliest = new Date(`${todayIso()}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() + leadDays);
  if (new Date(`${wantedDate}T00:00:00Z`) < earliest) {
    throw new Error(`Tidigaste hämtdag är ${earliest.toISOString().slice(0, 10)}.`);
  }

  // Hämtdagen måste ligga inom butikens öppettider.
  const weekday = new Date(`${wantedDate}T12:00:00Z`).getUTCDay();
  const { data: hours } = await db
    .from("store_opening_hours")
    .select("weekday, open_time, close_time, closed")
    .eq("store_id", storeId);
  const weekDay = (hours ?? []).find((h: any) => Number(h.weekday) === weekday);

  // Helgdagskalendern går före veckoschemat: stängd dag kan aldrig bokas.
  const { data: special } = await db
    .from("store_special_days")
    .select("day, closed, open_time, close_time, note")
    .eq("store_id", storeId)
    .eq("day", wantedDate)
    .maybeSingle();
  if (special?.closed) {
    throw new Error(
      special.note
        ? `Butiken har stängt den dagen (${special.note}). Välj en annan hämtdag.`
        : "Butiken har stängt den dagen. Välj en annan hämtdag.",
    );
  }

  const day = special
    ? {
      closed: false,
      open_time: special.open_time ?? weekDay?.open_time ?? null,
      close_time: special.close_time ?? weekDay?.close_time ?? null,
    }
    : weekDay;
  if (!special && hours?.length && (!weekDay || weekDay.closed)) {
    throw new Error("Butiken har stängt den dagen.");
  }

  const timeWindow = String(body?.time_window ?? "").trim();
  if (!/^\d{1,2}(:\d{2})?\s*[-–]\s*\d{1,2}(:\d{2})?$/.test(timeWindow)) {
    throw new Error("Välj en hämttid.");
  }
  if (day && !day.closed && day.open_time && day.close_time) {
    const startHour = Number(timeWindow.split(/[-–]/)[0].trim().split(":")[0]);
    const endHour = Number(timeWindow.split(/[-–]/)[1].trim().split(":")[0]);
    const openHour = Number(String(day.open_time).slice(0, 2));
    const closeHour = Number(String(day.close_time).slice(0, 2));
    if (startHour < openHour || endHour > closeHour) throw new Error("Hämttiden ligger utanför öppettiderna.");
  }

  return { storeId, store, lines, wantedDate, timeWindow };
}

async function createBookingRow(
  db: SupabaseClient,
  args: {
    body: any;
    phone: string;
    verified: boolean;
    staffId: string | null;
  },
) {
  const { storeId, store, lines, wantedDate, timeWindow } = await validateBooking(db, args.body);
  if (store.booking_open === false && !args.staffId) {
    throw new Error(store.booking_closed_message || "Bokningen är tillfälligt stängd i den här butiken.");
  }

  const firstName = String(args.body?.first_name ?? "").trim();
  const lastName = String(args.body?.last_name ?? "").trim();
  if (!firstName || !lastName) throw new Error("Vi behöver ditt förnamn och efternamn.");
  const email = String(args.body?.email ?? "").trim() || null;

  const customer = await resolveCustomer(db, storeId, { phone: args.phone, firstName, lastName, email });
  if (customer.blocked) throw new Error("Vi kan inte ta emot bokningen på webben. Ring gärna butiken.");

  /**
   * Dubblettskydd: bokningssidan kan skicka samma formulär två gånger
   * (dubbelklick, nätverksretry). En identisk bokning inom 10 minuter
   * returnerar den redan skapade ordern istället för att skapa en ny.
   */
  const dupeCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: existing } = await db
    .from("customer_orders")
    .select("id, order_number")
    .eq("store_id", storeId)
    .eq("customer_phone_snapshot", args.phone)
    .eq("wanted_date", wantedDate)
    .eq("wanted_time_window", timeWindow)
    .eq("source", "bokningssida")
    .gte("created_at", dupeCutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return {
      booking_number: existing.order_number,
      store: store.name,
      wanted_date: wantedDate,
      time_window: timeWindow,
      customer_known: customer.via !== "ny kund",
      duplicate: true,
    };
  }

  const { data: orderNumber, error: numErr } = await db.rpc("next_customer_order_number", {
    _store_id: storeId,
    _date: todayIso(),
  });
  if (numErr) throw new Error(`ordernummer kunde inte hämtas: ${numErr.message}`);


  const notes = [
    args.staffId ? "Bokad per telefon av butikspersonal" : "Förbokad via bokafiskskaldjur.se",
    `Kund: ${customer.via}`,
    "Priset sätts i butiken vid hämtning (dagspris).",
  ];
  if (customer.review) notes.push(customer.review);
  if (args.body?.note) notes.push(String(args.body.note).slice(0, 300));

  const { data: order, error: orderErr } = await db
    .from("customer_orders")
    .insert({
      order_number: orderNumber,
      store_id: storeId,
      customer_id: customer.id,
      customer_name_snapshot: [firstName, lastName].join(" "),
      customer_phone_snapshot: args.phone,
      order_type: "upphamtning",
      category: "vanlig",
      wanted_date: wantedDate,
      wanted_time: `${String(timeWindow.split(/[-–]/)[0].trim().split(":")[0]).padStart(2, "0")}:00`,
      wanted_time_window: timeWindow,
      status: "bekraftad",
      pack_status: "opackad",
      source: "bokningssida",
      received_by_name: args.staffId ? "Butik (telefon)" : "Bokningssidan",
      note: notes.join(" · "),
      price_locked: false,
      phone_verified_at: args.verified ? new Date().toISOString() : null,
      booked_by_staff_id: args.staffId,
    })
    .select("id, order_number")
    .single();
  if (orderErr) throw new Error(`bokningen kunde inte sparas: ${orderErr.message}`);

  let estimated = 0;
  for (let i = 0; i < lines.length; i++) {
    const { product, qty } = lines[i];
    const circa = product.booking_circa_price != null ? Number(product.booking_circa_price) : null;
    if (circa) estimated += qty * circa;
    // Radpriset lämnas tomt: dagspris sätts i butiken vid hämtning.
    const { error: lineErr } = await db.from("customer_order_lines").insert({
      customer_order_id: order.id,
      product_id: product.id,
      is_free_text: false,
      quantity_ordered: qty,
      unit: product.unit === "st" ? "st" : "kg",
      estimated_price_per_unit: circa,
      price_per_unit: null,
      price_locked: false,
      pack_status: "opackad",
      reservation_status: "ingen",
      note: "dagspris_vid_hamtning",
      sort_order: i,
    });
    if (lineErr) throw new Error(`orderraden kunde inte sparas: ${lineErr.message}`);
  }

  await db
    .from("customer_orders")
    .update({ estimated_total: round2(estimated) || null })
    .eq("id", order.id);

  await db.from("customer_order_events").insert({
    customer_order_id: order.id,
    event_type: args.staffId ? "bokning_per_telefon" : "forbokning_mottagen",
    description: notes.join(" · "),
  });

  const varor = lines
    .map((l) => `${l.qty} ${l.product.unit === "st" ? "st" : "kg"} ${l.product.booking_display_name || l.product.name}`)
    .join(", ");
  await sendSms(db, {
    phone: args.phone,
    type: "bekraftelse",
    orderId: order.id,
    text:
      `Bokning ${order.order_number}: ${varor}. ${store.name}, ${wantedDate} kl ${timeWindow}. ` +
      `Du betalar i butiken när du hämtar. Behöver du avboka? Ring ${store.phone ?? "butiken"}.`,
  });

  return {
    booking_number: order.order_number,
    store: store.name,
    wanted_date: wantedDate,
    time_window: timeWindow,
    customer_known: customer.via !== "ny kund",
  };
}

/* --------------------------------------------------------------- handlers */

async function sendCode(db: SupabaseClient, body: any, ip: string) {
  const phone = normalizePhoneSe(body?.phone);
  const started = Number(body?.form_started_at ?? 0);
  const tooFast = !started || Date.now() - started < 3000;
  const honeypotFilled = String(body?.honeypot ?? "").trim().length > 0;

  // Botfiltret körs FÖRE utskicket: inget SMS, tyst normalt svar.
  if (honeypotFilled || tooFast) {
    await guard(db, honeypotFilled ? "honeypot" : "tidsfalla", honeypotFilled ? "ifyllt dolt fält" : "submit under 3 sekunder", phone, ip);
    return { ok: true, sent: true, test_mode: smsTestMode() };
  }
  if (!phone) throw new Error(PHONE_ERROR);

  if (await overLimit(db, `ip:${ip}`, HOUR, 10)) {
    await guard(db, "rate_limit_ip", "över 10 kodutskick per timme", phone, ip);
    return { ok: true, sent: true, test_mode: smsTestMode() };
  }
  if (await overLimit(db, `phone:${phone}`, DAY, 5)) {
    await guard(db, "rate_limit_phone", "över 5 kodutskick per dygn", phone, ip);
    return { ok: true, sent: true, test_mode: smsTestMode() };
  }

  const { data: blocked } = await db
    .from("customers_retail")
    .select("id")
    .eq("phone_normalized", phone)
    .eq("booking_blocked", true)
    .limit(1);
  if (blocked?.length) {
    await guard(db, "sparrlista", "spärrat nummer bad om kod", phone, ip);
    // Svaret är byte för byte identiskt med ett lyckat utskick — inget läckage
    // om vilka nummer som är spärrade.
    return { ok: true, sent: true, test_mode: smsTestMode() };
  }

  // I testläge skickas inget SMS — då är koden alltid 123456 så flödet går att testa.
  const code = smsTestMode() ? "123456" : String(Math.floor(100000 + Math.random() * 900000));
  const { error } = await db.from("booking_otp").insert({
    phone_normalized: phone,
    code_hash: await hashCode(phone, code),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    created_ip: ip,
  });
  if (error) throw new Error(error.message);

  await sendSms(db, {
    phone,
    type: "otp",
    text: `Din kod: ${code}. Fiskskaldjur.\n@bokafiskskaldjur.se #${code}`,
  });
  return { ok: true, sent: true, test_mode: smsTestMode() };
}

async function verifyCode(db: SupabaseClient, body: any) {
  const phone = normalizePhoneSe(body?.phone);
  const code = String(body?.code ?? "").replace(/\D/g, "");
  if (!phone || code.length !== 6) throw new Error("Skriv de sex siffrorna ur SMS:et.");

  const { data: rows } = await db
    .from("booking_otp")
    .select("id, code_hash, expires_at, attempts, verified_at")
    .eq("phone_normalized", phone)
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = rows?.[0];
  if (!row) throw new Error("Vi hittar ingen kod till det numret. Vi skickar gärna en ny.");
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, expired: true, message: "Koden har hunnit bli för gammal, vi skickar en ny." };
  }
  if (Number(row.attempts) >= 3) {
    return { ok: false, expired: true, message: "Koden är förbrukad, vi skickar en ny." };
  }

  const hash = await hashCode(phone, code);
  if (!safeEqual(hash, String(row.code_hash))) {
    await db.from("booking_otp").update({ attempts: Number(row.attempts) + 1 }).eq("id", row.id);
    return { ok: false, message: "Koden stämmer inte. Försök igen eller ring butiken." };
  }

  await db.from("booking_otp").update({ verified_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, verification_ref: row.id };
}

async function createBooking(db: SupabaseClient, body: any) {
  const phone = normalizePhoneSe(body?.phone);
  const ref = String(body?.verification_ref ?? "");
  if (!phone || !ref) throw new Error("Bekräfta ditt telefonnummer först.");

  const { data: otp } = await db
    .from("booking_otp")
    .select("id, phone_normalized, verified_at")
    .eq("id", ref)
    .maybeSingle();
  if (!otp || otp.phone_normalized !== phone || !otp.verified_at) {
    throw new Error("Bekräfta ditt telefonnummer först.");
  }
  if (Date.now() - new Date(otp.verified_at).getTime() > 15 * 60_000) {
    throw new Error("Bekräftelsen är för gammal. Vi skickar en ny kod.");
  }
  if (await overLimit(db, `book:${phone}`, DAY, 3)) {
    await guard(db, "rate_limit_bokning", "över 3 bokningar per dygn", phone, null);
    throw new Error("Du har redan flera bokningar i dag. Ring butiken om du behöver mer.");
  }

  return await createBookingRow(db, { body, phone, verified: true, staffId: null });
}

/** Telefonvägen: fullvärdig kanal, kräver inloggad butikspersonal. */
async function staffBooking(db: SupabaseClient, body: any, authHeader: string | null) {
  if (!authHeader) throw new AuthError("Inloggning krävs.");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) throw new AuthError("Inloggning krävs.");
  const { data: isStaff } = await userClient.rpc("is_staff");
  if (!isStaff) throw new AuthError("Bara butikspersonal kan boka åt kund.");

  const phone = normalizePhoneSe(body?.phone);
  if (!phone) throw new Error(PHONE_ERROR);

  const { data: staff } = await db.from("staff").select("id").eq("user_id", user.id).maybeSingle();
  return await createBookingRow(db, { body, phone, verified: false, staffId: staff?.id ?? null });
}

/* ------------------------------------------------------------------ server */

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers = { ...cors(origin), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  const url = new URL(req.url);
  const action = url.pathname.replace(/^.*booking-api\/?/, "").replace(/\/$/, "") || "catalog";
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "okänd";
  const db = service();

  try {
    if (action === "catalog") {
      const data = await catalog(db, url.searchParams.get("store"));
      return new Response(JSON.stringify({ ok: true, ...data }), {
        headers: { ...headers, "Cache-Control": "public, max-age=300" },
      });
    }

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (action === "send-code") {
      return new Response(JSON.stringify(await sendCode(db, body, ip)), { headers });
    }
    if (action === "verify-code") {
      return new Response(JSON.stringify(await verifyCode(db, body)), { headers });
    }
    if (action === "create-booking") {
      return new Response(JSON.stringify({ ok: true, ...(await createBooking(db, body)) }), { headers });
    }
    if (action === "staff-booking") {
      const result = await staffBooking(db, body, req.headers.get("Authorization"));
      return new Response(JSON.stringify({ ok: true, ...result }), { headers });
    }
    if (action === "swish-callback") {
      await swishCallback(db, body, req);
      return new Response("ok", { status: 200, headers: cors(origin) });
    }
    if (action === "create-payment") {
      return new Response(JSON.stringify(await createPayment(db, body, req)), { headers });
    }
    if (action === "payment-status") {
      return new Response(JSON.stringify(await paymentStatus(db, body)), { headers });
    }

    return new Response(JSON.stringify({ ok: false, error: "Okänd förfrågan." }), { status: 404, headers });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Något gick fel. Ring gärna butiken.";
    const status = e instanceof AuthError ? 401 : 400;
    console.error("booking-api", action, message);
    // Misslyckade bokningsförsök loggas så att Systemstatus kan larma på dem.
    if (action === "create-booking" || action === "staff-booking") {
      await guard(db, `bokning_misslyckad_${action === "staff-booking" ? "telefon" : "webb"}`, message.slice(0, 300), null, ip)
        .catch(() => { /* loggen får aldrig sänka svaret till kunden */ });
    }
    return new Response(JSON.stringify({ ok: false, error: message }), { status, headers });
  }
});
