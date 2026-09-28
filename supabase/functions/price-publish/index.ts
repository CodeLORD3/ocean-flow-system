/**
 * price-publish — prisflödet från ai_utkast (typ pris).
 *
 * action:
 *  - preview   { utkast_id }            läser: produkt, kassapris, Shopify-pris (endast läsning), förändring, stopp
 *  - approve   { utkast_id, confirm_skus } sätter godkänt, skriver price_history och publicerar om flödet är aktivt
 *  - set_active{ active }               adminbrytaren "Prisflöde aktivt" (system_settings.prisflode_aktivt)
 *  - queue     (cron 03/04 UTC, körs 05:00 Stockholm) publicerar köade rader vars datum kommit
 *  - dry_run   { utkast_id }            hela kedjan utan skrivning och utan Shopify-mutation
 */
import { adminClient, corsHeaders, json, requireUser } from "../_shared/fortnox.ts";
import { parsePriceDraft, roundHalf, stopReason } from "./parse.ts";
import { adminToken } from "../_shared/shopify-shops.ts";

const sb = adminClient();
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
const stockholmHour = () =>
  Number(new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", hour12: false }).format(new Date()));

async function flowActive(): Promise<boolean> {
  const { data } = await sb.from("system_settings").select("value").eq("key", "prisflode_aktivt").maybeSingle();
  return data?.value === true;
}

async function shops() {
  const { data } = await sb.from("shopify_shops").select("*").eq("active", true);
  return (data ?? []) as any[];
}

async function shopifyGql(shop: any, query: string, variables: Record<string, unknown>) {
  // Samma tokenkedja som shopify-consent-import: namngiven hemlighet → sparad token → client_credentials.
  const token = (await adminToken(sb as any, shop)) ?? "";
  if (!token) throw new Error(`Admin-token saknas för ${shop.label} (${shop.admin_token_env} eller klientuppgifter)`);
  const res = await fetch(`https://${shop.shop_domain}/admin/api/${shop.api_version || "2024-10"}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw Object.assign(new Error(`Shopify ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`), { body });
  return body.data;
}

const FIND = `query($q:String!){ productVariants(first:5, query:$q){ nodes{ id sku price product{ id title } } } }`;
const UPDATE = `mutation($pid:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$v){ productVariants{ id price } userErrors{ field message } } }`;

async function chfPerSek(): Promise<number | null> {
  const { data } = await sb.rpc("fx_to_sek", { _currency: "CHF", _on: today() });
  const sekPerChf = Number(data);
  return sekPerChf > 0 ? 1 / sekPerChf : null;
}

/** Rader per SKU med allt som behövs för visning, stopp och publicering. */
async function buildRows(content: string, readShopify: boolean) {
  const { rows, tableFound } = parsePriceDraft(content);
  const skus = rows.map((r) => r.sku).filter(Boolean) as string[];
  const { data: products } = skus.length
    ? await sb.from("products").select("id, sku, name, cost_price").in("sku", skus)
    : { data: [] as any[] };
  const bySku = new Map((products ?? []).map((p: any) => [p.sku, p]));
  const ids = (products ?? []).map((p: any) => p.id);
  const { data: lists } = await sb.from("pos_price_lists").select("id, currency_code").eq("is_active", true).eq("currency_code", "SEK");
  const listId = lists?.[0]?.id ?? null;
  const { data: items } = ids.length && listId
    ? await sb.from("pos_price_list_items").select("product_id, price_inc_vat, vat_category, valid_from")
      .eq("price_list_id", listId).in("product_id", ids).lte("valid_from", new Date().toISOString()).order("valid_from", { ascending: false })
    : { data: [] as any[] };
  const posPrice = new Map<string, any>();
  for (const i of items ?? []) if (!posPrice.has(i.product_id)) posPrice.set(i.product_id, i);
  const { data: maps } = ids.length
    ? await sb.from("shopify_product_map").select("product_id, shop_id, shopify_sku, quantity_factor, free_text_only").in("product_id", ids)
    : { data: [] as any[] };
  const shopList = await shops();
  const seShop = shopList.find((s) => s.currency === "SEK");
  const rate = await chfPerSek();

  const out = [];
  for (const r of rows) {
    const p = r.sku ? bySku.get(r.sku) : null;
    const pos = p ? posPrice.get(p.id) : null;
    const oldPrice = pos ? Number(pos.price_inc_vat) : null;
    let error = r.error ?? (r.sku && !p ? "SKU finns inte i produktregistret" : null);
    const targets: any[] = [];
    if (p && !error) {
      for (const m of (maps ?? []).filter((m: any) => m.product_id === p.id && !m.free_text_only && m.shopify_sku)) {
        const shop = shopList.find((s) => s.id === (m.shop_id ?? seShop?.id));
        if (!shop) continue;
        const factor = Number(m.quantity_factor ?? 1) || 1;
        const sek = r.price! * factor;
        const price = shop.currency === "CHF" ? (rate ? roundHalf(sek * rate) : null) : Math.round(sek * 100) / 100;
        let current: any = null;
        if (readShopify) {
          try {
            const d = await shopifyGql(shop, FIND, { q: `sku:'${m.shopify_sku.replace(/'/g, "")}'` });
            current = (d?.productVariants?.nodes ?? []).find((v: any) => v.sku === m.shopify_sku) ?? null;
          } catch (e) { current = { error: (e as Error).message }; }
        }
        targets.push({ shop_id: shop.id, shop: shop.label, currency: shop.currency, shopify_sku: m.shopify_sku, new_price: price,
          current_price: current?.price != null ? Number(current.price) : null, variant_id: current?.id ?? null,
          product_gid: current?.product?.id ?? null, read_error: current?.error ?? (readShopify && !current ? "variant hittades inte" : null) });
      }
    }
    const changePct = oldPrice && r.price ? ((r.price - oldPrice) / oldPrice) * 100 : null;
    out.push({
      line: r.line, raw: r.raw, sku: r.sku, product_id: p?.id ?? null, product_name: p?.name ?? null,
      cost_price: p?.cost_price ?? null, old_price: oldPrice, vat_category: pos?.vat_category ?? "food",
      new_price: r.price, valid_from: r.validFrom, change_pct: changePct, error,
      stop: !error && r.price ? stopReason(oldPrice, r.price, p?.cost_price ?? null) : null,
      shopify: targets,
    });
  }
  return { tableFound, rows: out, pos_list_id: listId, chf_per_sek: rate };
}

async function log(entry: Record<string, unknown>) { await sb.from("price_publish_log").insert(entry); }

/** Publicerar en rad till kassan (SE-prislista) och Shopify. dry=true skickar inget. */
async function publishRow(h: any, row: any, listId: string | null, userId: string | null, dry = false) {
  let ok = true;
  if (!listId) { ok = false; await log({ price_history_id: h.id, ai_utkast_id: h.source_ai_utkast_id, sku: row.sku, target: "kassa", status: "fel", error: "Svensk prislista saknas" }); }
  else if (!dry) {
    const req = { price_list_id: listId, product_id: row.product_id, price_inc_vat: row.new_price, vat_category: row.vat_category, valid_from: new Date().toISOString(), published_by: userId, published_at: new Date().toISOString() };
    const { error } = await sb.from("pos_price_list_items").insert(req);
    if (error) ok = false;
    await log({ price_history_id: h.id, ai_utkast_id: h.source_ai_utkast_id, sku: row.sku, target: "kassa", status: error ? "fel" : "ok", request: req, error: error?.message ?? null });
  }
  for (const t of row.shopify) {
    const shop = (await shops()).find((s) => s.id === t.shop_id);
    const request = { productId: t.product_gid, variants: [{ id: t.variant_id, price: String(t.new_price) }] };
    if (!t.variant_id || t.new_price == null) {
      ok = false;
      await log({ price_history_id: h.id, ai_utkast_id: h.source_ai_utkast_id, sku: row.sku, target: `shopify:${t.shop}`, status: "fel", request, error: t.read_error ?? "CHF-kurs saknas" });
      continue;
    }
    if (dry) continue;
    try {
      const d = await shopifyGql(shop, UPDATE, { pid: t.product_gid, v: request.variants });
      const ue = d?.productVariantsBulkUpdate?.userErrors ?? [];
      if (ue.length) ok = false;
      await log({ price_history_id: h.id, ai_utkast_id: h.source_ai_utkast_id, sku: row.sku, target: `shopify:${t.shop}`, status: ue.length ? "fel" : "ok", request, response: d, error: ue.length ? JSON.stringify(ue) : null });
    } catch (e) {
      ok = false;
      await log({ price_history_id: h.id, ai_utkast_id: h.source_ai_utkast_id, sku: row.sku, target: `shopify:${t.shop}`, status: "fel", request, response: (e as any).body ?? null, error: (e as Error).message });
    }
  }
  if (!dry) await sb.from("price_history").update({ publish_status: ok ? "publicerad" : "fel", published_at: new Date().toISOString() }).eq("id", h.id);
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const isCron = req.headers.get("x-cron-secret") === Deno.env.get("FORTNOX_CRON_SECRET");
  let userId: string | null = null;
  if (!isCron) {
    const user = await requireUser(req);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: isAdmin } = await sb.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    userId = user.id;
  }
  const action = String(body.action ?? (isCron ? "queue" : ""));

  if (action === "set_active") {
    const { error } = await sb.from("system_settings").upsert({ key: "prisflode_aktivt", value: body.active === true }, { onConflict: "key" });
    if (error) return json({ error: error.message }, 500);
    await log({ sku: null, target: "inställning", status: "ok", request: { prisflode_aktivt: body.active === true, av: userId } });
    return json({ active: body.active === true });
  }

  if (action === "queue") {
    if (isCron && body.force !== true && stockholmHour() !== 5) return json({ skipped: "inte 05:00 svensk tid" });
    if (!(await flowActive())) return json({ skipped: "Prisflöde av" });
    const { data: due } = await sb.from("price_history").select("*").eq("publish_status", "köad").lte("valid_from", today());
    let done = 0;
    for (const h of due ?? []) {
      const { data: u } = await sb.from("ai_utkast").select("innehall").eq("id", h.source_ai_utkast_id).maybeSingle();
      const built = await buildRows(u?.innehall ?? "", true);
      const row = built.rows.find((r) => r.sku === h.sku && !r.error);
      if (!row) { await sb.from("price_history").update({ publish_status: "fel" }).eq("id", h.id); continue; }
      row.new_price = Number(h.new_price);
      await publishRow(h, row, built.pos_list_id, null);
      done++;
    }
    return json({ published: done });
  }

  if (action === "shopify_check") {
    // Endast läsning: bekräftar att varje aktiv webbutik svarar och läser gällande pris på mappade SKU:er.
    const { data: maps } = await sb.from("shopify_product_map").select("shop_id, shopify_sku").not("shopify_sku", "is", null).eq("free_text_only", false).limit(200);
    const out: any[] = [];
    for (const shop of await shops()) {
      const skus = (maps ?? []).filter((m: any) => (m.shop_id ?? (shop.currency === "SEK" ? shop.id : null)) === shop.id).slice(0, 3).map((m: any) => m.shopify_sku);
      const r: any = { shop: shop.label, currency: shop.currency, mapped_sample: skus.length, prices: [], error: null };
      try {
        const d = await shopifyGql(shop, `query{ shop{ name currencyCode } }`, {});
        r.shop_name = d?.shop?.name;
        for (const s of skus) {
          const v = await shopifyGql(shop, FIND, { q: `sku:'${String(s).replace(/'/g, "")}'` });
          const hit = (v?.productVariants?.nodes ?? []).find((n: any) => n.sku === s);
          r.prices.push({ sku: s, price: hit?.price ?? null });
        }
      } catch (e) { r.error = (e as Error).message; }
      out.push(r);
    }
    return json({ active: await flowActive(), shops: out });
  }

  const id = Number(body.utkast_id);
  if (!Number.isFinite(id)) return json({ error: "utkast_id saknas" }, 400);
  const { data: utkast } = await sb.from("ai_utkast").select("*").eq("id", id).maybeSingle();
  if (!utkast) return json({ error: "utkast finns inte" }, 404);
  if (utkast.typ !== "pris") return json({ error: "utkastet är inte av typ pris" }, 400);
  const content = typeof body.innehall === "string" ? body.innehall : utkast.innehall ?? "";

  if (action === "preview" || action === "dry_run") {
    const built = await buildRows(content, true);
    const active = await flowActive();
    if (action === "dry_run") {
      // Simulerar publiceringen: samma kontroller, ingen skrivning, inga Shopify-mutationer.
      const sim = built.rows.filter((r) => !r.error).map((r) => ({
        sku: r.sku, stop: r.stop, would: !active ? "ej publicerad" : r.valid_from! > today() ? "köad" : "publiceras",
        kassa: built.pos_list_id ? "skulle skrivas" : "fel: prislista saknas",
        shopify: r.shopify.map((t: any) => ({ shop: t.shop, pris: t.new_price, variant: t.variant_id ? "hittad" : t.read_error })),
      }));
      return json({ active, ...built, simulation: sim });
    }
    return json({ active, ...built });
  }

  if (action === "approve") {
    const built = await buildRows(content, true);
    const confirm = new Set<string>((body.confirm_skus ?? []).map(String));
    const needs = built.rows.filter((r) => !r.error && r.stop && !confirm.has(r.sku!));
    if (needs.length) return json({ needs_confirmation: needs.map((r) => ({ sku: r.sku, stop: r.stop })) }, 409);
    const active = await flowActive();
    const { error: uErr } = await sb.from("ai_utkast").update({ status: "godkänt", innehall: content, vd_kommentar: body.vd_kommentar ?? utkast.vd_kommentar }).eq("id", id);
    if (uErr) return json({ error: uErr.message }, 500);
    const result: any[] = [];
    const { data: au } = userId ? await sb.auth.admin.getUserById(userId) : { data: null } as any;
    const changedBy = au?.user?.email ?? userId ?? "system";
    for (const r of built.rows.filter((x) => !x.error)) {
      const status = !active ? "ej publicerad" : r.valid_from! > today() ? "köad" : "publiceras";
      const { data: h, error } = await sb.from("price_history").insert({
        product_id: r.product_id, sku: r.sku, old_price: r.old_price, new_price: r.new_price, valid_from: r.valid_from,
        source_ai_utkast_id: id, publish_status: status === "publiceras" ? "köad" : status,
        changed_by: changedBy, reason: `ai_utkast ${id}${r.stop ? ` (bekräftat stopp: ${r.stop})` : ""}`,
      }).select().single();
      if (error) { result.push({ sku: r.sku, error: error.message }); continue; }
      if (status === "publiceras") result.push({ sku: r.sku, status: (await publishRow(h, r, built.pos_list_id, userId)) ? "publicerad" : "fel" });
      else result.push({ sku: r.sku, status });
    }
    return json({ active, result, skipped: built.rows.filter((r) => r.error).map((r) => ({ line: r.line, error: r.error })) });
  }

  return json({ error: "okänd action" }, 400);
});
