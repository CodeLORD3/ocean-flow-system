// Importerar kunder från Fortnox (master för kunddata) till Makrilltrade med automatisk mappning.
import { adminClient, requireUser, fortnoxRequest, json, corsHeaders, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

const COMPANY_SUFFIXES = [
  "aktiebolag", "handelsbolag", "kommanditbolag", "ab", "hb", "kb",
  "ekonomisk forening", "ek foren", "publ", "gmbh", "ag", "as", "oy", "aps",
];

function normOrg(v?: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.slice(-10);
}

function normName(v?: string | null): string | null {
  if (!v) return null;
  let s = v.toLowerCase()
    .replace(/[åä]/g, "a").replace(/ö/g, "o").replace(/é/g, "e")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of COMPANY_SUFFIXES) {
      if (s.endsWith(" " + suf)) {
        s = s.slice(0, -(suf.length + 1)).trim();
        changed = true;
      }
    }
  }
  return s || null;
}

/** Payload till RPC:n – Fortnox-fälten som Makrilltrade speglar. */
function payloadFrom(c: any) {
  return {
    name: c.Name ?? null,
    org_number: c.OrganisationNumber ?? null,
    vat_number: c.VATNumber ?? null,
    email: c.Email ?? null,
    phone: c.Phone1 ?? c.Phone2 ?? null,
    address1: c.Address1 ?? null,
    address2: c.Address2 ?? null,
    zip_code: c.ZipCode ?? null,
    city: c.City ?? null,
    country_code: c.CountryCode ?? null,
    currency: c.Currency ?? null,
    vat_type: c.VATType ?? null,
    terms_of_payment: c.TermsOfPayment != null ? String(c.TermsOfPayment) : null,
    delivery_name: c.DeliveryName ?? null,
    delivery_address1: c.DeliveryAddress1 ?? null,
    delivery_zip_code: c.DeliveryZipCode ?? null,
    delivery_city: c.DeliveryCity ?? null,
    delivery_country_code: c.DeliveryCountryCode ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const entity: string = body?.legal_entity_code;
  const mode: string = body?.mode === "import" ? "import" : "preview";
  const selected: string[] | null = Array.isArray(body?.customer_numbers) && body.customer_numbers.length
    ? body.customer_numbers.map((n: unknown) => String(n))
    : null;
  if (!entity || !LEGAL_ENTITIES[entity]) return json({ error: "Okänt bolag" }, 400);

  const sb = adminClient();

  const [{ data: fnx, error: fErr }, { data: maps, error: mErr }, { data: mkr, error: cErr }] = await Promise.all([
    sb.from("fortnox_customers").select("customer_number, name, org_number, org_number_norm, city, email, raw")
      .eq("legal_entity_code", entity).eq("active", true),
    sb.from("fortnox_customer_map").select("makrilltrade_customer_id, fortnox_customer_number")
      .eq("legal_entity_code", entity),
    sb.from("customers").select("id, name, org_number"),
  ]);
  if (fErr || mErr || cErr) return json({ error: (fErr ?? mErr ?? cErr)!.message }, 500);
  if (!fnx?.length) {
    return json({ error: "Inga Fortnox-kunder i cachen. Kör \"Synka kunder\" först." }, 409);
  }

  const mappedByNumber = new Map<string, string>();
  const mappedCustomerIds = new Set<string>();
  for (const m of maps ?? []) {
    mappedByNumber.set(String(m.fortnox_customer_number), m.makrilltrade_customer_id);
    mappedCustomerIds.add(m.makrilltrade_customer_id);
  }

  const byOrg = new Map<string, { id: string; name: string }>();
  const byName = new Map<string, { id: string; name: string }>();
  for (const c of mkr ?? []) {
    const o = normOrg(c.org_number);
    if (o && !byOrg.has(o)) byOrg.set(o, { id: c.id, name: c.name });
    const n = normName(c.name);
    if (n && !byName.has(n)) byName.set(n, { id: c.id, name: c.name });
  }

  type PlanRow = {
    customer_number: string;
    fortnox_name: string | null;
    action: "already_mapped" | "map_existing" | "create_new";
    match_on?: "org_number" | "name";
    makrilltrade_customer_id?: string | null;
    makrilltrade_name?: string | null;
  };

  const plan: PlanRow[] = [];
  for (const c of fnx) {
    const nr = String(c.customer_number);
    if (selected && !selected.includes(nr)) continue;

    const existing = mappedByNumber.get(nr);
    if (existing) {
      const m = (mkr ?? []).find((x: any) => x.id === existing);
      plan.push({
        customer_number: nr, fortnox_name: c.name, action: "already_mapped",
        makrilltrade_customer_id: existing, makrilltrade_name: m?.name ?? null,
      });
      continue;
    }

    const org = c.org_number_norm ?? normOrg(c.org_number);
    let hit = org ? byOrg.get(org) : undefined;
    let on: "org_number" | "name" | undefined = hit ? "org_number" : undefined;
    if (!hit) {
      const n = normName(c.name);
      hit = n ? byName.get(n) : undefined;
      if (hit) on = "name";
    }
    // En Makrilltrade-kund kan bara mappas till ett Fortnox-nummer per bolag.
    if (hit && mappedCustomerIds.has(hit.id)) hit = undefined;

    if (hit) {
      plan.push({
        customer_number: nr, fortnox_name: c.name, action: "map_existing", match_on: on,
        makrilltrade_customer_id: hit.id, makrilltrade_name: hit.name,
      });
      mappedCustomerIds.add(hit.id);
    } else {
      plan.push({ customer_number: nr, fortnox_name: c.name, action: "create_new" });
    }
  }

  const summary = {
    total: plan.length,
    already_mapped: plan.filter((p) => p.action === "already_mapped").length,
    map_existing: plan.filter((p) => p.action === "map_existing").length,
    create_new: plan.filter((p) => p.action === "create_new").length,
  };

  if (mode === "preview") return json({ ok: true, mode, legal_entity_code: entity, summary, plan });

  // Import: hämta full kundpost från Fortnox (adress/telefon finns inte i listvyn) och kör RPC:n.
  const results: unknown[] = [];
  let created = 0, updated = 0, failed = 0;

  for (const row of plan) {
    try {
      const detail = (await fortnoxRequest<any>(sb, entity, "GET", `/customers/${encodeURIComponent(row.customer_number)}`)).Customer;
      const { data: id, error } = await sb.rpc("fortnox_import_customer", {
        p_entity: entity,
        p_customer_number: row.customer_number,
        p_makrilltrade_customer_id: row.makrilltrade_customer_id ?? null,
        p_payload: payloadFrom(detail),
      });
      if (error) throw new Error(error.message);
      if (row.action === "create_new") created++; else updated++;
      results.push({ customer_number: row.customer_number, action: row.action, customer_id: id });
    } catch (e) {
      failed++;
      results.push({ customer_number: row.customer_number, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({
    ok: true, mode, legal_entity_code: entity,
    summary: { ...summary, created, updated, failed },
    results,
  });
});
