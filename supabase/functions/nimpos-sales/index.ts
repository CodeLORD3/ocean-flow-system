/**
 * Nimpos → Makrill Trade: Sales Ingest API v1.
 *
 * Kontrakt: docs/nimpos-utvecklarinstruktion.md (avsnitt 5 svarskoder, 6 curl,
 * 7 statusuppslag, 8 avstämning, 9 testkvitton).
 *
 * Ordning:
 *   1. HMAC-SHA256 över RAW body mot NIMPOS_WEBHOOK_SECRET (ingen JSON först)
 *   2. Replay-skydd: X-Nimpos-Timestamp max 300 s gammal → 400 stale_timestamp
 *   3. Kvittot köas rått i nimpos_webhook_events (status "koad"), event_id är
 *      primär idempotensnyckel, receipt.external_id sekundär
 *   4. Bearbetning: pos_transactions + rader + lagerrörelser (FEFO) ur butikens
 *      försäljningslager. Kortets last4 kastas alltid vid mottagning.
 *
 * Aldrig 5xx för innehållsfel — då retry:ar kassan i onödan. Innehållsfel
 * parkeras (unmapped_store/failed) och syns på /pos-live och Systemstatus.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processEvent, scrubCardData } from "../_shared/nimpos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nimpos-signature, x-nimpos-event-id, x-nimpos-timestamp, x-nimpos-test",
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

  /* ---------------------------------------- GET: statusuppslag (avsnitt 7)
   * Signaturen räknas över query-strängen (utan "?") med samma hemlighet.
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
      .select("id, occurred_at, total_ore, status, test_mode")
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
        test_mode: txRow.test_mode,
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

  const db = service();
  const storeCodeHint = (() => {
    const m = raw.match(/"store_code"\s*:\s*"([^"]+)"/);
    return m?.[1] ?? null;
  })();
  const reject = async (reason: string, detail?: string) => {
    await db.from("nimpos_rejects").insert({
      reason,
      store_code: storeCodeHint,
      event_id: eventId || null,
      detail: detail ?? null,
    });
  };

  const expected = await hmacHex(secret, raw);
  const provided = sigHeader.replace(/^sha256=/i, "").trim().toLowerCase();
  if (!safeEqual(expected, provided)) {
    await reject("bad_signature");
    return json({ error: "bad_signature" }, 401);
  }

  if (tsHeader) {
    const ts = Number(tsHeader);
    if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
      await reject("stale_timestamp", tsHeader);
      return json({ error: "stale_timestamp" }, 400);
    }
  }

  let body: any;
  try {
    body = scrubCardData(JSON.parse(raw));
  } catch {
    await reject("bad_json");
    return json({ error: "bad_json" }, 400);
  }

  const r = body?.receipt ?? body;
  if (!r || typeof r !== "object") return json({ error: "missing_receipt" }, 400);

  const testMode =
    r.test === true ||
    body?.test === true ||
    (req.headers.get("x-nimpos-test") ?? "").toLowerCase() === "true";

  // 1. Råhändelse i kön (idempotent på event_id)
  const { data: ev, error: evErr } = await db
    .from("nimpos_webhook_events")
    .insert({
      event_id: eventId,
      event_type: body?.event_type ?? "sale.completed",
      payload: body,
      store_code: r.store_code ?? null,
      status: "koad",
      test_mode: testMode,
    })
    .select("id")
    .single();

  if (evErr) {
    // 23505 = unique violation → redan mottaget, kvittera utan dubblett
    if ((evErr as any).code === "23505") return json({ ok: true, duplicate: true });
    console.error("kunde inte köa händelse", evErr);
    return json({ error: "log_failed" }, 500);
  }

  const result = await processEvent(db, ev.id, body, eventId, testMode);
  return json(result.body, result.status);
});

