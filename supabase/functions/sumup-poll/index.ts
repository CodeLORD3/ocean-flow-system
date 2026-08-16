/**
 * SumUp → Makrill Trade, etapp 1: hämtning och kö (inga lagerrörelser).
 *
 * Kontrakt och testprotokoll: docs/sumup-integration.md
 *
 * Lägen:
 *   POST  {}                          → pollar alla aktiva merchants
 *   POST  { merchant_code }           → pollar en merchant
 *   POST  { action: "probe", merchant_code, transaction_id }
 *                                     → returnerar rå (kortskrubbad) JSON för
 *                                       transaktion + kvitto. Viktvarutestet.
 *   POST  { action: "health" }        → körningsstatus och larm
 *
 * Alla lägen utom "probe" körs av schemaläggaren med service-nyckel. Probe och
 * health kräver inloggad personal (JWT valideras i koden, verify_jwt = false).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SumupClient, interpretLine, majorToMinor, normalizePayment, scrubCard } from "../_shared/sumup.ts";

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

async function requireStaff(req: Request, db: SupabaseClient): Promise<boolean> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await db.auth.getUser(token);
  if (!data?.user) return false;
  // Personalregistret avgör — samma spärr som i appen.
  const { data: staff } = await db
    .from("staff")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  return !!staff;
}

type Merchant = {
  merchant_code: string;
  store_id: string;
  legal_entity_id: string;
  currency: string;
  test_mode: boolean;
  last_success_at: string | null;
  fail_streak: number;
};

function keyFor(m: Merchant): string | null {
  return (
    (m.test_mode
      ? Deno.env.get("SUMUP_API_KEY_SANDBOX") ?? Deno.env.get("SUMUP_API_KEY")
      : Deno.env.get("SUMUP_API_KEY")) ?? null
  );
}

/* --------------------------------------------------------------- produktmatch */

/**
 * Namnmatchning mot den lärande mappningen. Bekräftad mappning vinner, annars
 * exakt namn i produktregistret, annars räknas namnet upp som omatchat och
 * hamnar i granskningsvyn.
 */
async function matchProduct(
  db: SupabaseClient,
  merchantCode: string,
  name: string,
): Promise<{ product_id: string | null; unit: string | null; matched_by: string }> {
  const key = name.trim().toLowerCase();
  if (!key) return { product_id: null, unit: null, matched_by: "tomt_namn" };

  const { data: mapped } = await db
    .from("sumup_product_map")
    .select("product_id, unit, merchant_code")
    .eq("external_name_key", key)
    .order("merchant_code", { nullsFirst: false })
    .limit(2);
  const hit = mapped?.find((m: any) => m.merchant_code === merchantCode) ?? mapped?.[0];
  if (hit?.product_id) {
    return { product_id: hit.product_id, unit: hit.unit ?? null, matched_by: "mappning" };
  }

  const { data: exact } = await db
    .from("products")
    .select("id, unit")
    .ilike("name", name.trim())
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (exact?.id) {
    await db.from("sumup_product_map").upsert(
      {
        merchant_code: merchantCode,
        external_name: name.trim(),
        product_id: exact.id,
        unit: exact.unit,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "merchant_code,external_name_key", ignoreDuplicates: false },
    );
    return { product_id: exact.id, unit: exact.unit ?? null, matched_by: "namn" };
  }

  // Omatchat: räkna upp så granskningsvyn kan prioritera.
  const { data: existing } = await db
    .from("sumup_product_map")
    .select("id, unmatched_count")
    .eq("external_name_key", key)
    .is("product_id", null)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await db
      .from("sumup_product_map")
      .update({
        unmatched_count: (existing.unmatched_count ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await db.from("sumup_product_map").insert({
      merchant_code: merchantCode,
      external_name: name.trim(),
      unmatched_count: 1,
    });
  }
  return { product_id: null, unit: null, matched_by: "omatchad" };
}

/* -------------------------------------------------------------------- pollning */

async function pollMerchant(db: SupabaseClient, m: Merchant, sinceOverride?: string | null) {
  const key = keyFor(m);
  const startedAt = new Date().toISOString();
  const since = sinceOverride
    ? new Date(sinceOverride).toISOString()
    : new Date(
        (m.last_success_at ? new Date(m.last_success_at).getTime() : Date.now() - 24 * 3600 * 1000) -
          5 * 60 * 1000,
      ).toISOString();

  const run = {
    merchant_code: m.merchant_code,
    started_at: startedAt,
    changes_since: since,
    test_mode: m.test_mode,
    fetched_count: 0,
    queued_count: 0,
    duplicate_count: 0,
    status: "kord",
    http_status: null as number | null,
    error_code: null as string | null,
    message: null as string | null,
  };

  if (!key) {
    run.status = "fel";
    run.error_code = "saknad_nyckel";
    run.message = m.test_mode ? "SUMUP_API_KEY_SANDBOX saknas" : "SUMUP_API_KEY saknas";
    await finishRun(db, m, run, null);
    return run;
  }

  const client = new SumupClient(key);
  let latestTx: string | null = null;

  try {
    const history = await client.history(m.merchant_code, since);
    const wanted = history.filter((h: any) => {
      const type = String(h?.transaction_type ?? h?.type ?? "PAYMENT").toUpperCase();
      const status = String(h?.status ?? "").toUpperCase();
      return (
        ["PAYMENT", "REFUND"].includes(type) && ["SUCCESSFUL", "REFUNDED", "PAID"].includes(status)
      );
    });
    run.fetched_count = wanted.length;

    for (const h of wanted) {
      const externalId = String(h?.transaction_id ?? h?.id ?? "");
      if (!externalId) continue;

      const { data: seen } = await db
        .from("sumup_events")
        .select("id")
        .eq("merchant_code", m.merchant_code)
        .eq("external_id", externalId)
        .maybeSingle();
      if (seen?.id) {
        run.duplicate_count++;
        continue;
      }

      const tx = await client.transaction(m.merchant_code, externalId);
      let receipt: unknown = null;
      try {
        receipt = await client.receipt(m.merchant_code, externalId);
      } catch (_e) {
        // Kvittot kan dröja några sekunder efter betalningen — transaktionen
        // köas ändå, kvittonummret fylls på vid nattavstämningen.
        receipt = null;
      }

      const occurredAt = tx?.timestamp ?? h?.timestamp ?? null;
      const type = String(tx?.transaction_type ?? h?.transaction_type ?? "PAYMENT").toUpperCase();

      const { error } = await db.from("sumup_events").insert({
        merchant_code: m.merchant_code,
        external_id: externalId,
        transaction_code: tx?.transaction_code ?? h?.transaction_code ?? null,
        event_type: type,
        payload: scrubCard(tx ?? h),
        receipt_payload: receipt ? scrubCard(receipt) : null,
        status: "koad",
        test_mode: m.test_mode,
        occurred_at: occurredAt,
      });
      if (error) {
        if (error.code === "23505" || /duplicate/i.test(error.message)) run.duplicate_count++;
        else throw { status: 500, code: "ko_fel", message: error.message };
        continue;
      }
      run.queued_count++;
      latestTx = occurredAt ?? latestTx;

      // Namnmatchning körs redan här så granskningsvyn fylls i etapp 1.
      for (const p of (tx?.products ?? []) as any[]) {
        const name = String(p?.name ?? p?.description ?? "").trim();
        if (name) await matchProduct(db, m.merchant_code, name);
      }

      // Valutakontroll: allt utom butikens valuta parkeras med larm.
      const currency = String(tx?.currency ?? h?.currency ?? m.currency).toUpperCase();
      if (currency !== m.currency.toUpperCase()) {
        await db
          .from("sumup_events")
          .update({
            status: "fel",
            last_error: `valutaavvikelse: ${currency} mot förväntad ${m.currency}`,
          })
          .eq("merchant_code", m.merchant_code)
          .eq("external_id", externalId);
      }
    }

    run.status = "ok";
    await finishRun(db, m, run, latestTx);
    return run;
  } catch (e: any) {
    run.status = "fel";
    run.http_status = typeof e?.status === "number" ? e.status : null;
    run.error_code = e?.code ?? "okant";
    run.message = String(e?.message ?? e).slice(0, 400);
    await finishRun(db, m, run, latestTx);
    return run;
  }
}

async function finishRun(
  db: SupabaseClient,
  m: Merchant,
  run: Record<string, unknown>,
  latestTx: string | null,
) {
  await db.from("sumup_poll_runs").insert({ ...run, finished_at: new Date().toISOString() });
  const ok = run.status === "ok";
  await db
    .from("sumup_merchants")
    .update({
      last_polled_at: new Date().toISOString(),
      ...(ok ? { last_success_at: new Date().toISOString(), fail_streak: 0, last_error: null } : {}),
      ...(ok ? {} : { fail_streak: (m.fail_streak ?? 0) + 1, last_error: String(run.message ?? "") }),
      ...(latestTx ? { last_transaction_at: latestTx } : {}),
    })
    .eq("merchant_code", m.merchant_code);
}

/* ------------------------------------------------------------------- handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = service();

  let body: any = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch (_e) {
    body = {};
  }
  const action = String(body?.action ?? "poll");

  if (action === "probe") {
    if (!(await requireStaff(req, db))) return json({ error: "unauthorized" }, 401);
    const merchantCode = String(body?.merchant_code ?? "");
    const txId = String(body?.transaction_id ?? "");
    if (!merchantCode || !txId) return json({ error: "merchant_code och transaction_id krävs" }, 400);

    const { data: merchant } = await db
      .from("sumup_merchants")
      .select("*")
      .eq("merchant_code", merchantCode)
      .maybeSingle();
    if (!merchant) return json({ error: "okänd merchant_code" }, 404);
    const key = keyFor(merchant as Merchant);
    if (!key) return json({ error: "API-nyckel saknas" }, 400);

    const client = new SumupClient(key);
    try {
      const tx = await client.transaction(merchantCode, txId);
      let receipt: unknown = null;
      try {
        receipt = await client.receipt(merchantCode, txId);
      } catch (e: any) {
        receipt = { error: e?.message ?? String(e) };
      }
      const lines = ((tx?.products ?? []) as any[]).map((p) => ({
        raw: scrubCard(p),
        tolkad_som_styck: interpretLine(p, { isWeightItem: false }),
        tolkad_som_kg: interpretLine(p, { isWeightItem: true }),
      }));
      return json({
        transaction: scrubCard(tx),
        receipt: scrubCard(receipt),
        tolkning: lines,
        summering: {
          valuta: tx?.currency ?? null,
          belopp_minor: majorToMinor(tx?.amount),
          betalsatt: normalizePayment(tx?.payment_type ?? tx?.card?.type),
          typ: tx?.transaction_type ?? null,
        },
      });
    } catch (e: any) {
      return json({ error: e?.message ?? String(e), status: e?.status ?? null }, 502);
    }
  }

  if (action === "health") {
    if (!(await requireStaff(req, db))) return json({ error: "unauthorized" }, 401);
    const { data: merchants } = await db.from("sumup_merchants").select("*").eq("active", true);
    const { data: runs } = await db
      .from("sumup_poll_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);
    return json({ merchants: merchants ?? [], runs: runs ?? [] });
  }

  // Schemalagd pollning (service-nyckel).
  const q = db.from("sumup_merchants").select("*").eq("active", true);
  const { data: merchants, error } = body?.merchant_code
    ? await q.eq("merchant_code", String(body.merchant_code))
    : await q;
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const m of (merchants ?? []) as Merchant[]) {
    results.push(await pollMerchant(db, m));
  }
  return json({ ok: true, merchants: results.length, results });
});
