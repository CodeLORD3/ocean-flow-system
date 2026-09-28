/**
 * fortnox-supplier-invoice-sync — hämtar obetalda leverantörsfakturor till
 * fortnox_supplier_invoices och förfallodatum/saldo för obetalda kundfakturor
 * till fortnox_invoice_jobs (likviditetsvyn).
 *
 * pg_cron 02:30 och 03:30 UTC; bara körningen som motsvarar 04:30 Europe/Stockholm
 * gör jobbet. Samma strypning som ledger-synken: högst 3 anrop/s per bolag,
 * minst 10 s paus vid 429, 429 som lyckas vid omförsök loggas inte.
 */
import { adminClient, corsHeaders, fortnoxRequest, json, requireUser } from "../_shared/fortnox.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stockholmHour = () =>
  Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }).format(new Date()));

const MIN_GAP_MS = 334;
const nextAt = new Map<string, number>();
const hits429 = new Map<string, number>();

function opts(entity: string) {
  return {
    quiet429: true,
    beforeCall: async () => {
      const now = Date.now();
      const at = Math.max(now, nextAt.get(entity) ?? 0);
      nextAt.set(entity, at + MIN_GAP_MS);
      if (at > now) await sleep(at - now);
    },
    on429: async (attempt: number) => {
      hits429.set(entity, (hits429.get(entity) ?? 0) + 1);
      const pause = 10_000 * (attempt + 1);
      nextAt.set(entity, Math.max(nextAt.get(entity) ?? 0, Date.now() + pause));
      await sleep(pause);
    },
  };
}

async function listAll(sb: SupabaseClient, entity: string, path: string, key: string) {
  const out: any[] = [];
  for (let page = 1; page < 100; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fortnoxRequest<any>(sb, entity, "GET", `${path}${sep}limit=500&page=${page}`, undefined, opts(entity));
    out.push(...(res?.[key] ?? []));
    if (page >= Number(res?.MetaInformation?.["@TotalPages"] ?? 1)) break;
  }
  return out;
}

async function syncEntity(sb: SupabaseClient, entity: string, scopes: string[]) {
  const now = new Date().toISOString();
  const result: any = { entity };

  if (scopes.includes("supplierinvoice")) {
    const unpaid = [
      ...(await listAll(sb, entity, "/supplierinvoices?filter=unpaid", "SupplierInvoices")),
      ...(await listAll(sb, entity, "/supplierinvoices?filter=unbooked", "SupplierInvoices")),
    ];
    const rows = new Map<string, any>();
    for (const s of unpaid) {
      if (s.Cancelled) continue;
      rows.set(String(s.GivenNumber), {
        legal_entity_code: entity,
        given_number: String(s.GivenNumber),
        supplier_number: s.SupplierNumber ?? null,
        supplier_name: s.SupplierName ?? null,
        invoice_number: s.InvoiceNumber ?? null,
        invoice_date: s.InvoiceDate || null,
        due_date: s.DueDate || null,
        total: s.Total != null ? Number(s.Total) : null,
        balance: s.Balance != null ? Number(s.Balance) : null,
        currency: s.Currency ?? null,
        paid: Number(s.Balance ?? 0) === 0,
        cancelled: false,
        fetched_at: now,
      });
    }
    const list = [...rows.values()];
    for (let i = 0; i < list.length; i += 500) {
      const { error } = await sb.from("fortnox_supplier_invoices").upsert(list.slice(i, i + 500), { onConflict: "legal_entity_code,given_number" });
      if (error) throw new Error(error.message);
    }
    // Tidigare obetalda som inte längre finns i listan är betalda (eller makulerade).
    await sb.from("fortnox_supplier_invoices").update({ paid: true, balance: 0, fetched_at: now })
      .eq("legal_entity_code", entity).eq("paid", false).lt("fetched_at", now);
    result.supplier_unpaid = list.filter((r) => !r.paid).length;
  } else result.supplier_skipped = "scope supplierinvoice saknas";

  // Kundfakturor: förfallodatum och saldo till fortnox_invoice_jobs.
  const inv = [
    ...(await listAll(sb, entity, "/invoices?filter=unpaid", "Invoices")),
    ...(await listAll(sb, entity, "/invoices?filter=unbooked", "Invoices")),
  ];
  let updated = 0;
  for (const i of inv) {
    const { data } = await sb.from("fortnox_invoice_jobs").update({
      final_pay_date: i.DueDate || null,
      fortnox_balance: i.Balance != null ? Number(i.Balance) : null,
      fortnox_total: i.Total != null ? Number(i.Total) : null,
      status_synced_at: now,
    }).eq("legal_entity_code", entity).eq("fortnox_document_number", String(i.DocumentNumber)).select("id");
    updated += data?.length ?? 0;
  }
  result.customer_unpaid_in_fortnox = inv.length;
  result.customer_jobs_updated = updated;
  result.retried_429 = hits429.get(entity) ?? 0;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = adminClient();
  const isCron = req.headers.get("x-cron-secret") === Deno.env.get("FORTNOX_CRON_SECRET");
  if (!isCron) {
    const user = await requireUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);
  }
  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  if (isCron && body.force !== true && stockholmHour() !== 4) return json({ skipped: "inte 04:30 svensk tid" });

  const { data: conns } = await sb.from("fortnox_connections").select("legal_entity_code, scopes").eq("status", "connected");
  const report: any[] = [];
  for (const c of conns ?? []) {
    try { report.push(await syncEntity(sb, c.legal_entity_code, c.scopes ?? [])); }
    catch (e) { report.push({ entity: c.legal_entity_code, error: e instanceof Error ? e.message : String(e) }); }
  }
  return json({ ran_at: new Date().toISOString(), report });
});
