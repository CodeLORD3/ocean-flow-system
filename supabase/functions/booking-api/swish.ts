/**
 * Swish-depositioner för förbokningar (Swish Handel, mTLS mot cpc.getswish.net).
 *
 * Endpoints som router:n i index.ts kopplar in:
 *   /create-payment   skapar betalningsbegäran → token för Swish-appen
 *   /payment-status   pollning; frågar Swish först när callbacken dröjer
 *   /swish-callback    Swish rapporterar utfall — svarar alltid 200
 *
 * Kräver secrets: SWISH_CERT_PEM, SWISH_KEY_PEM, SWISH_PAYEE_ALIAS.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SWISH_BASE = "https://cpc.getswish.net";
/** Deposition per bokning — priset låses aldrig, resten betalas i butik. */
export const DEPOSIT_SEK = 200;

const pem = (name: string) => (Deno.env.get(name) ?? "").replace(/\\n/g, "\n").trim();

export const swishConfigured = () => !!pem("SWISH_CERT_PEM") && !!pem("SWISH_KEY_PEM");

let httpClient: unknown = null;
function swishClient() {
  if (httpClient) return httpClient;
  // deno-lint-ignore no-explicit-any
  httpClient = (Deno as any).createHttpClient({
    cert: pem("SWISH_CERT_PEM"),
    key: pem("SWISH_KEY_PEM"),
  });
  return httpClient;
}

const swishFetch = (url: string, init: RequestInit = {}) =>
  // deno-lint-ignore no-explicit-any
  fetch(url, { ...init, client: swishClient() } as any);

function uuid32() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function normalizeAlias(input?: string | null) {
  if (!input) return null;
  const d = String(input).replace(/\D/g, "");
  if (d.startsWith("46")) return d;
  if (d.startsWith("0")) return `46${d.slice(1)}`;
  if (d.length === 9) return `46${d}`;
  return d;
}

/** POST /create-payment */
// deno-lint-ignore no-explicit-any
export async function createPayment(db: SupabaseClient, body: any, req: Request) {
  if (!swishConfigured()) {
    return { ok: false, message: "Swish är inte konfigurerat ännu." };
  }
  const paymentRef = uuid32();
  const callbackIdentifier = uuid32();
  const payerAlias = normalizeAlias(body?.payer_alias);
  const origin = new URL(req.url).origin;

  const payload: Record<string, unknown> = {
    payeePaymentReference: paymentRef.slice(0, 20),
    payeeAlias: Deno.env.get("SWISH_PAYEE_ALIAS"),
    currency: "SEK",
    amount: DEPOSIT_SEK,
    message: `Forbokning ${paymentRef.slice(0, 6)}`,
    callbackUrl: `${origin}/functions/v1/booking-api/swish-callback`,
    callbackIdentifier,
  };
  if (payerAlias) payload.payerAlias = payerAlias;

  let res: Response;
  try {
    res = await swishFetch(`${SWISH_BASE}/swish-cpcapi/api/v2/paymentrequests/${paymentRef}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("swish connect", String(err));
    return { ok: false, message: "Vi når inte Swish just nu. Prova gärna en gång till." };
  }

  if (res.status !== 201) {
    console.error("swish", res.status, await res.text());
    return { ok: false, message: "Swish tog inte emot betalningen. Prova gärna en gång till." };
  }

  const token = res.headers.get("paymentrequesttoken");
  await db.from("payments").insert({
    payment_ref: paymentRef,
    verification_ref: body?.verification_ref ?? null,
    store_id: body?.store_id ?? null,
    phone: body?.phone ?? null,
    amount: DEPOSIT_SEK,
    status: "CREATED",
    callback_identifier: callbackIdentifier,
  });

  return { ok: true, payment_ref: paymentRef, token, qr_url: null, status: "CREATED" };
}

/** POST /payment-status */
// deno-lint-ignore no-explicit-any
export async function paymentStatus(db: SupabaseClient, body: any) {
  const ref = String(body?.payment_ref ?? "");
  if (!/^[0-9A-F]{32}$/.test(ref)) return { ok: false, message: "Okänd betalning." };

  const { data: row } = await db
    .from("payments")
    .select("status, created_at")
    .eq("payment_ref", ref)
    .maybeSingle();
  if (!row) return { ok: false, message: "Okänd betalning." };

  const age = Date.now() - new Date(row.created_at as string).getTime();
  // Callbacken är den snabba vägen; vi frågar Swish först när den dröjt.
  if (row.status !== "CREATED" || age < 10_000) return { ok: true, status: row.status };

  try {
    const res = await swishFetch(`${SWISH_BASE}/swish-cpcapi/api/v1/paymentrequests/${ref}`);
    if (res.ok) {
      const fresh = await res.json();
      if (fresh.status && fresh.status !== row.status) {
        await db
          .from("payments")
          .update({
            status: fresh.status,
            error_code: fresh.errorCode ?? null,
            date_paid: fresh.datePaid ?? null,
          })
          .eq("payment_ref", ref);
        return { ok: true, status: fresh.status };
      }
    }
  } catch (err) {
    console.error("swish status", String(err));
  }
  return { ok: true, status: row.status };
}

/** POST /swish-callback — svarar alltid 200 så Swish inte köar om i onödan. */
export async function swishCallback(db: SupabaseClient, req: Request) {
  const payload = await req.json().catch(() => null);
  if (payload?.id) {
    const { data: row } = await db
      .from("payments")
      .select("callback_identifier")
      .eq("payment_ref", payload.id)
      .maybeSingle();
    const sent = req.headers.get("callbackidentifier") ?? payload.callbackIdentifier;
    if (row && sent === row.callback_identifier) {
      await db
        .from("payments")
        .update({
          status: payload.status ?? "ERROR",
          error_code: payload.errorCode ?? null,
          date_paid: payload.datePaid ?? null,
        })
        .eq("payment_ref", payload.id);
    }
  }
  return true;
}
