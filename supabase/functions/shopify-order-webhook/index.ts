/**
 * Shopify orders/create → kundbeställning i rätt butik, i realtid.
 *
 * Säkerhet: HMAC-SHA256 över RAW body med Shopifys signeringsnyckel,
 * base64-kodad och jämförd mot X-Shopify-Hmac-Sha256. Ingen JSON-parsning
 * sker före signaturkontrollen.
 *
 * Idempotens: Shopifys order-id är unikt på customer_orders.shopify_order_id.
 * Omsändningar loggas som "duplikat" och skapar aldrig en andra order.
 *
 * Butikssortering: note_attributes i tur och ordning
 *   1. shopifyLocationId  2. locationId  3. Delivery Location (adresstext)
 * mot den redigerbara mappningstabellen shopify_store_map. Ingen träff =
 * ordern hamnar i inkorgen "Osorterade webbordrar" för manuellt butiksval.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/* ------------------------------------------------------------------ HMAC */

async function hmacBase64(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Tidskonstant jämförelse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --------------------------------------------------------- note_attributes */

type Attr = { key?: string; value?: unknown };

function attr(payload: any, key: string): string | null {
  const list: Attr[] = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
  const hit = list.find((a) => String(a?.key ?? "").trim().toLowerCase() === key.toLowerCase());
  const v = hit?.value;
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

/* ------------------------------------------------------------ enhetslogik */

const PIECE_UNITS = ["st", "stk", "styck", "pcs", "pc", "piece"];
/** Produktens lagerenhet — samma regel som src/lib/units.ts. Ingen omräkning. */
const stockUnitOf = (unit?: string | null): "kg" | "st" =>
  PIECE_UNITS.includes(String(unit ?? "").toLowerCase().trim()) ? "st" : "kg";

/* ------------------------------------------------------------- datum/tider */

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6, juli: 7,
  augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10,
};

/** Tolkar Shopifys "Delivery Date" i de format kassan skickar. */
export function parseDeliveryDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const words = s.toLowerCase().match(/(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/);
  if (words && MONTHS[words[2]]) {
    return `${words[3]}-${String(MONTHS[words[2]]).padStart(2, "0")}-${String(words[1]).padStart(2, "0")}`;
  }
  const enWords = s.toLowerCase().match(/([a-zåäö]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (enWords && MONTHS[enWords[1]]) {
    return `${enWords[3]}-${String(MONTHS[enWords[1]]).padStart(2, "0")}-${String(enWords[2]).padStart(2, "0")}`;
  }
  return null;
}

/** Första klockslaget i tidsfönstret, t.ex. "11:00 - 13:00" → "11:00". */
export function parseWindowStart(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

/* ------------------------------------------------------ butikssortering */

interface MapRow {
  key_type: string;
  key_value: string;
  store_id: string;
  active: boolean;
}

export function resolveStore(payload: any, rows: MapRow[]): { storeId: string | null; via: string } {
  const active = rows.filter((r) => r.active !== false);
  const byType = (t: string) => active.filter((r) => r.key_type === t);

  const primary = attr(payload, "shopifyLocationId");
  if (primary) {
    const hit = byType("shopifyLocationId").find((r) => r.key_value === primary);
    if (hit) return { storeId: hit.store_id, via: `shopifyLocationId ${primary}` };
  }
  const secondary = attr(payload, "locationId");
  if (secondary) {
    const hit = byType("locationId").find((r) => r.key_value === secondary);
    if (hit) return { storeId: hit.store_id, via: `locationId ${secondary}` };
  }
  const text = attr(payload, "Delivery Location");
  if (text) {
    const needle = text.toLowerCase();
    const hit = byType("deliveryLocation").find((r) => needle.includes(r.key_value.toLowerCase()));
    if (hit) return { storeId: hit.store_id, via: `Delivery Location "${text}"` };
  }
  return { storeId: null, via: "ingen nyckel matchade" };
}

/* ------------------------------------------------------------ reservation */

/**
 * Reservationsregeln, samma som kundordermodulen: finns ett parti i butikens
 * lager vars bäst före täcker leveransdatumet med minst en dags marginal
 * reserveras raden mot partiet, annars blir raden ett inköpsbehov.
 */
async function evaluateReservation(
  db: SupabaseClient,
  productId: string,
  storeId: string,
  wantedDate: string,
  quantity: number,
): Promise<{ status: string; lotId: string | null }> {
  const { data: locs } = await db
    .from("storage_locations")
    .select("id, parent_location_id")
    .eq("store_id", storeId)
    .eq("location_type", "butik")
    .eq("active", true);
  const ids = (locs || []).map((l: any) => l.id);
  if (!ids.length) return { status: "inkopsbehov", lotId: null };

  const { data: movements } = await db
    .from("stock_movements")
    .select("lot_id, quantity_kg, lots(id, best_before)")
    .eq("product_id", productId)
    .in("location_id", ids)
    .not("lot_id", "is", null);

  const perLot = new Map<string, { qty: number; bestBefore: string | null }>();
  for (const m of (movements || []) as any[]) {
    const lot = m.lots;
    if (!lot) continue;
    const prev = perLot.get(lot.id) ?? { qty: 0, bestBefore: lot.best_before ?? null };
    prev.qty += Number(m.quantity_kg || 0);
    perLot.set(lot.id, prev);
  }

  const wanted = new Date(wantedDate + "T00:00:00").getTime();
  const candidates = [...perLot.entries()]
    .filter(([, v]) => v.qty >= quantity - 0.0001)
    .filter(([, v]) => {
      if (!v.bestBefore) return false;
      return new Date(v.bestBefore + "T00:00:00").getTime() - wanted >= 24 * 3600 * 1000;
    })
    .sort((a, b) => String(a[1].bestBefore).localeCompare(String(b[1].bestBefore)));

  if (candidates.length) return { status: "reserverad", lotId: candidates[0][0] };
  return { status: "inkopsbehov", lotId: null };
}

/* ------------------------------------------------------ orderuppbyggnad */

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

async function upsertCustomer(db: SupabaseClient, payload: any, storeId: string) {
  const c = payload?.customer ?? {};
  const ship = payload?.shipping_address ?? payload?.billing_address ?? {};
  const name =
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    [ship.first_name, ship.last_name].filter(Boolean).join(" ").trim() ||
    String(payload?.email ?? "").trim() ||
    "Webbkund";
  const phone = c.phone ?? ship.phone ?? payload?.phone ?? null;
  const email = c.email ?? payload?.email ?? payload?.contact_email ?? null;

  let existing: any = null;
  if (email) {
    const { data } = await db
      .from("customers_retail")
      .select("*")
      .eq("store_id", storeId)
      .eq("email", email)
      .limit(1);
    existing = (data || [])[0] ?? null;
  }
  if (!existing && phone) {
    const { data } = await db
      .from("customers_retail")
      .select("*")
      .eq("store_id", storeId)
      .eq("phone", phone)
      .limit(1);
    existing = (data || [])[0] ?? null;
  }

  const fields = {
    store_id: storeId,
    name,
    phone,
    email,
    street: ship.address1 ?? null,
    postal_code: ship.zip ?? null,
    city: ship.city ?? null,
  };

  if (existing) {
    await db.from("customers_retail").update(fields).eq("id", existing.id);
    return { id: existing.id as string, ...fields };
  }
  const { data, error } = await db
    .from("customers_retail")
    .insert(fields)
    .select("id")
    .single();
  if (error) throw new Error(`kunden kunde inte sparas: ${error.message}`);
  return { id: data.id as string, ...fields };
}

/** Skapar kundordern med rader. Anropas av webhooken och av manuellt butiksval. */
async function createOrder(db: SupabaseClient, payload: any, storeId: string, via: string) {
  const shopifyOrderId = String(payload?.id ?? "");
  const orderName = String(payload?.name ?? payload?.order_number ?? shopifyOrderId);

  const deliveryMethod = attr(payload, "Delivery Method");
  const isPickup = /pick\s*up|upph|h(ä|a)mt/i.test(deliveryMethod ?? "");
  const timeWindow = attr(payload, "Translated Delivery Time");
  const wantedDate =
    parseDeliveryDate(attr(payload, "Delivery Date")) ??
    String(payload?.created_at ?? new Date().toISOString()).slice(0, 10);

  const customer = await upsertCustomer(db, payload, storeId);

  const { data: orderNumber, error: numErr } = await db.rpc("next_customer_order_number", {
    _store_id: storeId,
    _date: new Date().toISOString().slice(0, 10),
  });
  if (numErr) throw new Error(`ordernummer kunde inte hämtas: ${numErr.message}`);

  const lineItems: any[] = Array.isArray(payload?.line_items) ? payload.line_items : [];
  const skus = lineItems.map((l) => String(l?.sku ?? "").trim()).filter(Boolean);

  const [{ data: products }, { data: mapped }] = await Promise.all([
    skus.length
      ? db.from("products").select("id, sku, unit, name").in("sku", skus)
      : Promise.resolve({ data: [] as any[] } as any),
    skus.length
      ? db.from("shopify_product_map").select("shopify_sku, product_id").in("shopify_sku", skus)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const bySku = new Map<string, any>();
  for (const p of (products || []) as any[]) bySku.set(String(p.sku).trim(), p);
  const mapBySku = new Map<string, string>();
  for (const m of (mapped || []) as any[]) mapBySku.set(String(m.shopify_sku).trim(), m.product_id);

  const extraIds = [...mapBySku.values()];
  const byId = new Map<string, any>();
  if (extraIds.length) {
    const { data: extra } = await db.from("products").select("id, sku, unit, name").in("id", extraIds);
    for (const p of (extra || []) as any[]) byId.set(p.id, p);
  }

  const notes: string[] = [];
  if (payload?.note) notes.push(String(payload.note));
  notes.push(`Shopify ${orderName} — butik via ${via}`);

  const paidTotal = Number(payload?.total_price ?? 0);
  const paid = String(payload?.financial_status ?? "").toLowerCase() === "paid";

  const { data: order, error: orderErr } = await db
    .from("customer_orders")
    .insert({
      order_number: orderNumber,
      store_id: storeId,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      order_type: isPickup ? "upphamtning" : "leverans",
      category: "vanlig",
      wanted_date: wantedDate,
      wanted_time: parseWindowStart(timeWindow),
      wanted_time_window: timeWindow,
      delivery_street: isPickup ? null : customer.street,
      delivery_postal_code: isPickup ? null : customer.postal_code,
      delivery_city: isPickup ? null : customer.city,
      status: "bekraftad",
      pack_status: "opackad",
      source: "Shopify",
      received_by_name: "Shopify",
      note: notes.join(" · "),
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderName,
      is_web_order: true,
      web_paid: paid,
      paid_total: paidTotal || null,
      price_locked: true,
      web_delivery_method: deliveryMethod,
    })
    .select("id")
    .single();
  if (orderErr) throw new Error(`ordern kunde inte skapas: ${orderErr.message}`);

  let estimated = 0;
  let unmatched = 0;
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    const sku = String(li?.sku ?? "").trim();
    const title = String(li?.title ?? li?.name ?? "Okänd artikel");
    const product = bySku.get(sku) ?? (mapBySku.has(sku) ? byId.get(mapBySku.get(sku)!) : null);
    // Styckvaror i antal, viktvaror i kg — mängden tas som den är.
    const qty = round3(Number(li?.quantity ?? 0));
    const price = round2(Number(li?.price ?? 0));
    const lineTotal = round2(qty * price);
    estimated += lineTotal;

    let reservation = { status: "ingen", lotId: null as string | null };
    if (product) {
      reservation = await evaluateReservation(db, product.id, storeId, wantedDate, qty);
    } else {
      unmatched++;
    }

    await db.from("customer_order_lines").insert({
      customer_order_id: order.id,
      product_id: product?.id ?? null,
      is_free_text: !product,
      free_text_name: product ? null : title,
      quantity_ordered: qty,
      paid_quantity: qty,
      unit: product ? stockUnitOf(product.unit) : "st",
      estimated_price_per_unit: price,
      // Förskottsbetald webborder: radpriset låses från Shopify.
      price_per_unit: price,
      line_total: lineTotal,
      price_locked: true,
      pack_status: "opackad",
      reservation_status: reservation.status,
      reserved_lot_id: reservation.lotId,
      reserved_quantity: reservation.status === "reserverad" ? qty : 0,
      shopify_line_id: li?.id != null ? String(li.id) : null,
      shopify_sku: sku || null,
      shopify_title: title,
      needs_product_match: !product,
      sort_order: i,
    });
  }

  await db
    .from("customer_orders")
    .update({ estimated_total: round2(estimated), total_incl_vat: round2(estimated) })
    .eq("id", order.id);

  await db.from("customer_order_events").insert({
    customer_order_id: order.id,
    event_type: "webborder_mottagen",
    description: `Shopify ${orderName} — betald via webben, priser låsta. Butik via ${via}.`,
    new_value: { shopify_order_id: shopifyOrderId, paid_total: paidTotal },
  });

  return { orderId: order.id as string, orderNumber, unmatched };
}

/* ---------------------------------------------------------------- handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const raw = await req.text();

  /* Manuellt butiksval för osorterade webbordrar (kräver inloggad personal). */
  if (path.endsWith("/assign")) {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = await db.auth.getUser(token);
    if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const eventId = String(body?.event_id ?? "");
    const storeId = String(body?.store_id ?? "");
    if (!eventId || !storeId) return json({ ok: false, error: "event_id och store_id krävs" }, 400);

    const { data: ev } = await db
      .from("shopify_webhook_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return json({ ok: false, error: "Händelsen finns inte" }, 404);
    if (ev.status !== "osorterad") return json({ ok: false, error: "Händelsen är redan hanterad" }, 409);

    try {
      const res = await createOrder(db, ev.payload, storeId, "manuellt butiksval");
      await db
        .from("shopify_webhook_events")
        .update({
          status: "skapad",
          store_id: storeId,
          customer_order_id: res.orderId,
          resolved_by: userData.user.id,
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", eventId);
      return json({ ok: true, ...res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("shopify_webhook_events").update({ error: msg }).eq("id", eventId);
      return json({ ok: false, error: msg }, 500);
    }
  }

  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
  const topic = req.headers.get("x-shopify-topic") ?? "orders/create";
  const header = req.headers.get("x-shopify-hmac-sha256") ?? "";

  /**
   * Egen kontrollkörning: signaturen räknas ut med den konfigurerade nyckeln
   * och verifieras sedan i exakt samma kodväg som en riktig webhook. Kräver
   * inloggad personal och kan aldrig användas för att kringgå kontrollen.
   */
  let expected = "";
  let signature = header;
  if (!secret) {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: false,
      status: "ogiltig_hmac",
      error: "SHOPIFY_WEBHOOK_SECRET saknas i miljön",
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Signeringsnyckel saknas" }, 500);
  }
  expected = await hmacBase64(secret, raw);

  if (path.endsWith("/selftest")) {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
    signature = expected;
  }

  if (!signature || !safeEqual(signature, expected)) {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: false,
      status: "ogiltig_hmac",
      error: "X-Shopify-Hmac-Sha256 stämmer inte med beräknad signatur",
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Ogiltig signatur" }, 401);
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: true,
      status: "fel",
      error: "Ogiltig JSON i webhooken",
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Ogiltig JSON" }, 400);
  }

  const shopifyOrderId = payload?.id != null ? String(payload.id) : null;
  const orderName = String(payload?.name ?? payload?.order_number ?? shopifyOrderId ?? "");
  if (!shopifyOrderId) {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: true,
      status: "fel",
      error: "Ordern saknar id",
      payload,
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Ordern saknar id" }, 400);
  }

  // Idempotens: samma Shopify-order får aldrig bli två kundordrar.
  const { data: dupe } = await db
    .from("customer_orders")
    .select("id, order_number")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();
  if (dupe) {
    await db.from("shopify_webhook_events").insert({
      topic,
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderName,
      hmac_valid: true,
      status: "duplikat",
      customer_order_id: dupe.id,
      processed_at: new Date().toISOString(),
    });
    return json({ ok: true, duplicate: true, order_number: dupe.order_number });
  }
  const { data: pending } = await db
    .from("shopify_webhook_events")
    .select("id")
    .eq("shopify_order_id", shopifyOrderId)
    .eq("status", "osorterad")
    .maybeSingle();
  if (pending) {
    return json({ ok: true, unsorted: true, event_id: pending.id, duplicate: true });
  }

  const { data: mapRows } = await db
    .from("shopify_store_map")
    .select("key_type, key_value, store_id, active");
  const { storeId, via } = resolveStore(payload, (mapRows || []) as MapRow[]);

  if (!storeId) {
    const { data: ev } = await db
      .from("shopify_webhook_events")
      .insert({
        topic,
        shopify_order_id: shopifyOrderId,
        shopify_order_number: orderName,
        hmac_valid: true,
        status: "osorterad",
        error: "Butiken kunde inte avgöras — kräver manuellt butiksval",
        payload,
      })
      .select("id")
      .single();
    return json({ ok: true, unsorted: true, event_id: ev?.id ?? null });
  }

  try {
    const res = await createOrder(db, payload, storeId, via);
    await db.from("shopify_webhook_events").insert({
      topic,
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderName,
      hmac_valid: true,
      status: "skapad",
      store_id: storeId,
      customer_order_id: res.orderId,
      payload,
      processed_at: new Date().toISOString(),
    });
    return json({ ok: true, order_number: res.orderNumber, unmatched_lines: res.unmatched });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from("shopify_webhook_events").insert({
      topic,
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderName,
      hmac_valid: true,
      status: "fel",
      store_id: storeId,
      error: msg,
      payload,
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: msg }, 500);
  }
});
