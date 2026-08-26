import { adminClient, requireUser, fortnoxRequest, json, corsHeaders, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { legal_entity_code } = await req.json().catch(() => ({}));
  if (!legal_entity_code || !LEGAL_ENTITIES[legal_entity_code]) return json({ error: "Okänt bolag" }, 400);

  const sb = adminClient();
  let page = 1;
  let fetched = 0;

  try {
    while (page <= 200) {
      const res = await fortnoxRequest<any>(sb, legal_entity_code, "GET", `/customers?limit=100&page=${page}`);
      const list: any[] = res?.Customers ?? [];
      if (list.length === 0) break;

      const rows = list.map((c) => ({
        legal_entity_code,
        customer_number: String(c.CustomerNumber),
        name: c.Name ?? null,
        org_number: c.OrganisationNumber ?? null,
        email: c.Email ?? null,
        city: c.City ?? null,
        country_code: c.CountryCode ?? null,
        currency: c.Currency ?? null,
        vat_type: c.VATType ?? null,
        active: c.Active !== false,
        raw: c,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await sb.from("fortnox_customers").upsert(rows, { onConflict: "legal_entity_code,customer_number" });
      if (error) return json({ error: error.message }, 500);
      fetched += rows.length;

      const meta = res?.MetaInformation;
      if (meta && meta["@TotalPages"] && page >= meta["@TotalPages"]) break;
      page++;
    }

    const { data: matched, error: mErr } = await sb.rpc("fortnox_auto_match_customers", { p_entity: legal_entity_code });
    if (mErr) return json({ error: mErr.message }, 500);

    return json({ ok: true, customers_synced: fetched, suggested_matches: matched ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 502);
  }
});
