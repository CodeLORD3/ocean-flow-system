/**
 * Import av e-postsamtycke från Shopify till customers_retail.
 * Läser kunder via Admin GraphQL (emailMarketingConsent) för varje kopplad
 * webbutik och sätter consent_email/consent_at/consent_source='shopify'
 * för matchande email_normalized. Endast administratörer.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { adminToken, listShops } from "../_shared/shopify-shops.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const Q = `query($after:String){customers(first:250, after:$after){pageInfo{hasNextPage endCursor}
 nodes{ defaultEmailAddress{ emailAddress marketingState marketingUpdatedAt } }}}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: u } = await db.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, ""));
  if (!u?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
  const [{ data: isAdm }, { data: isPa }] = await Promise.all([
    db.rpc("has_role", { _user_id: u.user.id, _role: "admin" }),
    db.rpc("is_platform_admin", { _user_id: u.user.id }),
  ]);
  if (!isAdm && !isPa) return json({ ok: false, error: "Endast administratörer" }, 403);

  const shops = await listShops(db);
  const report: any[] = [];
  const consent = new Map<string, string | null>(); // email -> updatedAt för SUBSCRIBED
  for (const shop of shops) {
    const r: any = { shop: shop.label ?? shop.shop_domain, customers: 0, subscribed: 0, error: null };
    report.push(r);
    const token = await adminToken(db, shop);
    if (!token) { r.error = `Admin-token saknas (${shop.admin_token_env} eller OAuth)`; continue; }
    let after: string | null = null;
    try {
      for (let page = 0; page < 200; page++) {
        const res = await fetch(`https://${shop.shop_domain}/admin/api/${shop.api_version}/graphql.json`, {
          method: "POST",
          headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
          body: JSON.stringify({ query: Q, variables: { after } }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.errors) { r.error = `Shopify ${res.status}: ${JSON.stringify(body.errors ?? body).slice(0, 300)}`; break; }
        const c = body.data.customers;
        for (const n of c.nodes) {
          const e = n.defaultEmailAddress;
          if (!e?.emailAddress) continue;
          r.customers++;
          if (e.marketingState === "SUBSCRIBED") { r.subscribed++; consent.set(e.emailAddress.trim().toLowerCase(), e.marketingUpdatedAt ?? null); }
        }
        if (!c.pageInfo.hasNextPage) break;
        after = c.pageInfo.endCursor;
        await new Promise((s) => setTimeout(s, 300));
      }
    } catch (err) { r.error = String(err); }
  }

  let updated = 0;
  const emails = [...consent.keys()];
  for (let i = 0; i < emails.length; i += 200) {
    const chunk = emails.slice(i, i + 200);
    const { data: rows } = await db.from("customers_retail").select("id,email_normalized,consent_email").in("email_normalized", chunk).is("anonymized_at", null);
    for (const row of rows ?? []) {
      if (row.consent_email) continue;
      const { error } = await db.from("customers_retail").update({
        consent_email: true, consent_at: consent.get(row.email_normalized) ?? new Date().toISOString(), consent_source: "shopify",
      }).eq("id", row.id);
      if (!error) updated++;
    }
  }
  return json({ ok: true, shops: report, subscribed_emails: emails.length, updated });
});
