// Automatiska e-postrapporter för de svenska butikerna.
// Lägen: cron (varje timme, funktionen avgör själv svensk tid/veckodag),
// preview (admin, skickar inget), test (admin, testmejl), send (admin, kör om
// en misslyckad riktig rapport). Alla siffror räknas här i koden; AI skriver
// bara analystexten utifrån färdiga siffror och får misslyckas.
import { sendSmtp, SmtpError } from "./smtp.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { buildBlocks, mondayOf } from "./blocks.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const TZ = "Europe/Stockholm";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type RType = "daglig" | "lordag" | "sondag";

// ---------- tid ----------
function stockholmNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false, weekday: "short" })
      .formatToParts(new Date()).map((x) => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = söndag
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
};
const svDate = (s: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date(s));
const typeFor = (d: string): RType => (dow(d) === 6 ? "lordag" : dow(d) === 0 ? "sondag" : "daglig");
function range(from: string, to: string) { const o: string[] = []; for (let d = from; d <= to; d = addDays(d, 1)) o.push(d); return o; }
const WD = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

// ---------- format ----------
const grp = (n: number, dec = 0) => {
  const [i, f] = Math.abs(n).toFixed(dec).split(".");
  return (n < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (f ? "," + f : "");
};
const kr = (n: number | null | undefined) => (n == null ? "—" : `${grp(n)} kr`);
const num = (n: number | null | undefined, dec = 0) => (n == null ? "—" : grp(n, dec));
const pct = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${grp(n, 1)} %`);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const change = (a: number | null, b: number | null) => (a == null || b == null || b === 0 ? null : ((a - b) / b) * 100);

// ---------- data ----------
type Store = { id: string; name: string };
type Day = {
  store: Store; date: string; open: boolean; report: any | null;
  net: number | null; gross: number | null; receipts: number | null; hours: number | null; hoursSource: string;
};

async function loadStores(): Promise<Store[]> {
  const { data, error } = await db.from("stores").select("id,name,unit_type,is_wholesale,region,active")
    .eq("active", true).eq("is_wholesale", false).in("region", ["vast", "stockholm"]).order("name");
  if (error) throw error;
  const nonSales = ["produktion", "admin", "overhead", "grossist"];
  return (data ?? []).filter((s: any) => !nonSales.includes(String(s.unit_type ?? "butik"))).map((s: any) => ({ id: s.id, name: s.name }));
}

function entryHours(entries: any[]): number {
  return (entries ?? []).reduce((sum, e) => {
    const [sh, sm] = String(e?.start ?? "").split(":").map(Number);
    const [eh, em] = String(e?.end ?? "").split(":").map(Number);
    if ([sh, sm, eh, em].some((v) => Number.isNaN(v))) return sum;
    let m = eh * 60 + em - (sh * 60 + sm); if (m < 0) m += 1440;
    return sum + m / 60;
  }, 0);
}

async function loadDays(stores: Store[], from: string, to: string): Promise<Day[]> {
  const ids = stores.map((s) => s.id);
  const [rep, oh, cd, sd, pk] = await Promise.all([
    db.from("daily_reports").select("*").in("store_id", ids).gte("report_date", from).lte("report_date", to),
    db.from("store_opening_hours").select("store_id,weekday,open_time,close_time,closed").in("store_id", ids),
    db.from("store_closed_days").select("store_id,date").in("store_id", ids).gte("date", from).lte("date", to),
    db.from("store_special_days").select("store_id,day,closed").in("store_id", ids).gte("day", from).lte("day", to),
    db.from("pk_logged_times_effective").select("effective_store_id,work_date,hours,work_time_sec,is_canceled")
      .in("effective_store_id", ids).gte("work_date", from).lte("work_date", to).limit(20000),
  ]);
  for (const r of [rep, oh, cd, sd, pk]) if (r.error) throw r.error;
  const pkHours = new Map<string, number>();
  for (const r of pk.data ?? []) {
    if (r.is_canceled) continue;
    const h = r.hours != null ? Number(r.hours) : Number(r.work_time_sec ?? 0) / 3600;
    const k = `${r.effective_store_id}|${r.work_date}`;
    pkHours.set(k, (pkHours.get(k) ?? 0) + h);
  }
  const out: Day[] = [];
  for (const s of stores) {
    const hours = (oh.data ?? []).filter((h: any) => h.store_id === s.id);
    for (const d of range(from, to)) {
      const special = (sd.data ?? []).find((x: any) => x.store_id === s.id && x.day === d);
      let open: boolean;
      if (special) open = !special.closed;
      else if ((cd.data ?? []).some((x: any) => x.store_id === s.id && x.date === d)) open = false;
      else {
        const w = hours.find((h: any) => h.weekday === dow(d));
        open = hours.length === 0 ? true : !!w && !w.closed && !!w.open_time && !!w.close_time;
      }
      const report = (rep.data ?? []).find((r: any) => r.store_id === s.id && r.report_date === d) ?? null;
      const pkH = pkHours.get(`${s.id}|${d}`);
      let h: number | null = null, src = "";
      if (pkH && pkH > 0) { h = pkH; src = "Personalkollen"; }
      else if (report && entryHours(report.staff_entries) > 0) { h = entryHours(report.staff_entries); src = "dagsrapport"; }
      out.push({
        store: s, date: d, open: open || !!report, report,
        net: report?.net_sales != null ? Number(report.net_sales) : null,
        gross: report?.gross_sales != null ? Number(report.gross_sales) : null,
        receipts: report?.receipt_count != null ? Number(report.receipt_count) : null,
        hours: h, hoursSource: src,
      });
    }
  }
  return out;
}

const sum = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
const div = (a: number | null, b: number | null) => (a == null || !b ? null : a / b);

function payments(r: any): string {
  const p = r?.pos_payments;
  const parts: string[] = [];
  if (Array.isArray(p)) for (const x of p) {
    const name = x?.method ?? x?.type ?? x?.name; const amt = Number(x?.amount ?? x?.total ?? x?.sum);
    if (name && !Number.isNaN(amt)) parts.push(`${esc(name)} ${kr(amt)}`);
  } else if (p && typeof p === "object") for (const [k, v] of Object.entries(p)) {
    const amt = Number(v); if (!Number.isNaN(amt) && amt) parts.push(`${esc(k)} ${kr(amt)}`);
  }
  return parts.length ? parts.join("<br>") : "—";
}
function waste(r: any): string {
  const w = Array.isArray(r?.waste_items) ? r.waste_items : [];
  if (!w.length) return "—";
  return w.map((x: any) => `${esc(x.item)}${x.weight_kg != null ? ` ${num(Number(x.weight_kg), 1)} kg` : ""}${x.value_sek != null ? ` (${kr(Number(x.value_sek))})` : ""}${x.reason ? ` – ${esc(x.reason)}` : ""}`).join("<br>");
}

// ---------- HTML ----------
const C = { ink: "#1f2a33", muted: "#5b6b77", line: "#dde3e8", head: "#1f4d6b", warn: "#a4461f", bg: "#f4f7f8" };
const th = `style="text-align:left;padding:6px 8px;border-bottom:2px solid ${C.head};font-size:12px;color:${C.head};font-weight:600"`;
const thr = th.replace("text-align:left", "text-align:right");
const td = `style="padding:6px 8px;border-bottom:1px solid ${C.line};font-size:13px;vertical-align:top"`;
const tdr = `style="padding:6px 8px;border-bottom:1px solid ${C.line};font-size:13px;text-align:right;white-space:nowrap;vertical-align:top;font-family:Menlo,Consolas,monospace"`;
const h2 = (t: string) => `<h2 style="font-size:18px;color:${C.head};margin:28px 0 8px">${t}</h2>`;
const h3 = (t: string) => `<h3 style="font-size:15px;color:${C.ink};margin:18px 0 6px">${t}</h3>`;
const table = (head: string, rows: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%">${head}${rows}</table>`;
const kpi = (items: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse"><tr>${items.map(([l, v]) =>
    `<td style="padding:10px;background:${C.bg};border:1px solid ${C.line}"><div style="font-size:11px;color:${C.muted}">${l}</div><div style="font-size:16px;font-weight:600;font-family:Menlo,Consolas,monospace">${v}</div></td>`).join("")}</tr></table>`;
const box = (inner: string, color = C.warn) =>
  `<div style="border-left:4px solid ${color};background:#fbf3ef;padding:10px 12px;margin:8px 0;font-size:13px">${inner}</div>`;

function dailyPart(date: string, days: Day[], prev: Day[], blocks: string, blocksTitle: string) {
  const today = days.filter((d) => d.date === date);
  const open = today.filter((d) => d.open);
  const missing = open.filter((d) => !d.report);
  const closed = today.filter((d) => !d.open);
  const reported = today.filter((d) => d.report);
  const tNet = sum(reported.map((d) => d.net)), tGross = sum(reported.map((d) => d.gross)), tRec = sum(reported.map((d) => d.receipts));
  const tHours = sum(reported.map((d) => d.hours));
  const prevDate = addDays(date, -7);
  const pFor = (id: string) => prev.find((p) => p.store.id === id && p.date === prevDate);
  const pNet = sum(reported.map((d) => pFor(d.store.id)?.net ?? null));
  const devs: string[] = [];
  let html = h2(`Del A – Dagsrapport ${WD[dow(date)]} ${date}`);
  html += missing.length
    ? box(`<b>Saknar rapport (${missing.length}):</b> ${missing.map((d) => esc(d.store.name)).join(", ")}`)
    : box("Alla öppna butiker har lämnat dagsrapport.", "#2f6b4f").replace("#fbf3ef", "#eef6f1");
  if (closed.length) html += `<p style="font-size:13px;color:${C.muted}">Stängt: ${closed.map((d) => esc(d.store.name)).join(", ")}</p>`;
  html += h3("Överblick");
  html += kpi([
    ["Netto", kr(tNet)], ["Brutto", kr(tGross)], ["Kvitton", num(tRec)], ["Snittkvitto (netto)", kr(div(tNet, tRec))],
    ["Personaltimmar", num(tHours, 1)], ["Netto / timme", kr(div(tNet, tHours))],
    [`Mot ${prevDate} (samma butiker)`, pct(change(tNet, pNet))],
  ]);
  if (missing.length) html += `<p style="font-size:12px;color:${C.warn}">Summan är ofullständig – ${missing.length} butik(er) saknar rapport och har inte uppskattats.</p>`;
  html += h3(blocksTitle) + blocks;
  const comments: string[] = [];
  const rows = today.map((d) => {
    const r = d.report; const p = pFor(d.store.id); const ch = change(d.net, p?.net ?? null);
    if (r) {
      if (ch != null && Math.abs(ch) >= 25) devs.push(`${esc(d.store.name)}: netto ${pct(ch)} mot förra ${WD[dow(date)]}en (${kr(d.net)} mot ${kr(p?.net)}).`);
      if (d.net == null) devs.push(`${esc(d.store.name)}: netto saknas.`);
      if (d.receipts == null) devs.push(`${esc(d.store.name)}: antal kvitton saknas.`);
      if (r.created_at && svDate(r.created_at) > date) devs.push(`${esc(d.store.name)}: rapporten lades in i efterhand (${svDate(r.created_at)}).`);
    }
    const status = !d.open ? "Stängt" : !r ? `<b style="color:${C.warn}">Saknar rapport</b>` : "";
    if (!r) return `<tr><td ${td}><b>${esc(d.store.name)}</b></td><td ${td} colspan="10">${status}</td></tr>`;
    const comment = [r.comment, r.staff_notes].filter(Boolean).map(esc).join("<br>") || "—";
    if (comment !== "—") comments.push(`<b>${esc(d.store.name)}:</b> ${comment}`);
    return `<tr><td ${td}><b>${esc(d.store.name)}</b></td><td ${tdr}>${kr(d.net)}</td><td ${tdr}>${kr(d.gross)}</td><td ${tdr}>${num(d.receipts)}</td><td ${tdr}>${kr(div(d.gross, d.receipts))}</td><td ${tdr}>${kr(r.largest_sale != null ? Number(r.largest_sale) : null)}</td><td ${td}>${payments(r)}</td><td ${tdr}>${num(d.hours, 1)}${d.hoursSource === "dagsrapport" ? "*" : ""}</td><td ${tdr}>${kr(div(d.net, d.hours))}</td><td ${tdr}>${pct(ch)}</td><td ${td}>${waste(r)}</td></tr>${comment !== "—" ? `<tr><td ${td}></td><td ${td} colspan="10" style="padding:4px 8px 10px;font-size:12px;color:${C.muted};border-bottom:1px solid ${C.line}">Kommentar: ${comment}</td></tr>` : ""}`;
  }).join("");
  void rows;
  html += h3("Avvikelser");
  html += devs.length ? `<ul style="font-size:13px;margin:4px 0 0 18px;padding:0">${devs.map((x) => `<li>${x}</li>`).join("")}</ul>` : `<p style="font-size:13px">Inga avvikelser.</p>`;
  if (comments.length) html += h3("Kommentarer från dagsrapporterna") + `<ul style="font-size:13px;margin:4px 0 0 18px;padding:0">${comments.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  return { html, expected: open.length, reported: reported.length, missing: missing.map((d) => d.store.name) };
}

type StoreAgg = { name: string; net: number | null; gross: number | null; rec: number | null; hours: number | null; rep: number; exp: number; incomplete: number; pNet: number | null; pHours: number | null };
function agg(stores: Store[], days: Day[], prev: Day[]): StoreAgg[] {
  return stores.map((s) => {
    const d = days.filter((x) => x.store.id === s.id); const p = prev.filter((x) => x.store.id === s.id && x.report);
    const r = d.filter((x) => x.report);
    return {
      name: s.name, net: sum(r.map((x) => x.net)), gross: sum(r.map((x) => x.gross)), rec: sum(r.map((x) => x.receipts)),
      hours: sum(r.map((x) => x.hours)), rep: r.length, exp: d.filter((x) => x.open).length,
      incomplete: r.filter((x) => x.net == null || x.receipts == null).length,
      pNet: sum(p.map((x) => x.net)), pHours: sum(p.map((x) => x.hours)),
    };
  });
}

function weeklyPart(from: string, to: string, a: StoreAgg[], analysis: string | null, blocks: string) {
  const T = { net: sum(a.map((x) => x.net)), gross: sum(a.map((x) => x.gross)), rec: sum(a.map((x) => x.rec)), hours: sum(a.map((x) => x.hours)), pNet: sum(a.map((x) => x.pNet)), rep: a.reduce((s, x) => s + x.rep, 0), exp: a.reduce((s, x) => s + x.exp, 0) };
  let html = h2(`Del B – Veckosammanfattning ${from} – ${to}`);
  html += blocks;
  if (T.rep < T.exp) html += `<p style="font-size:12px;color:${C.warn}">Summan är ofullständig – ${T.exp - T.rep} öppna butiksdag(ar) saknar rapport. Inget har uppskattats.</p>`;
  html += h3("Jämförelse mot förra veckan");
  html += table(`<tr><th ${th}>Butik</th><th ${thr}>Netto</th><th ${thr}>Brutto</th><th ${thr}>Kvitton</th><th ${thr}>Timmar</th><th ${thr}>Netto/tim</th><th ${thr}>Dagar</th><th ${thr}>Förra v. netto</th><th ${thr}>Förändring</th></tr>`,
    a.map((x) => `<tr><td ${td}><b>${esc(x.name)}</b></td><td ${tdr}>${kr(x.net)}</td><td ${tdr}>${kr(x.gross)}</td><td ${tdr}>${num(x.rec)}</td><td ${tdr}>${num(x.hours, 1)}</td><td ${tdr}>${kr(div(x.net, x.hours))}</td><td ${tdr}${x.rep < x.exp ? ` style="color:${C.warn}"` : ""}>${x.rep} / ${x.exp}</td><td ${tdr}>${kr(x.pNet)}</td><td ${tdr}>${pct(change(x.net, x.pNet))}</td></tr>`).join("")
    + `<tr><td ${td}><b>Totalt</b></td><td ${tdr}><b>${kr(T.net)}</b></td><td ${tdr}><b>${kr(T.gross)}</b></td><td ${tdr}><b>${num(T.rec)}</b></td><td ${tdr}><b>${num(T.hours, 1)}</b></td><td ${tdr}><b>${kr(div(T.net, T.hours))}</b></td><td ${tdr}><b>${T.rep} / ${T.exp}</b></td><td ${tdr}><b>${kr(T.pNet)}</b></td><td ${tdr}><b>${pct(change(T.net, T.pNet))}</b></td></tr>`);
  html += `<p style="font-size:11px;color:${C.muted}">Jämförelse mot samma veckodagar förra veckan.</p>`;
  const rank = (label: string, val: (x: StoreAgg) => number | null, fmt: (n: number) => string) => {
    const v = a.map((x) => ({ n: x.name, v: val(x) })).filter((x) => x.v != null).sort((p, q) => q.v! - p.v!);
    if (!v.length) return `<li>${label}: underlag saknas</li>`;
    return `<li>${label}: bäst <b>${esc(v[0].n)}</b> (${fmt(v[0].v!)}), sämst <b>${esc(v[v.length - 1].n)}</b> (${fmt(v[v.length - 1].v!)})</li>`;
  };
  html += h3("Ranking");
  html += `<ul style="font-size:13px;margin:4px 0 0 18px;padding:0">${rank("Netto", (x) => x.net, kr)}${rank("Tillväxt", (x) => change(x.net, x.pNet), pct)}${rank("Netto per timme", (x) => div(x.net, x.hours), kr)}</ul>`;
  html += h3("Datakvalitet");
  const dq = a.filter((x) => x.rep < x.exp || x.incomplete).map((x) => `<li>${esc(x.name)}: ${x.rep < x.exp ? `${x.exp - x.rep} saknad(e) dag(ar)` : ""}${x.rep < x.exp && x.incomplete ? ", " : ""}${x.incomplete ? `${x.incomplete} ofullständig(a) rapport(er)` : ""}</li>`);
  html += dq.length ? `<ul style="font-size:13px;margin:4px 0 0 18px;padding:0">${dq.join("")}</ul>` : `<p style="font-size:13px">Alla förväntade dagar är rapporterade och kompletta.</p>`;
  if (analysis) {
    html += h2("Analys");
    html += `<div style="border:1px dashed ${C.head};padding:10px 12px;font-size:13px;line-height:1.5">${esc(analysis).replace(/\n/g, "<br>")}<p style="font-size:11px;color:${C.muted};margin:8px 0 0">Analysen är AI-skriven utifrån siffrorna ovan. Tabellerna är fakta.</p></div>`;
  }
  return { html, totals: T };
}

async function aiAnalysis(input: unknown): Promise<string | null> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return null;
  try {
    const r = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
      method: "POST",
      headers: { "Lovable-API-Key": key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({
        model: "openai/gpt-6-astra", stream: true, store: false, reasoning: { effort: "low" },
        instructions: "Du skriver en kort analys (högst 8 meningar plus 2–4 punkter att följa upp) på svenska av en veckosammanfattning för fiskbutiker. Använd ENDAST siffrorna i underlaget. Räkna inte om, hitta inte på siffror, orsaker eller händelser. Saknade dagar är saknade, uppskatta dem aldrig. Om underlaget är ofullständigt, säg det. Ingen markdown, bara text och rader som börjar med '- '.",
        input: JSON.stringify(input),
      }),
    });
    if (!r.ok || !r.body) { console.error("AI", r.status, await r.text().catch(() => "")); return null; }
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "", out = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const p = line.slice(5).trim();
        if (p === "[DONE]") continue;
        try {
          const ev = JSON.parse(p);
          if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
          else if (ev.type === "response.failed" || ev.type === "error") return null;
        } catch { /* hoppa */ }
      }
    }
    return out.trim() || null;
  } catch (e) { console.error("AI fel", e); return null; }
}

async function build(date: string, type: RType) {
  const stores = await loadStores();
  const from = mondayOf(date);
  const days = await loadDays(stores, from, date);
  const prev = await loadDays(stores, addDays(from, -7), addDays(date, -7));
  let facts: unknown = null;
  const checks: string[] = [];
  let body: string;
  let A;
  if (type === "daglig") {
    const bl = await buildBlocks(db, from, date, date);
    facts = bl.facts; checks.push(...bl.checks);
    A = dailyPart(date, days, prev, bl.html, `Veckan hittills ${from} – ${date} (dagens rad markerad)`);
    body = A.html;
  } else {
    const day = await buildBlocks(db, date, date, date);
    checks.push(...day.checks);
    A = dailyPart(date, days, prev, day.html, `${WD[dow(date)][0].toUpperCase()}${WD[dow(date)].slice(1)}ens rad`);
    body = A.html;
    const wk = await buildBlocks(db, from, date, null);
    facts = wk.facts; checks.push(...wk.checks);
    const a = agg(stores, days, prev);
    const analysis = await aiAnalysis({ period: `${from}–${date}`, jamforelse: "samma veckodagar förra veckan", block: wk.facts, butiker: a.map((x) => ({ butik: x.name, netto: x.net, brutto: x.gross, kvitton: x.rec, timmar: x.hours, rapporterade_dagar: x.rep, forvantade_dagar: x.exp, ofullstandiga: x.incomplete, netto_forra_veckan: x.pNet })) });
    body += weeklyPart(from, date, a, analysis, wk.html).html;
  }
  const subject = type === "daglig" ? `Dagsrapport Makrill Trade – ${date}` : `Dagsrapport och veckosammanfattning Makrill Trade – ${date}`;
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:#ffffff;color:${C.ink};font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:16px"><table role="presentation" width="760" cellpadding="0" cellspacing="0" border="0" style="max-width:760px;width:100%"><tr><td><h1 style="font-size:20px;margin:0 0 4px;color:${C.head}">${esc(subject)}</h1><p style="margin:0;font-size:12px;color:${C.muted}">Svenska butiker (${stores.length} st). Belopp i SEK.</p>${body}<p style="font-size:11px;color:${C.muted};margin-top:28px">Automatiskt utskick från Makrill.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, expected: A.expected, reported: A.reported, missing: A.missing, facts, checks: [...new Set(checks)] };
}

async function run(date: string, type: RType, isTest: boolean) {
  const { data: settings } = await db.from("report_email_settings").select("*").eq("id", true).maybeSingle();
  const recipients: string[] = settings?.recipients ?? [];
  if (!isTest) {
    const { data: done } = await db.from("report_email_runs").select("id").eq("report_type", type).eq("report_date", date).eq("status", "lyckad").eq("is_test", false).maybeSingle();
    if (done) {
      await db.from("report_email_runs").insert({ report_type: type, report_date: date, status: "hoppad", error: "Redan skickad", finished_at: new Date().toISOString() });
      return { status: "hoppad" };
    }
  }
  const { data: runRow, error: insErr } = await db.from("report_email_runs").insert({ report_type: type, report_date: date, is_test: isTest, recipients }).select("id").single();
  if (insErr) throw insErr;
  const upd = (p: Record<string, unknown>) => db.from("report_email_runs").update({ ...p, finished_at: new Date().toISOString() }).eq("id", runRow.id);
  // Mejlet stoppas aldrig: vid fel räknas allt om från källdata en gång till; kvarstår felet
  // skickas rapporten ändå med en gul kontrollruta överst och felet loggas.
  let rep: any;
  let buildErr: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { rep = await build(date, type); buildErr = null; } catch (e) { buildErr = String((e as Error)?.message ?? e); continue; }
    if (!rep.checks.length) break;
  }
  if (!rep) {
    const subject = type === "daglig" ? `Dagsrapport Makrill Trade – ${date}` : `Dagsrapport och veckosammanfattning Makrill Trade – ${date}`;
    rep = { subject, html: `<!doctype html><html lang="sv"><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif"><h1 style="font-size:20px">${esc(subject)}</h1></body></html>`, facts: null, expected: null, reported: null, missing: null, checks: [`rapporten kunde inte räknas fram (${buildErr})`] };
  }
  const checkList: string[] = rep.checks ?? [];
  if (checkList.length) {
    const box = `<div style="background:#fff4c2;border:1px solid #e0b400;color:#5a4500;padding:10px 12px;margin:0 0 12px;font-size:13px"><strong>Kontroll: ${checkList.length === 1 ? "1 sak" : `${checkList.length} saker`} stämmer inte – siffran är preliminär.</strong><ul style="margin:6px 0 0 18px;padding:0">${checkList.map((c) => `<li>${esc(c)}</li>`).join("")}</ul><div style="margin-top:6px">Rättade siffror visas med markeringen "rättad" i nästa mejl.</div></div>`;
    rep.html = rep.html.replace("<h1", box + "<h1");
  }
  const checkNote = checkList.length ? `kontroll: ${checkList.join(" | ")}`.slice(0, 2000) : null;
  const base = { html: rep.html, facts: rep.facts, stores_expected: rep.expected, stores_reported: rep.reported, missing_stores: rep.missing, ...(checkNote ? { error: checkNote, error_stage: "kontroll (skickad ändå)" } : {}) };
  // Utskick via Loopia SMTP (port 465, implicit TLS). From = inloggat konto.
  const password = Deno.env.get("LOOPIA_SMTP_PASSWORD");
  const host = settings?.smtp_host; const port = Number(settings?.smtp_port ?? 465); const user = settings?.smtp_user;
  if (!password || !host || !user) { await upd({ ...base, status: "ej_skickad", error: "ej skickad – e-post ej konfigurerad" }); return { status: "ej_skickad" }; }
  if (!recipients.length) { await upd({ ...base, status: "ej_skickad", error: "Inga mottagare" }); return { status: "ej_skickad" }; }
  try {
    const b64 = (s: string) => { const by = new TextEncoder().encode(s); let o = ""; for (let i = 0; i < by.length; i += 8192) o += String.fromCharCode(...by.subarray(i, i + 8192)); return btoa(o); };
    const hdr = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);
    const subject = (isTest ? "TEST – " : "") + rep.subject;
    const msgId = `<${crypto.randomUUID()}@fiskskaldjur.se>`;
    const mime = [
      `From: ${hdr(settings?.sender_name ?? "Makrill Trade")} <${user}>`,
      `To: ${recipients.join(", ")}`,
      `Subject: ${hdr(subject)}`,
      `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
      `Message-ID: ${msgId}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64(rep.html).replace(/.{76}/g, "$&\r\n"),
    ].join("\r\n");
    await sendSmtp({ host, port, user, password, from: user, to: recipients, data: mime });
    const { error } = await upd({ ...base, status: "lyckad", resend_message_id: msgId });
    if (error) await upd({ ...base, status: "hoppad", error: "Redan skickad (dubblettskydd)", resend_message_id: msgId });
    return { status: "lyckad" };
  } catch (e) {
    const stage = e instanceof SmtpError ? `utskick (${e.stage})` : "utskick";
    const msg = String((e as Error)?.message ?? e).split(password).join("***");
    console.error(`SMTP ${stage}: ${msg}`);
    await upd({ ...base, status: "misslyckad", error_stage: stage, error: msg.slice(0, 800) });
    return { status: "misslyckad" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  const mode = String(body.mode ?? "");
  try {
    if (mode === "cron") {
      const { data: s } = await db.from("report_email_settings").select("enabled").eq("id", true).maybeSingle();
      if (!s?.enabled) return json({ ok: true, skipped: "schemat avstängt" });
      const now = stockholmNow(); const d = dow(now.date);
      const due = (d >= 2 && d <= 5 && now.hour === 19) || ((d === 6 || d === 0) && now.hour === 17);
      if (!due) return json({ ok: true, skipped: "inte dags" });
      return json(await run(now.date, typeFor(now.date), false));
    }
    if (mode === "smtp-probe-tmp") { const { data: st } = await db.from("report_email_settings").select("smtp_host,smtp_port,smtp_user").eq("id", true).maybeSingle(); try { const r = await sendSmtp({ host: st?.smtp_host, port: Number(st?.smtp_port ?? 465), user: st?.smtp_user, password: Deno.env.get("LOOPIA_SMTP_PASSWORD") ?? "", from: st?.smtp_user, to: [], data: "", probeOnly: true }); return json({ ok: true, steps: r.steps }); } catch (e) { return json({ ok: false, stage: (e as any)?.stage, error: String((e as Error)?.message ?? e) }); } } // TILLFÄLLIG
    // Admin-lägen
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Inte inloggad" }, 401);
    const { data: u } = await db.auth.getUser(auth.slice(7));
    const uid = u.user?.id;
    if (!uid) return json({ error: "Inte inloggad" }, 401);
    const [{ data: a1 }, { data: a2 }] = await Promise.all([
      db.rpc("has_role", { _user_id: uid, _role: "admin" }), db.rpc("is_platform_admin", { _user_id: uid }),
    ]);
    if (!a1 && !a2) return json({ error: "Endast admin" }, 403);
    const date = String(body.date ?? "");
    if (!DATE_RE.test(date)) return json({ error: "Ogiltigt datum" }, 400);
    const type = typeFor(date);
    if (mode === "preview") { const r = await build(date, type); return json({ ...r, report_type: type }); }
    if (mode === "smtp-probe") {
      // Anslutning + EHLO + AUTH mot Loopia, skickar inget.
      const { data: st } = await db.from("report_email_settings").select("smtp_host,smtp_port,smtp_user").eq("id", true).maybeSingle();
      const pw = Deno.env.get("LOOPIA_SMTP_PASSWORD") ?? "";
      if (!pw) return json({ ok: false, error: "LOOPIA_SMTP_PASSWORD saknas" });
      try {
        const r = await sendSmtp({ host: st?.smtp_host, port: Number(st?.smtp_port ?? 465), user: st?.smtp_user, password: pw, from: st?.smtp_user, to: [], data: "", probeOnly: true });
        return json({ ok: true, steps: r.steps });
      } catch (e) {
        return json({ ok: false, stage: e instanceof SmtpError ? e.stage : null, error: String((e as Error)?.message ?? e) });
      }
    }
    if (mode === "test") return json(await run(date, type, true));
    if (mode === "send") return json(await run(date, type, false));
    return json({ error: "Okänt läge" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
