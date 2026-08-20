/**
 * Swish-depositioner för förbokningar (Swish Handel, mTLS mot cpc.getswish.net).
 *
 * Endpoints som router:n i index.ts kopplar in:
 *   /create-payment   skapar betalningsbegäran → token för Swish-appen
 *   /payment-status   pollning; frågar Swish först när callbacken dröjer
 *   /swish-callback   Swish rapporterar utfall — svarar alltid 200
 *   /swish-diagnose   kontroll av secrets och handskakning (inga hemligheter läcker)
 *
 * Kräver secrets: SWISH_CERT_PEM, SWISH_KEY_PEM, SWISH_PAYEE_ALIAS.
 * Valfritt: SWISH_BASE_URL (default produktion), SWISH_CA_PEM.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const DEFAULT_BASE = "https://cpc.getswish.net/swish-cpcapi";
const baseUrl = () => (Deno.env.get("SWISH_BASE_URL") ?? DEFAULT_BASE).replace(/\/$/, "");

/** Deposition per bokning — priset låses aldrig, resten betalas i butik. */
export const DEPOSIT_SEK = 200;

/**
 * Secrets kan ha tappat radbrytningar (literala \n eller mellanslag). Vi bygger
 * om varje PEM-block från grunden: base64-innehållet rensas och radbryts på 64
 * tecken, vilket är enda formatet Deno.createHttpClient accepterar.
 */
function normalizePem(raw: string): string {
  const text = raw.replace(/\\r/g, "").replace(/\\n/g, "\n").trim();
  const blocks = [...text.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/g)];
  if (!blocks.length) return text;
  return blocks
    .map(([, label, bodyRaw]) => {
      const b64 = bodyRaw.replace(/[^A-Za-z0-9+/=]/g, "");
      const lines = b64.match(/.{1,64}/g) ?? [];
      return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
    })
    .join("\n") + "\n";
}

const pem = (name: string) => normalizePem(Deno.env.get(name) ?? "");

export const swishConfigured = () => !!pem("SWISH_CERT_PEM") && !!pem("SWISH_KEY_PEM");

let httpClient: unknown = null;
let clientError: string | null = null;

function swishClient() {
  if (httpClient) return httpClient;
  if (clientError) throw new Error(clientError);
  const cert = pem("SWISH_CERT_PEM");
  const key = pem("SWISH_KEY_PEM");
  if (!cert.includes("BEGIN CERTIFICATE")) {
    clientError = "SWISH_CERT_PEM saknar -----BEGIN CERTIFICATE-----";
    throw new Error(clientError);
  }
  if (key.includes("ENCRYPTED PRIVATE KEY")) {
    clientError =
      "SWISH_KEY_PEM är krypterad. Konvertera: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-nocrypt.pem";
    throw new Error(clientError);
  }
  if (!/BEGIN (RSA )?PRIVATE KEY/.test(key)) {
    clientError = "SWISH_KEY_PEM saknar -----BEGIN PRIVATE KEY-----";
    throw new Error(clientError);
  }
  const caPem = pem("SWISH_CA_PEM");
  try {
    // deno-lint-ignore no-explicit-any
    httpClient = (Deno as any).createHttpClient({
      cert,
      key,
      ...(caPem ? { caCerts: [caPem] } : {}),
    });
  } catch (err) {
    clientError = `createHttpClient: ${err instanceof Error ? err.message : String(err)}`;
    throw new Error(clientError);
  }
  return httpClient;
}

const swishFetch = (url: string, init: RequestInit = {}) =>
  // deno-lint-ignore no-explicit-any
  fetch(url, { ...init, client: swishClient() } as any);

/** 32 tecken, versaler, inga bindestreck. */
function instructionUuid() {
  return crypto.randomUUID().replace(/-/g, "").toUpperCase();
}

function normalizeAlias(input?: string | null) {
  if (!input) return null;
  const d = String(input).replace(/\D/g, "");
  if (d.startsWith("46")) return d;
  if (d.startsWith("0")) return `46${d.slice(1)}`;
  if (d.length === 9) return `46${d}`;
  return d;
}

/** Plockar ut Swish-felkoden (t.ex. RP03, PA02) ur ett felsvar. */
function swishErrorCode(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const codes = arr.map((e) => e?.errorCode).filter(Boolean);
    if (codes.length) return codes.join(",");
  } catch {
    // inte JSON — falla igenom
  }
  const m = raw.match(/\b([A-Z]{2}\d{2})\b/);
  return m ? m[1] : null;
}

/** POST /create-payment */
// deno-lint-ignore no-explicit-any
export async function createPayment(db: SupabaseClient, body: any, req: Request) {
  if (!swishConfigured()) {
    return { ok: false, message: "Swish är inte konfigurerat ännu.", error_code: "NO_CONFIG" };
  }
  const paymentRef = instructionUuid();
  const callbackIdentifier = instructionUuid();
  const payerAlias = normalizeAlias(body?.payer_alias);
  // callbackUrl måste vara publik HTTPS på port 443 — härled den från projektets
  // URL istället för req.url, som kan vara en intern adress bakom proxyn.
  const projectBase = (Deno.env.get("SUPABASE_URL") ?? new URL(req.url).origin).replace(/\/$/, "");

  const payload: Record<string, unknown> = {
    payeePaymentReference: paymentRef,
    payeeAlias: normalizeAlias(Deno.env.get("SWISH_PAYEE_ALIAS")),
    currency: "SEK",
    amount: DEPOSIT_SEK.toFixed(2),
    message: `Deposition bokning ${paymentRef.slice(0, 6)}`,
    callbackUrl: `${projectBase}/functions/v1/booking-api/swish-callback`,
    callbackIdentifier,
  };
  if (payerAlias) payload.payerAlias = payerAlias;

  let res: Response;
  try {
    res = await swishFetch(`${baseUrl()}/api/v2/paymentrequests/${paymentRef}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("swish connect", baseUrl(), detail);
    return {
      ok: false,
      message: "Vi når inte Swish just nu. Prova gärna en gång till.",
      error_code: "TLS_OR_CONFIG",
      detail,
    };
  }

  if (res.status !== 201) {
    const raw = await res.text();
    const code = swishErrorCode(raw);
    console.error("swish create-payment", res.status, code ?? "-", raw.slice(0, 800));
    return {
      ok: false,
      message: "Swish tog inte emot betalningen. Prova gärna en gång till.",
      http_status: res.status,
      error_code: code,
      detail: raw.slice(0, 500),
    };
  }

  const token =
    res.headers.get("paymentrequesttoken") ?? res.headers.get("PaymentRequestToken") ?? null;

  await db.from("payments").insert({
    payment_ref: paymentRef,
    verification_ref: body?.verification_ref ?? null,
    store_id: body?.store_id ?? null,
    phone: body?.phone ?? null,
    amount: DEPOSIT_SEK,
    status: "CREATED",
    callback_identifier: callbackIdentifier,
  });

  return {
    ok: true,
    payment_id: paymentRef,
    payment_ref: paymentRef,
    token,
    swish_url: token ? `swish://paymentrequest?token=${token}&callbackurl=` : null,
    qr_url: null,
    status: "CREATED",
  };
}

/** POST/GET /payment-status */
// deno-lint-ignore no-explicit-any
export async function paymentStatus(db: SupabaseClient, body: any) {
  const ref = String(body?.payment_id ?? body?.payment_ref ?? "").toUpperCase();
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
    const res = await swishFetch(`${baseUrl()}/api/v1/paymentrequests/${ref}`);
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
        return { ok: true, status: fresh.status, error_code: fresh.errorCode ?? null };
      }
    } else {
      const raw = await res.text();
      console.error("swish status", res.status, swishErrorCode(raw) ?? "-", raw.slice(0, 400));
    }
  } catch (err) {
    console.error("swish status", String(err));
  }
  return { ok: true, status: row.status };
}

/** GET /swish-diagnose — form och handskakning, aldrig innehåll. */
export async function swishDiagnose() {
  const cert = pem("SWISH_CERT_PEM");
  const key = pem("SWISH_KEY_PEM");
  const info: Record<string, unknown> = {
    base_url: baseUrl(),
    payee_alias_set: !!Deno.env.get("SWISH_PAYEE_ALIAS"),
    cert_len: cert.length,
    cert_has_header: cert.includes("BEGIN CERTIFICATE"),
    cert_blocks: (cert.match(/BEGIN CERTIFICATE/g) ?? []).length,
    key_len: key.length,
    key_header: key.slice(0, 40).split("\n")[0],
    key_encrypted: key.includes("ENCRYPTED PRIVATE KEY"),
    ca_set: !!pem("SWISH_CA_PEM"),
  };
  try {
    const res = await swishFetch(`${baseUrl()}/api/v1/paymentrequests/DIAGNOSE0000000000000000000000000`);
    info.handshake = "ok";
    info.probe_status = res.status;
    info.probe_body = (await res.text()).slice(0, 200);
  } catch (err) {
    info.handshake = "failed";
    info.error = err instanceof Error ? err.message : String(err);
  }
  return { ok: true, ...info };
}

/** POST /swish-callback — svarar alltid 200 så Swish inte köar om i onödan. */
// deno-lint-ignore no-explicit-any
export async function swishCallback(db: SupabaseClient, payload: any, req: Request) {
  if (payload?.id) {
    const { data: row } = await db
      .from("payments")
      .select("callback_identifier")
      .eq("payment_ref", payload.id)
      .maybeSingle();
    const sent = req.headers.get("callbackidentifier") ?? payload.callbackIdentifier;
    if (row && typeof sent === "string" && sent.toUpperCase() === String(row.callback_identifier).toUpperCase()) {
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
