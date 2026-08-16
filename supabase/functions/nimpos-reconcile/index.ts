/**
 * nimpos-reconcile — nattlig avstämning mot Nimpos läs-API (kontraktets avsnitt 8).
 *
 * Per butik och föregående dag:
 *   1. Hämta kvittolista (eller dagsrapport) från Nimpos
 *   2. Jämför antal kvitton och summa mot pos_transactions
 *   3. Lista saknade external_id, försök hämta in dem direkt
 *   4. Skriv utfallet i nimpos_reconciliations → visas på Systemstatus
 *
 * Läs-API:t konfigureras med NIMPOS_API_URL och NIMPOS_API_KEY (secrets).
 * Saknas de skrivs raden som "api_saknas" med lokala siffror, så att
 * driftpanelen ändå visar att avstämningen inte kunde göras.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { processEvent, scrubCardData, toOre } from "../_shared/nimpos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Svensk lokaldag (sommartidssäkert). */
function seDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type Remote = { count: number; totalOre: number; receipts: any[] };

async function fetchRemote(storeCode: string, date: string): Promise<Remote | null> {
  const base = Deno.env.get("NIMPOS_API_URL");
  const key = Deno.env.get("NIMPOS_API_KEY");
  if (!base || !key) return null;

  const url = `${base.replace(/\/$/, "")}/receipts?store_code=${encodeURIComponent(storeCode)}&date=${date}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Nimpos ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const receipts: any[] = Array.isArray(body?.receipts)
    ? body.receipts
    : Array.isArray(body)
      ? body
      : [];
  const count = Number(body?.receipt_count ?? receipts.length);
  const totalOre = Number(
    body?.total_ore ?? receipts.reduce((sum, r) => sum + toOre(r.total_ore), 0),
  );
  return { count, totalOre, receipts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const db = service();
  let payload: any = {};
  try {
    payload = req.method === "POST" ? await req.json() : {};
  } catch {
    payload = {};
  }
  const date: string = payload.date ?? seDate(-1);

  const { data: maps } = await db
    .from("nimpos_store_map")
    .select("store_code, store_id, active")
    .eq("active", true);

  const out: any[] = [];

  for (const m of maps ?? []) {
    const from = `${date}T00:00:00`;
    const to = `${date}T23:59:59.999`;
    const { data: local } = await db
      .from("pos_transactions")
      .select("external_id, total_ore")
      .eq("source", "nimpos")
      .eq("store_id", m.store_id)
      .eq("test_mode", false)
      .eq("parked", false)
      .gte("occurred_at", from)
      .lte("occurred_at", to);

    const localIds = new Set((local ?? []).map((t: any) => t.external_id));
    const localCount = local?.length ?? 0;
    const localTotal = (local ?? []).reduce((s: number, t: any) => s + Number(t.total_ore ?? 0), 0);

    let status = "ok";
    let message: string | null = null;
    let remote: Remote | null = null;
    let missing: string[] = [];
    let fetched = 0;

    try {
      remote = await fetchRemote(m.store_code, date);
    } catch (e) {
      status = "api_fel";
      message = (e as Error).message;
    }

    if (!remote && status === "ok") {
      status = "api_saknas";
      message = "NIMPOS_API_URL/NIMPOS_API_KEY saknas — kunde inte läsa från Nimpos";
    }

    if (remote) {
      missing = remote.receipts
        .map((r) => String(r.external_id ?? r.id ?? ""))
        .filter((id) => id && !localIds.has(id));

      // Efterhämtning: saknade kvitton köas och bearbetas som vanligt
      for (const id of missing.slice(0, 100)) {
        const receipt = remote.receipts.find((r) => String(r.external_id ?? r.id) === id);
        if (!receipt) continue;
        const eventId = `recon-${m.store_code}-${date}-${id}`;
        const clean = scrubCardData({
          event_type: "sale.completed",
          receipt: { ...receipt, store_code: receipt.store_code ?? m.store_code },
        });
        const { data: ev, error: evErr } = await db
          .from("nimpos_webhook_events")
          .insert({
            event_id: eventId,
            event_type: "sale.reconciled",
            payload: clean,
            store_code: m.store_code,
            status: "koad",
          })
          .select("id")
          .single();
        if (evErr) continue;
        const res = await processEvent(db, ev.id, clean, eventId, false);
        if (res.body?.transaction_id) fetched++;
      }

      const countDiff = remote.count - (localCount + fetched);
      const totalDiff = remote.totalOre - localTotal;
      if (countDiff !== 0 || Math.abs(totalDiff) > 0) {
        status = missing.length && fetched === missing.length ? "efterhamtad" : "avvikelse";
        message = `Nimpos ${remote.count} kvitton / ${remote.totalOre} öre mot lokalt ${localCount + fetched} / ${localTotal} öre`;
      }
    }

    const row = {
      store_id: m.store_id,
      store_code: m.store_code,
      business_date: date,
      external_count: remote?.count ?? null,
      external_total_ore: remote?.totalOre ?? null,
      local_count: localCount + fetched,
      local_total_ore: localTotal,
      missing_external_ids: missing,
      fetched_count: fetched,
      status,
      message,
    };
    await db.from("nimpos_reconciliations").upsert(row, { onConflict: "store_id,business_date" });
    out.push(row);
  }

  return json({ ok: true, date, stores: out.length, results: out });
});
