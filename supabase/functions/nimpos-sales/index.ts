/**
 * Nimpos → Makrill Trade: liveförsäljning från de externa kassorna.
 *
 * Kontrakt: se docs/nimpos-integration.md avsnitt 3.
 *
 * Ordning (samma filosofi som shopify-order-webhook):
 *   1. HMAC-SHA256 över RAW body mot NIMPOS_WEBHOOK_SECRET (ingen JSON-parsning före det)
 *   2. Replay-skydd: X-Nimpos-Timestamp får vara max 5 min gammal
 *   3. Rå händelse loggas i nimpos_webhook_events (unikt event_id = idempotens)
 *   4. Mappning butik → kassör → produkt, sedan pos_transactions + pos_transaction_items
 *
 * Aldrig 5xx för fel vi orsakat i mappningen — då parkeras händelsen som
 * unmapped_store/failed och syns i driftpanelen på /pos-live. 5xx är reserverat
 * för verkliga serverfel så att Nimpos retry:ar rätt saker.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nimpos-signature, x-nimpos-event-id, x-nimpos-timestamp",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function hmacHex(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* ------------------------------------------------------------- normalisering */

type Payment = { method?: string; amount_ore?: number; card_brand?: string; last4?: string };

function normalizeMethod(raw?: string): string {
  const m = (raw ?? "").toLowerCase();
  if (/card|kort|visa|master|debit|credit/.test(m)) return "card";
  if (/cash|kontant/.test(m)) return "cash";
  if (/swish/.test(m)) return "swish";
  if (/invoice|faktura/.test(m)) return "invoice";
  return "other";
}

function toOre(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/* ------------------------------------------------------------------ mappning */

async function mapStore(
  db: SupabaseClient,
  storeCode?: string,
  registerId?: string,
): Promise<string | null> {
  if (storeCode) {
    const { data } = await db
      .from("nimpos_store_map")
      .select("store_id")
      .eq("store_code", storeCode)
      .eq("active", true)
      .maybeSingle();
    if (data?.store_id) return data.store_id as string;
  }
  if (registerId) {
    const { data } = await db
      .from("nimpos_store_map")
      .select("store_id")
      .eq("register_id", registerId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (data?.store_id) return data.store_id as string;
  }
  return null;
}

async function mapCashier(
  db: SupabaseClient,
  storeId: string,
  code?: string,
): Promise<string | null> {
  if (!code) return null;
  const { data } = await db
    .from("pos_cashiers")
    .select("id, store_id, display_name")
    .ilike("display_name", code)
    .limit(5);
  if (!data?.length) return null;
  return (data.find((c) => c.store_id === storeId) ?? data[0]).id as string;
}

/** Produktmappning: streckkod → pos_products → nimpos_product_map. */
async function mapProduct(
  db: SupabaseClient,
  sku?: string,
  barcode?: string,
  name?: string,
): Promise<string | null> {
  if (barcode) {
    const { data } = await db.from("products").select("id").eq("barcode", barcode).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (sku) {
    const { data } = await db.from("products").select("id").eq("sku", sku).maybeSingle();
    if (data?.id) return data.id as string;
    const { data: pp } = await db
      .from("pos_products")
      .select("erp_id")
      .or(`sku.eq.${sku},article_sku.eq.${sku}`)
      .not("erp_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (pp?.erp_id) return pp.erp_id as string;
  }
  const map = await db
    .from("nimpos_product_map")
    .select("id, product_id")
    .or([sku ? `external_sku.eq.${sku}` : null, barcode ? `barcode.eq.${barcode}` : null]
      .filter(Boolean)
      .join(","))
    .limit(1)
    .maybeSingle();
  if (map.data?.product_id) return map.data.product_id as string;

  // Omatchad: registrera för manuell koppling i /pos-live
  if (sku || barcode) {
    if (map.data?.id) {
      const { data: cur } = await db
        .from("nimpos_product_map")
        .select("unmatched_count")
        .eq("id", map.data.id)
        .maybeSingle();
      await db
        .from("nimpos_product_map")
        .update({
          last_seen_at: new Date().toISOString(),
          external_name: name ?? null,
          unmatched_count: (cur?.unmatched_count ?? 0) + 1,
        })
        .eq("id", map.data.id);
    } else {
      await db.from("nimpos_product_map").insert({
        external_sku: sku ?? null,
        barcode: barcode ?? null,
        external_name: name ?? null,
        unmatched_count: 1,
        last_seen_at: new Date().toISOString(),
      });
    }
  }
  return null;
}

/* ------------------------------------------------------------------ handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const secret = Deno.env.get("NIMPOS_WEBHOOK_SECRET");
  if (!secret) {
    console.error("NIMPOS_WEBHOOK_SECRET saknas");
    return json({ error: "not_configured" }, 500);
  }

  /* ------------------------------------------------- GET: statusuppslag
   * Låter den externa parten själv verifiera att ett kvitto tagits emot,
   * utan att ha konto i systemet. Signaturen räknas över query-strängen
   * (utan inledande "?") med samma delade hemlighet som för POST.
   *   GET ...?external_id=nimpos-tx-1
   *   X-Nimpos-Signature: sha256=<hmac över "external_id=nimpos-tx-1">
   */
  if (req.method === "GET") {
    const url = new URL(req.url);
    const qs = url.search.replace(/^\?/, "");
    const externalId = url.searchParams.get("external_id") ?? "";
    if (!externalId) return json({ error: "missing_external_id" }, 400);

    const providedGet = (req.headers.get("x-nimpos-signature") ?? "")
      .replace(/^sha256=/i, "")
      .trim()
      .toLowerCase();
    if (!providedGet) return json({ error: "missing_headers" }, 400);
    if (!safeEqual(await hmacHex(secret, qs), providedGet)) {
      return json({ error: "bad_signature" }, 401);
    }

    const dbGet = service();
    const { data: txRow } = await dbGet
      .from("pos_transactions")
      .select("id, occurred_at, total_ore, status")
      .eq("source", "nimpos")
      .eq("external_id", externalId)
      .maybeSingle();

    if (txRow?.id) {
      const { count } = await dbGet
        .from("pos_transaction_items")
        .select("id", { count: "exact", head: true })
        .eq("transaction_id", txRow.id);
      return json({
        received: true,
        status: txRow.status,
        occurred_at: txRow.occurred_at,
        total_ore: txRow.total_ore,
        item_count: count ?? 0,
      });
    }

    const { data: evRow } = await dbGet
      .from("nimpos_webhook_events")
      .select("status, last_error, received_at")
      .contains("payload", { receipt: { external_id: externalId } })
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (evRow) {
      return json({
        received: true,
        status: evRow.status,
        message: evRow.last_error ?? null,
        received_at: evRow.received_at,
      });
    }

    return json({ received: false, status: "unknown" }, 404);
  }


  const raw = await req.text();
  const sigHeader = req.headers.get("x-nimpos-signature") ?? "";
  const eventId = req.headers.get("x-nimpos-event-id") ?? "";
  const tsHeader = req.headers.get("x-nimpos-timestamp") ?? "";

  if (!sigHeader || !eventId) return json({ error: "missing_headers" }, 400);

  const expected = await hmacHex(secret, raw);
  const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!safeEqual(expected, provided)) return json({ error: "bad_signature" }, 401);

  if (tsHeader) {
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      return json({ error: "stale_timestamp" }, 400);
    }
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const r = body?.receipt ?? body;
  if (!r || typeof r !== "object") return json({ error: "missing_receipt" }, 400);

  const db = service();

  // 1. Råhändelse (idempotent på event_id)
  const { data: ev, error: evErr } = await db
    .from("nimpos_webhook_events")
    .insert({
      event_id: eventId,
      event_type: body?.event_type ?? "sale.completed",
      payload: body,
      store_code: r.store_code ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (evErr) {
    // 23505 = unique violation → redan mottagen, kvittera utan att skapa dubblett
    if ((evErr as any).code === "23505") return json({ ok: true, duplicate: true });
    console.error("kunde inte logga händelse", evErr);
    return json({ error: "log_failed" }, 500);
  }

  const fail = async (status: string, message: string) => {
    await db
      .from("nimpos_webhook_events")
      .update({ status, last_error: message, attempts: 1, processed_at: new Date().toISOString() })
      .eq("id", ev.id);
    // 200: felet är vårt/mappningens, Nimpos ska inte retry:a i evighet
    return json({ ok: true, parked: status, message });
  };

  try {
    // 2. Butik
    const storeId = await mapStore(db, r.store_code, r.register_id);
    if (!storeId) {
      return await fail("unmapped_store", `Okänd butikskod: ${r.store_code ?? "(saknas)"}`);
    }

    // 3. Redan bokförd transaktion? (samma externa id)
    const externalId = String(r.external_id ?? eventId);
    const { data: existing } = await db
      .from("pos_transactions")
      .select("id")
      .eq("source", "nimpos")
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing?.id) {
      await db
        .from("nimpos_webhook_events")
        .update({ status: "duplicate", transaction_id: existing.id, processed_at: new Date().toISOString() })
        .eq("id", ev.id);
      return json({ ok: true, duplicate: true });
    }

    const cashierId = await mapCashier(db, storeId, r.cashier_code);
    const payments: Payment[] = Array.isArray(r.payments) ? r.payments : [];
    const isReturn = String(r.type ?? "sale") === "return";
    const sign = isReturn ? -1 : 1;

    const { data: store } = await db
      .from("stores")
      .select("legal_entity_id")
      .eq("id", storeId)
      .maybeSingle();

    let reversedId: string | null = null;
    if (r.reverses_external_id) {
      const { data: orig } = await db
        .from("pos_transactions")
        .select("id")
        .eq("source", "nimpos")
        .eq("external_id", String(r.reverses_external_id))
        .maybeSingle();
      reversedId = orig?.id ?? null;
    }

    const { data: tx, error: txErr } = await db
      .from("pos_transactions")
      .insert({
        source: "nimpos",
        external_id: externalId,
        external_receipt_no: r.receipt_no ?? null,
        external_register: r.register_id ?? null,
        external_cashier: r.cashier_code ?? null,
        cashier_id: cashierId,
        store_id: storeId,
        legal_entity_id: store?.legal_entity_id ?? null,
        occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString() : new Date().toISOString(),
        status: isReturn ? "reversed" : "completed",
        total_ore: sign * Math.abs(toOre(r.total_ore)),
        vat_breakdown: Array.isArray(r.vat_breakdown) ? r.vat_breakdown : [],
        payment_method: normalizeMethod(payments[0]?.method),
        payment_details: payments.map((p) => ({ ...p, method: normalizeMethod(p.method) })),
        control_code: r.control_code ?? null,
        reversed_transaction_id: reversedId,
      })
      .select("id")
      .single();

    if (txErr) throw txErr;

    // 4. Rader
    const items = Array.isArray(r.items) ? r.items : [];
    let unmatched = 0;
    if (items.length) {
      const rows = [];
      for (const it of items) {
        const productId = await mapProduct(db, it.sku ?? undefined, it.barcode ?? undefined, it.name);
        if (!productId) unmatched++;
        rows.push({
          transaction_id: tx.id,
          product_id: productId,
          product_name: it.name ?? "Okänd artikel",
          sku: it.sku ?? null,
          barcode: it.barcode ?? null,
          external_line_no: it.line_no ?? null,
          quantity: sign * Math.abs(Number(it.quantity ?? 0)),
          unit: it.unit ?? "st",
          unit_price_ore: Math.abs(toOre(it.unit_price_ore)),
          line_total_ore: sign * Math.abs(toOre(it.line_total_ore)),
          discount_ore: Math.abs(toOre(it.discount_ore)),
          vat_rate: Number(it.vat_rate ?? 12),
        });
      }
      const { error: itemErr } = await db.from("pos_transaction_items").insert(rows);
      if (itemErr) throw itemErr;
    }

    await db
      .from("nimpos_webhook_events")
      .update({
        status: unmatched > 0 ? "processed_partial" : "processed",
        transaction_id: tx.id,
        processed_at: new Date().toISOString(),
        last_error: unmatched > 0 ? `${unmatched} omatchade artiklar` : null,
      })
      .eq("id", ev.id);

    return json({ ok: true, duplicate: false, transaction_id: tx.id, unmatched_items: unmatched });
  } catch (e) {
    console.error("bearbetning misslyckades", e);
    return await fail("failed", (e as Error).message ?? String(e));
  }
});
