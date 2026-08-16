/**
 * nimpos-push — tömmer pos_sync_queue mot Nimpos artikel-/pris-API.
 *
 * Kön fylls av triggers på price_list_items/price_lists (endast prislistor med
 * pos_enabled = true). Varje post skickas som upsert eller delete av en artikel
 * i kassan. Ingen tyst radering: misslyckade poster får status failed med
 * felmeddelande och kan spelas upp igen.
 *
 * Body (allt frivilligt):
 *   { limit?: number, dry_run?: boolean, retry_failed?: boolean }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PUSH_URL = Deno.env.get("NIMPOS_PUSH_URL") ?? "";
const API_KEY = Deno.env.get("NIMPOS_API_KEY") ?? "";

type QueueRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function toArticle(p: Record<string, any>) {
  return {
    action: p.action ?? "upsert",
    sku: p.sku,
    barcode: p.barcode ?? null,
    name: p.name,
    unit: p.unit ?? "st",
    price: Number(p.price ?? 0),
    vat_rate: Number(p.vat_rate ?? 12),
    active: p.pos_enabled !== false,
    valid_from: p.valid_from ?? null,
    price_list: p.price_list_name ?? null,
    legal_entity_id: p.legal_entity_id ?? null,
    store_id: p.store_id ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let body: any = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 500);
  const dryRun = body.dry_run === true;
  const statuses = body.retry_failed === true ? ["pending", "failed"] : ["pending"];

  const { data: rows, error } = await db
    .from("pos_sync_queue")
    .select("id, entity_type, entity_id, payload, attempts")
    .in("status", statuses)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) return json({ error: error.message }, 500);

  const queue = (rows ?? []) as QueueRow[];
  if (queue.length === 0) return json({ ok: true, processed: 0, sent: 0, failed: 0 });

  // Nyaste posten per artikel vinner — äldre dubbletter markeras som sent.
  const latest = new Map<string, QueueRow>();
  const superseded: string[] = [];
  for (const row of queue) {
    const key = `${row.entity_type}:${String((row.payload as any)?.sku ?? row.entity_id)}`;
    const prev = latest.get(key);
    if (prev) superseded.push(prev.id);
    latest.set(key, row);
  }

  const batch = [...latest.values()];
  const articles = batch.map((r) => ({ queue_id: r.id, ...toArticle(r.payload as any) }));

  if (dryRun) {
    return json({ ok: true, dry_run: true, processed: 0, would_send: articles.length, articles });
  }

  if (!PUSH_URL || !API_KEY) {
    const msg = "NIMPOS_PUSH_URL/NIMPOS_API_KEY saknas — kan inte skicka till kassan";
    await db
      .from("pos_sync_queue")
      .update({ status: "failed", last_error: msg })
      .in("id", batch.map((r) => r.id));
    return json({ error: msg, pending: batch.length }, 424);
  }

  let sent = 0;
  let failed = 0;

  try {
    const res = await fetch(PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": API_KEY,
      },
      body: JSON.stringify({
        source: "makrilltrade",
        sent_at: new Date().toISOString(),
        articles: articles.map(({ queue_id: _drop, ...a }) => a),
      }),
    });

    const text = await res.text();

    if (!res.ok) {
      failed = batch.length;
      await db
        .from("pos_sync_queue")
        .update({
          status: "failed",
          last_error: `HTTP ${res.status}: ${text.slice(0, 500)}`,
        })
        .in("id", batch.map((r) => r.id));
    } else {
      sent = batch.length;
      const now = new Date().toISOString();
      await db
        .from("pos_sync_queue")
        .update({ status: "sent", sent_at: now, last_error: null })
        .in("id", [...batch.map((r) => r.id), ...superseded]);
    }
  } catch (e) {
    failed = batch.length;
    await db
      .from("pos_sync_queue")
      .update({ status: "failed", last_error: String((e as Error)?.message ?? e) })
      .in("id", batch.map((r) => r.id));
  }

  return json({ ok: failed === 0, processed: batch.length, sent, failed, superseded: superseded.length });
});
