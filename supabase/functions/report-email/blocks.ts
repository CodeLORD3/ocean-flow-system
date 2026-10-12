// Uppställning enligt kalkylarket "Bruttomarginal": tre block (Göteborg,
// Grossisten, Stockholm), en rad per dag. Alla belopp räknas här ur
// databasen; saknas en källa visas "–" med en not, inget uppskattas.
// deno-lint-ignore-file no-explicit-any

const WD = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const range = (a: string, b: string) => { const o: string[] = []; for (let d = a; d <= b; d = addDays(d, 1)) o.push(d); return o; };
export const mondayOf = (d: string) => addDays(d, -((dow(d) + 6) % 7));

const grp = (n: number, dec: number) => {
  const [i, f] = Math.abs(n).toFixed(dec).split(".");
  return (n < 0 ? "−" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (f ? "," + f : "");
};
const kr = (n: number | null | undefined) => (n == null ? "–" : `${grp(n, 2)} kr`);
const kr0 = (n: number | null | undefined) => (n == null ? "–" : `${grp(n, 0)} kr`);
const int = (n: number | null | undefined) => (n == null ? "–" : grp(n, 0));
const pc = (n: number | null) => (n == null ? "–" : `${grp(n, 2)} %`);
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const r2 = (n: number) => Math.round(n * 100) / 100;
const sumN = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null; };
const div = (a: number | null, b: number | null) => (a == null || !b ? null : a / b);
const shortName = (n: string) => n.replace(/^Fiskskaldjur\s+/i, "").replace(/\s+Centrum$/i, "").replace(/^Ålstens Fisk$/i, "Ålsten");

const CANCELLED = ["avbruten", "makulerad", "cancelled", "annullerad"];
const FAKT_RE = /Kundfaktura\s+(Componia AG|DE No\.?1 AB)\s*\((\d+)\)/i;

// Stil (inline för Gmail/Outlook)
const B = "border:1px solid #c9d1d7";
const thS = `style="${B};background:#e4e8eb;padding:4px 6px;font-size:11px;font-weight:700;text-align:right;white-space:nowrap"`;
const thL = thS.replace("text-align:right", "text-align:left");
const tdS = (hl = false, bold = false) => `style="${B};padding:4px 6px;font-size:11px;text-align:right;white-space:nowrap;font-family:Menlo,Consolas,monospace${hl ? ";background:#fff4c2" : ""}${bold ? ";font-weight:700" : ""}"`;
const tdL = (hl = false, bold = false) => `style="${B};padding:4px 6px;font-size:11px;text-align:left;white-space:nowrap${hl ? ";background:#fff4c2" : ""}${bold ? ";font-weight:700" : ""}"`;
const tbl = (inner: string) => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;width:100%;margin:4px 0 6px">${inner}</table>`;
const title = (t: string, sub: string) => `<div style="font-size:15px;font-weight:700;margin:22px 0 2px;color:#1f2a33">${t}</div><div style="font-size:11px;color:#5b6b77;margin-bottom:4px">${sub}</div>`;
const summary = (rows: [string, string, boolean?][]) => tbl(rows.map(([l, v, b]) => `<tr><td ${tdL(false, !!b)} width="60%">${l}</td><td ${tdS(false, !!b)}>${v}</td></tr>`).join(""));
const noteList = (n: string[]) => (n.length ? `<ul style="font-size:11px;color:#7a4a1c;margin:2px 0 8px 16px;padding:0">${n.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");

export type BlockFacts = Record<string, unknown>;

export async function buildBlocks(db: any, from: string, to: string, highlight: string | null) {
  const days = range(from, to);
  const { data: st, error: se } = await db.from("stores").select("id,name,region,unit_type,is_wholesale,active").eq("active", true).eq("is_wholesale", false).in("region", ["vast", "stockholm"]).order("name");
  if (se) throw se;
  const sales = (st ?? []).filter((s: any) => !["produktion", "admin", "overhead", "grossist"].includes(String(s.unit_type ?? "butik")));
  const gbg = sales.filter((s: any) => s.region === "vast");
  const sth = sales.filter((s: any) => s.region === "stockholm");
  const ids = sales.map((s: any) => s.id);

  const vFrom = addDays(from, -21), vTo = addDays(to, 21);
  const [rep, vouch, mt, web] = await Promise.all([
    db.from("daily_reports").select("store_id,report_date,net_sales,receipt_count").in("store_id", ids).gte("report_date", from).lte("report_date", to),
    db.from("fortnox_vouchers").select("legal_entity_code,voucher_series,transaction_date,description,rows").in("legal_entity_code", ["fsab-se", "de-no1"]).gte("transaction_date", vFrom).lte("transaction_date", vTo).limit(5000),
    db.from("margin_targets").select("target_pct").eq("applies_to", "grossist").limit(1).maybeSingle(),
    db.from("customer_orders").select("store_id,wanted_date,total_incl_vat,status").eq("source", "shopify").in("store_id", sth.map((s: any) => s.id)).gte("wanted_date", from).lte("wanted_date", to),
  ]);
  for (const r of [rep, vouch, web]) if (r.error) throw r.error;

  const net = new Map<string, number>(), rec = new Map<string, number>();
  for (const r of rep.data ?? []) {
    if (r.net_sales != null) net.set(`${r.store_id}|${r.report_date}`, Number(r.net_sales));
    if (r.receipt_count != null) rec.set(`${r.store_id}|${r.report_date}`, Number(r.receipt_count));
  }
  const rowsOf = (v: any) => (Array.isArray(v.rows) ? v.rows : []).filter((x: any) => !x.Removed);

  // Inköp Göteborg: fsab-se konto 4010 + 4011 (debet − kredit) per transaktionsdag
  const buyG = new Map<string, number>();
  const voucherDays = new Set<string>();
  for (const v of vouch.data ?? []) {
    if (v.legal_entity_code !== "fsab-se") continue;
    if (v.transaction_date >= from && v.transaction_date <= to) voucherDays.add(v.transaction_date);
    for (const x of rowsOf(v)) {
      if (![4010, 4011].includes(Number(x.Account))) continue;
      buyG.set(v.transaction_date, (buyG.get(v.transaction_date) ?? 0) + Number(x.Debit ?? 0) - Number(x.Credit ?? 0));
    }
  }

  // Grossistens fakturering: fsab-se kundfakturor till Componia AG / DE No.1 AB,
  // intäktskonton 3xxx, dag = beställningens leveransdag via fakturanumret.
  const invoices: { nr: string; kund: "ch" | "sth"; amount: number; booked: string }[] = [];
  for (const v of vouch.data ?? []) {
    if (v.legal_entity_code !== "fsab-se") continue;
    const m = FAKT_RE.exec(String(v.description ?? ""));
    if (!m) continue;
    const amount = rowsOf(v).filter((x: any) => String(x.Account).startsWith("30")).reduce((s: number, x: any) => s + Number(x.Credit ?? 0) - Number(x.Debit ?? 0), 0);
    invoices.push({ nr: m[2], kund: /componia/i.test(m[1]) ? "ch" : "sth", amount: r2(amount), booked: v.transaction_date });
  }
  const nrs = [...new Set(invoices.map((i) => i.nr))];
  const delivery = new Map<string, string>();
  if (nrs.length) {
    const { data: jobs, error } = await db.from("fortnox_invoice_jobs").select("fortnox_document_number,order_id").in("fortnox_document_number", nrs);
    if (error) throw error;
    const oids = (jobs ?? []).map((j: any) => j.order_id).filter(Boolean);
    const { data: ords } = oids.length ? await db.from("shop_orders").select("id,desired_delivery_date").in("id", oids) : { data: [] };
    for (const j of jobs ?? []) {
      const o = (ords ?? []).find((x: any) => x.id === j.order_id);
      if (o?.desired_delivery_date) delivery.set(String(j.fortnox_document_number), o.desired_delivery_date);
    }
  }
  const factCH = new Map<string, number>(), factSTH = new Map<string, number>();
  const unlinked: string[] = [];
  for (const i of invoices) {
    const d = delivery.get(i.nr);
    if (!d) { if (i.booked >= from && i.booked <= to) unlinked.push(`faktura ${i.nr} (${i.kund === "ch" ? "Componia" : "DE No.1"}, ${kr(i.amount)}, bokförd ${i.booked})`); continue; }
    if (d < from || d > to) continue;
    const m = i.kund === "ch" ? factCH : factSTH;
    m.set(d, r2((m.get(d) ?? 0) + i.amount));
  }
  void mt;
  // Grossistens varukostnad = fakturerat ÷ 1,282 (22 % påslag), som i arket.
  const costOf = (n: number | null) => (n == null ? null : r2(n / 1.282));

  // Webb (hämtdag): Shopify-ordrar per hämtdag i Stockholmsbutikerna, exkl. moms 6 %
  const webDay = new Map<string, number>();
  for (const o of web.data ?? []) {
    if (CANCELLED.includes(String(o.status ?? "").toLowerCase()) || o.total_incl_vat == null) continue;
    webDay.set(o.wanted_date, (webDay.get(o.wanted_date) ?? 0) + Number(o.total_incl_vat));
  }
  const webEx = (d: string) => (webDay.has(d) ? r2(webDay.get(d)! / 1.06) : null);

  // Faktura (Stockholm): kundfakturor (serie B) i de-no1 på 3xxx
  const factDE = new Map<string, number>();
  for (const v of vouch.data ?? []) {
    if (v.legal_entity_code !== "de-no1" || v.voucher_series !== "B" || v.transaction_date < from || v.transaction_date > to) continue;
    const a = rowsOf(v).filter((x: any) => String(x.Account).startsWith("30")).reduce((s: number, x: any) => s + Number(x.Credit ?? 0) - Number(x.Debit ?? 0), 0);
    factDE.set(v.transaction_date, r2((factDE.get(v.transaction_date) ?? 0) + a));
  }

  const dayLabel = (d: string) => `${WD[dow(d)]} ${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const hl = (d: string) => d === highlight;
  const storeNet = (s: any) => sumN(days.map((d) => net.get(`${s.id}|${d}`)));
  const storeRec = (s: any) => sumN(days.map((d) => rec.get(`${s.id}|${d}`)));
  const missingDays = days.filter((d) => !buyG.has(d) && dow(d) !== 0 && dow(d) !== 6);
  void voucherDays;
  const prelim = missingDays.length ? [`Preliminärt: inga varuinköp (konto 4010/4011) bokförda i Fortnox ännu för ${missingDays.map(dayLabel).join(", ")}. Inköp och bruttomarginal ändras när bokföringen är klar.`] : [];

  // ---------- GÖTEBORG ----------
  const gDayTotal = (d: string) => sumN(gbg.map((s: any) => net.get(`${s.id}|${d}`)));
  const gBuy = sumN(days.map((d) => (buyG.has(d) ? r2(buyG.get(d)!) : null)));
  const gSales = sumN(gbg.map(storeNet));
  const gRec = sumN(gbg.map(storeRec));
  const chTot = sumN(days.map((d) => factCH.get(d)));
  const sthTot = sumN(days.map((d) => factSTH.get(d)));
  const wSales = sumN([chTot, sthTot]);
  const wCost = costOf(wSales);
  const gNetBuy = gBuy == null ? null : r2(gBuy - (wCost ?? 0));
  const gResult = gSales == null ? null : r2(gSales - (gNetBuy ?? 0));
  let g = title("GÖTEBORG", "Fisk & Skaldjursspecialisten No.1 AB");
  g += tbl(
    `<tr><th ${thL}>Dag</th><th ${thS}>Inköp</th>${gbg.map((s: any) => `<th ${thS}>${esc(shortName(s.name))}</th>`).join("")}<th ${thS}>TOTAL FÖRSÄLJNING</th></tr>` +
    `<tr><td ${tdL(false, true)}></td><td ${tdL(false, true)}>KORTKÖP</td>${gbg.map((s: any) => `<td ${tdS(false, true)}>${int(storeRec(s))}</td>`).join("")}<td ${tdS(false, true)}>${int(gRec)}</td></tr>` +
    days.map((d) => `<tr><td ${tdL(hl(d), hl(d))}>${dayLabel(d)}</td><td ${tdS(hl(d))}>${kr(buyG.has(d) ? r2(buyG.get(d)!) : null)}</td>${gbg.map((s: any) => `<td ${tdS(hl(d))}>${kr(net.get(`${s.id}|${d}`))}</td>`).join("")}<td ${tdS(hl(d), true)}>${kr(gDayTotal(d))}</td></tr>`).join("") +
    `<tr><td ${tdL(false, true)}>Totalt</td><td ${tdS(false, true)}>${kr(gBuy)}</td>${gbg.map((s: any) => `<td ${tdS(false, true)}>${kr(storeNet(s))}</td>`).join("")}<td ${tdS(false, true)}>${kr(gSales)}</td></tr>`,
  );
  g += summary([
    ["Inköp brutto", kr(gBuy)],
    ["Avgår: varukostnad som grossisten fakturerat vidare", kr(wCost == null ? null : -wCost)],
    ["Inköp netto", kr(gNetBuy), true],
    ["Lagerförändring", kr(0)],
    ["Total försäljning", kr(gSales), true],
    ["Resultat", kr(gResult), true],
    ...gbg.map((s: any) => [`Snittkvitto ${esc(shortName(s.name))}`, kr0(div(storeNet(s), storeRec(s)))] as [string, string]),
    ["Snittkvitto totalt", kr0(div(gSales, gRec)), true],
    ["Bruttomarginal", pc(gResult == null ? null : (div(gResult, gSales) ?? 0) * 100), true],
  ]);
  g += noteList([...prelim, "Lagerförändring: inget lagervärde registrerat i systemet, räknas som 0."]);

  // ---------- GROSSISTEN ----------
  const wResult = wSales == null ? null : r2(wSales - (wCost ?? 0));
  let w = title("GROSSISTEN", "FSAB grossist");
  w += tbl(
    `<tr><th ${thL}>Dag</th><th ${thS}>Varukostnad</th><th ${thS}>Schweiz (fakturerat)</th><th ${thS}>Stockholm (fakturerat)</th><th ${thS}>TOTAL FÖRSÄLJNING</th></tr>` +
    days.map((d) => { const t = sumN([factCH.get(d), factSTH.get(d)]); return `<tr><td ${tdL(hl(d), hl(d))}>${dayLabel(d)}</td><td ${tdS(hl(d))}>${kr(costOf(t))}</td><td ${tdS(hl(d))}>${kr(factCH.get(d))}</td><td ${tdS(hl(d))}>${kr(factSTH.get(d))}</td><td ${tdS(hl(d), true)}>${kr(t)}</td></tr>`; }).join("") +
    `<tr><td ${tdL(false, true)}>Totalt</td><td ${tdS(false, true)}>${kr(wCost)}</td><td ${tdS(false, true)}>${kr(chTot)}</td><td ${tdS(false, true)}>${kr(sthTot)}</td><td ${tdS(false, true)}>${kr(wSales)}</td></tr>`,
  );
  w += summary([["Total försäljning", kr(wSales), true], ["Resultat", kr(wResult), true], ["Bruttomarginal", pc(wResult == null ? null : (div(wResult, wSales) ?? 0) * 100), true]]);
  w += noteList([
    "Fakturerat = FSAB:s kundfakturor till Componia AG och DE No.1 AB i Fortnox, placerade på beställningens leveransdag.",
    "Varukostnad: ingen faktisk kostnad finns i systemet. Beräknad som fakturerat ÷ 1,282 (22 % påslag).",
    ...(unlinked.length ? [`Ej medräknade, saknar kopplad beställning: ${unlinked.join("; ")}.`] : []),
  ]);

  // ---------- STOCKHOLM ----------
  const sthBuy = sthTot; // Stockholms inköp = grossistens faktura till Stockholm
  const sDayTotal = (d: string) => sumN([...sth.map((s: any) => net.get(`${s.id}|${d}`)), webEx(d), factDE.get(d)]);
  const sStoreSales = sumN(sth.map(storeNet));
  const sWeb = sumN(days.map(webEx));
  const sFact = sumN(days.map((d) => factDE.get(d)));
  const sSales = sumN([sStoreSales, sWeb, sFact]);
  const sRec = sumN(sth.map(storeRec));
  const sResult = sSales == null ? null : r2(sSales - (sthBuy ?? 0));
  let s = title("STOCKHOLM", "DE No.1 AB");
  s += tbl(
    `<tr><th ${thL}>Dag</th><th ${thS}>Inköp</th>${sth.map((x: any) => `<th ${thS}>${esc(shortName(x.name))}</th>`).join("")}<th ${thS}>Webb (hämtdag)</th><th ${thS}>Faktura</th><th ${thS}>Total försäljning</th></tr>` +
    `<tr><td ${tdL(false, true)}></td><td ${tdL(false, true)}>KORTKÖP</td>${sth.map((x: any) => `<td ${tdS(false, true)}>${int(storeRec(x))}</td>`).join("")}<td ${tdS(false, true)}></td><td ${tdS(false, true)}></td><td ${tdS(false, true)}>${int(sRec)}</td></tr>` +
    days.map((d) => `<tr><td ${tdL(hl(d), hl(d))}>${dayLabel(d)}</td><td ${tdS(hl(d))}>${kr(factSTH.get(d))}</td>${sth.map((x: any) => `<td ${tdS(hl(d))}>${kr(net.get(`${x.id}|${d}`))}</td>`).join("")}<td ${tdS(hl(d))}>${kr(webEx(d))}</td><td ${tdS(hl(d))}>${kr(factDE.get(d))}</td><td ${tdS(hl(d), true)}>${kr(sDayTotal(d))}</td></tr>`).join("") +
    `<tr><td ${tdL(false, true)}>Totalt</td><td ${tdS(false, true)}>${kr(sthBuy)}</td>${sth.map((x: any) => `<td ${tdS(false, true)}>${kr(storeNet(x))}</td>`).join("")}<td ${tdS(false, true)}>${kr(sWeb)}</td><td ${tdS(false, true)}>${kr(sFact ?? 0)}</td><td ${tdS(false, true)}>${kr(sSales)}</td></tr>`,
  );
  s += summary([
    ["Ingående lager", "–"], ["Utgående lager", "–"], ["Lagerförändring", kr(0)],
    ["Total försäljning", kr(sSales), true], ["Resultat", kr(sResult), true],
    ...sth.map((x: any) => [`Snittkvitto ${esc(shortName(x.name))}`, kr0(div(storeNet(x), storeRec(x)))] as [string, string]),
    ["Snittkvitto totalt", kr0(div(sStoreSales, sRec)), true],
    ["Bruttomarginal", pc(sResult == null ? null : (div(sResult, sSales) ?? 0) * 100), true],
  ]);
  s += noteList([
    "Inköp = grossistens faktura till DE No.1 AB på leveransdagen.",
    "Webb = webbshopsordrar (Shopify) per hämtdag, exklusive 6 % moms.",
    sFact == null ? "Faktura: inga kundfakturor i DE No.1 under perioden." : "Faktura = kundfakturor i DE No.1 (Fortnox).",
    "Lager: inget lagervärde registrerat i systemet, källa saknas. Lagerförändring räknas som 0.",
  ]);

  const facts = {
    goteborg: { inkop_brutto: gBuy, avgar: wCost, inkop_netto: gNetBuy, forsaljning: gSales, resultat: gResult, kortkop: gRec },
    grossisten: { fakturerat_schweiz: chTot, fakturerat_stockholm: sthTot, varukostnad: wCost, resultat: wResult },
    stockholm: { inkop: sthBuy, butiker: sStoreSales, webb: sWeb, faktura: sFact, forsaljning: sSales, resultat: sResult, kortkop: sRec },
    preliminar: missingDays,
  };
  return { html: g + w + s, facts };
}
