/**
 * fortnox_ledger_sync — hämtar räkenskapsår, verifikationer och räknar fram
 * periodsaldon per konto och kostnadsställe för varje kopplat bolag med bookkeeping.
 *
 * Körs av pg_cron 00:30 och 01:30 UTC; bara körningen som motsvarar 02:30
 * Europe/Stockholm gör jobbet (sommar-/vintertid). { force: true } kör direkt.
 * Inkrementellt: redan hämtade verifikationer hoppas över, ändrade sedan
 * senaste lyckade körning (lastmodified) hämtas om. Tidsbudget → partial, nästa körning fortsätter.
 */
import { adminClient, corsHeaders, fortnoxRequest, json, requireUser } from "../_shared/fortnox.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stockholmHour = () =>
  Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }).format(new Date()));

type Year = { Id: number; FromDate: string; ToDate: string };

async function listYears(sb: SupabaseClient, entity: string): Promise<Year[]> {
  const res = await fortnoxRequest<any>(sb, entity, "GET", "/financialyears");
  return (res?.FinancialYears ?? []) as Year[];
}

async function listVoucherHeads(sb: SupabaseClient, entity: string, yearId: number, lastModified?: string) {
  const heads: any[] = [];
  for (let page = 1; page < 200; page++) {
    const lm = lastModified ? `&lastmodified=${encodeURIComponent(lastModified)}` : "";
    const res = await fortnoxRequest<any>(sb, entity, "GET", `/vouchers?financialyear=${yearId}&limit=500&page=${page}${lm}`);
    heads.push(...(res?.Vouchers ?? []));
    const total = Number(res?.MetaInformation?.["@TotalPages"] ?? 1);
    if (page >= total) break;
    await sleep(250);
  }
  return heads;
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
  const force = body.force === true || !isCron;
  // Återupptagning (cron var 10:e minut): kör bara om något bolag har en ofullständig hämtning.
  if (body.resume === true) {
    const { data: st } = await sb.from("fortnox_ledger_sync_state").select("details, last_run_at");
    const pending = (st ?? []).some((r: any) => r.details?.partial === true || r.details?.pending === true);
    const busy = (st ?? []).some((r: any) => r.last_run_at && Date.now() - new Date(r.last_run_at).getTime() < 4 * 60_000);
    if (!pending) return json({ skipped: "inget kvar att hämta" });
    if (busy) return json({ skipped: "kedjan kör redan" });
  } else if (!force && stockholmHour() !== 2) return json({ skipped: "inte 02:30 svensk tid" });

  // Arbetet körs i bakgrunden så att anroparen (cron eller föregående omgång) kan koppla ner direkt.
  const work = runSync(sb, body);
  // @ts-ignore EdgeRuntime finns i Supabase edge runtime
  if (typeof EdgeRuntime !== "undefined") { EdgeRuntime.waitUntil(work); return json({ accepted: true }, 202); }
  return json(await work);
});

async function runSync(sb: SupabaseClient, body: any) {
  const yearsBack = Math.min(Math.max(Number(body.years ?? 2), 1), 5); // innevarande + föregående
  const startedMs = Date.now();
  const budgetMs = Math.min(Number(body.budget_ms ?? 110_000), 120_000);
  const outOfTime = () => Date.now() - startedMs > budgetMs;

  const { data: conns } = await sb.from("fortnox_connections")
    .select("legal_entity_code, scopes").eq("status", "connected");
  const { data: states } = await sb.from("fortnox_ledger_sync_state").select("legal_entity_code, last_run_at");
  const lastRun = new Map((states ?? []).map((r: any) => [r.legal_entity_code, r.last_run_at ?? ""]));
  const entities = (conns ?? [])
    .filter((c: any) => (c.scopes ?? []).includes("bookkeeping"))
    .map((c: any) => c.legal_entity_code as string)
    .filter((e) => !body.entity || e === body.entity)
    // Bolaget som väntat längst först, så ett stort bolag inte svälter det andra.
    .sort((a, b) => String(lastRun.get(a) ?? "").localeCompare(String(lastRun.get(b) ?? "")));

  const report: any[] = [];

  for (const entity of entities) {
    const runAt = new Date().toISOString();
    const { data: state } = await sb.from("fortnox_ledger_sync_state").select("*").eq("legal_entity_code", entity).maybeSingle();
    let fetchedNow = 0, balanceRows = 0, partial = false;
    const perYear: any[] = [];
    try {
      const years = (await listYears(sb, entity))
        .filter((y) => y.FromDate <= new Date().toISOString().slice(0, 10))
        .sort((a, b) => b.FromDate.localeCompare(a.FromDate))
        .slice(0, yearsBack);

      for (const y of years) {
        if (outOfTime()) { partial = true; perYear.push({ financial_year: Number(y.FromDate.slice(0, 4)), fortnox_id: y.Id, not_started: true }); continue; }
        const fy = Number(y.FromDate.slice(0, 4));
        const heads = await listVoucherHeads(sb, entity, y.Id);

        // Hämtas sidvis: API:t returnerar högst 1 000 rader per anrop, annars hämtas redan sparade verifikationer om.
        const seen = new Set<string>();
        for (let from = 0; ; from += 1000) {
          const { data: have, error: haveErr } = await sb.from("fortnox_vouchers")
            .select("voucher_series, voucher_number").eq("legal_entity_code", entity).eq("financial_year", fy)
            .order("id").range(from, from + 999);
          if (haveErr) throw new Error(haveErr.message);
          for (const v of have ?? []) seen.add(`${v.voucher_series}-${v.voucher_number}`);
          if (!have || have.length < 1000) break;
        }

        // Ändrade sedan senaste lyckade körning hämtas om.
        const changed = new Set<string>();
        if (state?.last_success_at) {
          const lm = new Date(state.last_success_at).toISOString().slice(0, 19).replace("T", " ");
          for (const h of await listVoucherHeads(sb, entity, y.Id, lm)) changed.add(`${h.VoucherSeries}-${h.VoucherNumber}`);
        }
        const todo = heads.filter((h) => {
          const k = `${h.VoucherSeries}-${h.VoucherNumber}`;
          return !seen.has(k) || changed.has(k);
        });

        let yearFetched = 0;
        // Fortnox tillåter 25 anrop / 5 s: 4 parallella hämtningar per ~0,9 s.
        const fetchOne = async (h: any) => {
          const d = await fortnoxRequest<any>(sb, entity, "GET",
            `/vouchers/${encodeURIComponent(h.VoucherSeries)}/${h.VoucherNumber}?financialyear=${y.Id}`);
          const v = d?.Voucher ?? h;
          const rows = (v.VoucherRows ?? []) as any[];
          const centers = [...new Set(rows.map((r) => r.CostCenter).filter(Boolean))];
          return {
            legal_entity_code: entity,
            financial_year: fy,
            voucher_series: String(v.VoucherSeries),
            voucher_number: Number(v.VoucherNumber),
            transaction_date: v.TransactionDate || null,
            description: v.Description ?? null,
            cost_center: v.CostCenter || (centers.length === 1 ? centers[0] : null),
            rows,
            fetched_at: new Date().toISOString(),
          };
        };
        for (let i = 0; i < todo.length; i += 4) {
          if (outOfTime()) { partial = true; break; }
          const t0 = Date.now();
          const batch = await Promise.all(todo.slice(i, i + 4).map(fetchOne));
          const { error } = await sb.from("fortnox_vouchers")
            .upsert(batch, { onConflict: "legal_entity_code,financial_year,voucher_series,voucher_number" });
          if (error) throw new Error(error.message);
          yearFetched += batch.length; fetchedNow += batch.length;
          const wait = 900 - (Date.now() - t0);
          if (wait > 0) await sleep(wait);
        }

        const { data: n, error: balErr } = await sb.rpc("fortnox_rebuild_balances", { p_entity: entity, p_year: fy });
        if (balErr) throw new Error(balErr.message);
        balanceRows += Number(n ?? 0);
        perYear.push({ financial_year: fy, fortnox_id: y.Id, in_fortnox: heads.length, fetched_now: yearFetched, remaining: todo.length - yearFetched, balance_rows: n });
      }

      const { data: last } = await sb.from("fortnox_vouchers").select("transaction_date")
        .eq("legal_entity_code", entity).order("transaction_date", { ascending: false }).limit(1);
      const { count } = await sb.from("fortnox_vouchers").select("id", { count: "exact", head: true }).eq("legal_entity_code", entity);

      await sb.from("fortnox_ledger_sync_state").upsert({
        legal_entity_code: entity,
        last_run_at: runAt,
        last_success_at: partial ? state?.last_success_at ?? null : runAt,
        last_voucher_date: last?.[0]?.transaction_date ?? null,
        vouchers_fetched: fetchedNow,
        balance_rows: balanceRows,
        last_error: partial ? "Tidsbudget slut – fortsätter nästa körning" : null,
        details: { partial, years: perYear, vouchers_total: count },
        updated_at: new Date().toISOString(),
      });
      report.push({ entity, partial, vouchers_total: count, fetched_now: fetchedNow, balance_rows: balanceRows, years: perYear });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("fortnox_ledger_sync_state").upsert({
        legal_entity_code: entity, last_run_at: runAt, last_error: msg,
        vouchers_fetched: fetchedNow, details: { years: perYear }, updated_at: new Date().toISOString(),
      });
      report.push({ entity, error: msg, fetched_now: fetchedNow, years: perYear });
    }
    if (outOfTime()) break;
  }

  // Ofullständig körning (stor historik) → starta nästa omgång direkt, högst 200 kedjade omgångar.
  const depth = Number(body.chain_depth ?? 0);
  const unfinished = report.some((r) => r.partial) || entities.length > report.length;
  if (unfinished && depth < 1000 && body.chain !== false) {
    // Nästa omgång startas direkt; misslyckas anropet tar återupptagnings-cronen över inom 10 minuter.
    for (let attempt = 0; attempt < 3; attempt++) {
      const ok = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/fortnox-ledger-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("FORTNOX_CRON_SECRET") ?? "" },
        body: JSON.stringify({ ...body, resume: false, force: true, chain_depth: depth + 1 }),
      }).then(async (r) => { await r.body?.cancel(); return r.status < 300; }).catch(() => false);
      if (ok) break;
      await sleep(2000 * (attempt + 1));
    }
  }

  return { ran_at: new Date().toISOString(), chain_depth: depth, report };
}
