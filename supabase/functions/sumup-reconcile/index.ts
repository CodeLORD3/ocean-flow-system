/**
 * SumUp etapp 2: nattlig avstämning (03:30 Zürich-tid).
 *
 * För varje aktiv handlare och ett givet datum:
 *   1. Hämtar dagens transaktioner från SumUp igen (samma källa som pollningen).
 *   2. Efterhämtar transaktioner som saknas i kön och bearbetar dem.
 *   3. Fyller på kvittonummer som saknades när betalningen kom in.
 *   4. Jämför antal och belopp mot pos_transactions i butikens valuta och
 *      skriver resultatet till sumup_reconciliations (Systemstatus).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { SumupClient, majorToMinor, scrubCard } from "../_shared/sumup.ts";
import { processQueue } from "../_shared/sumup-process.ts";

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

type Merchant = {
  merchant_code: string;
  store_id: string;
  legal_entity_id: string | null;
  currency: string;
  test_mode: boolean;
};

function keyFor(m: Merchant): string | null {
  return (
    (m.test_mode
      ? Deno.env.get("SUMUP_API_KEY_SANDBOX") ?? Deno.env.get("SUMUP_API_KEY")
      : Deno.env.get("SUMUP_API_KEY")) ?? null
  );
}

/** Gårdagens datum i butikens tidszon (Zollikon = Europe/Zurich). */
function yesterdayIso(timeZone = "Europe/Zurich"): string {
  const now = new Date(Date.now() - 24 * 3600 * 1000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(now);
}

function dayBounds(date: string, timeZone = "Europe/Zurich") {
  // Marginal på båda sidor: SumUp tidsstämplar i UTC, butiken bokförs lokalt.
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(`${date}T23:59:59Z`);
  const pad = 3 * 3600 * 1000;
  return {
    from: new Date(start.getTime() - pad).toISOString(),
    to: new Date(end.getTime() + pad).toISOString(),
    timeZone,
  };
}

function localDate(ts: string, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, dateStyle: "short" }).format(new Date(ts));
}

async function reconcileMerchant(db: SupabaseClient, m: Merchant, date: string) {
  const key = keyFor(m);
  const row: Record<string, unknown> = {
    merchant_code: m.merchant_code,
    recon_date: date,
    currency: m.currency,
    status: "ok",
  };

  if (!key) {
    return { ...row, status: "fel", message: "API-nyckel saknas" };
  }

  const client = new SumupClient(key);
  const { from, timeZone } = dayBounds(date);

  let history: any[] = [];
  try {
    history = await client.history(m.merchant_code, from);
  } catch (e: any) {
    return { ...row, status: "fel", message: String(e?.message ?? e).slice(0, 400) };
  }

  const wanted = history.filter((h: any) => {
    const type = String(h?.transaction_type ?? h?.type ?? "PAYMENT").toUpperCase();
    const status = String(h?.status ?? "").toUpperCase();
    const ts = h?.timestamp ?? null;
    return (
      ["PAYMENT", "REFUND"].includes(type) &&
      ["SUCCESSFUL", "REFUNDED", "PAID"].includes(status) &&
      ts &&
      localDate(ts, timeZone) === date
    );
  });

  const sumupTotal = wanted.reduce((a, h: any) => {
    const sign = String(h?.transaction_type ?? "PAYMENT").toUpperCase() === "REFUND" ? -1 : 1;
    return a + sign * Math.abs(majorToMinor(h?.amount));
  }, 0);

  // Efterhämtning: transaktioner som aldrig nådde kön.
  const externalIds = wanted.map((h: any) => String(h?.transaction_id ?? h?.id ?? "")).filter(Boolean);
  const missing: string[] = [];
  let refetched = 0;
  let receiptFilled = 0;

  for (const id of externalIds) {
    const { data: ev } = await db
      .from("sumup_events")
      .select("id, status, receipt_payload")
      .eq("merchant_code", m.merchant_code)
      .eq("external_id", id)
      .maybeSingle();

    if (!ev?.id) {
      missing.push(id);
      try {
        const tx = await client.transaction(m.merchant_code, id);
        let receipt: unknown = null;
        try {
          receipt = await client.receipt(m.merchant_code, id);
        } catch (_e) {
          receipt = null;
        }
        await db.from("sumup_events").insert({
          merchant_code: m.merchant_code,
          external_id: id,
          transaction_code: tx?.transaction_code ?? null,
          event_type: String(tx?.transaction_type ?? "PAYMENT").toUpperCase(),
          payload: scrubCard(tx),
          receipt_payload: receipt ? scrubCard(receipt) : null,
          status: "koad",
          test_mode: m.test_mode,
          occurred_at: tx?.timestamp ?? null,
        });
        refetched += 1;
      } catch (_e) {
        // Nästa körning försöker igen; avvikelsen syns i rapporten.
      }
      continue;
    }

    // Kvittonummer som saknades när betalningen kom in fylls på nu.
    if (!ev.receipt_payload) {
      try {
        const receipt = await client.receipt(m.merchant_code, id);
        if (receipt) {
          await db
            .from("sumup_events")
            .update({ receipt_payload: scrubCard(receipt) })
            .eq("id", ev.id);
          const receiptNo =
            (receipt as any)?.transaction_data?.receipt_no ?? (receipt as any)?.receipt_no ?? null;
          if (receiptNo) {
            await db
              .from("pos_transactions")
              .update({ external_receipt_no: String(receiptNo) })
              .eq("source", "sumup")
              .eq("external_id", id)
              .is("external_receipt_no", null);
          }
          receiptFilled += 1;
        }
      } catch (_e) {
        // Kvittot kan vara borta hos SumUp — transaktionen står ändå rätt.
      }
    }
  }

  // Bearbeta allt som ligger kvar i kön för handlaren.
  await processQueue(db, { merchantCode: m.merchant_code, limit: 500 });

  // Lokal summering i butikens valuta.
  const { data: local } = await db
    .from("pos_transactions")
    .select("total_ore, occurred_at, currency")
    .eq("source", "sumup")
    .eq("store_id", m.store_id)
    .eq("test_mode", false)
    .gte("occurred_at", `${date}T00:00:00Z`)
    .lte("occurred_at", `${date}T23:59:59.999Z`);
  const localRows = (local ?? []).filter(
    (t: any) => localDate(t.occurred_at, timeZone) === date && (t.currency ?? m.currency) === m.currency,
  );
  const localTotal = localRows.reduce((a: number, t: any) => a + Number(t.total_ore ?? 0), 0);

  const diff = localTotal - sumupTotal;
  const problems = [
    missing.length ? `${missing.length} saknade transaktioner` : null,
    localRows.length !== wanted.length
      ? `antal skiljer: SumUp ${wanted.length} mot Makrilltrade ${localRows.length}`
      : null,
    diff !== 0 ? `beloppsavvikelse ${(diff / 100).toFixed(2)} ${m.currency}` : null,
  ].filter(Boolean);

  return {
    ...row,
    sumup_count: wanted.length,
    sumup_total_minor: sumupTotal,
    local_count: localRows.length,
    local_total_minor: localTotal,
    diff_minor: diff,
    missing_external_ids: missing,
    refetched_count: refetched,
    receipt_filled_count: receiptFilled,
    status: problems.length ? "avvikelse" : "ok",
    message: problems.length ? problems.join(", ") : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = service();

  let body: any = {};
  try {
    body = req.method === "POST" ? await req.json() : {};
  } catch (_e) {
    body = {};
  }

  const date = body?.date ? String(body.date) : yesterdayIso();
  const q = db.from("sumup_merchants").select("*").eq("active", true);
  const { data: merchants, error } = body?.merchant_code
    ? await q.eq("merchant_code", String(body.merchant_code))
    : await q;
  if (error) return json({ error: error.message }, 500);

  const rows = [];
  for (const m of (merchants ?? []) as Merchant[]) {
    const row = await reconcileMerchant(db, m, date);
    await db.from("sumup_reconciliations").upsert(row, { onConflict: "merchant_code,recon_date" });
    rows.push(row);
  }

  return json({ ok: true, date, merchants: rows.length, results: rows });
});
