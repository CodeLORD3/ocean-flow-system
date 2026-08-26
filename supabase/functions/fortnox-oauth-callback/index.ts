// Publik (verify_jwt = false): Fortnox redirectar webbläsaren hit.
import { adminClient, exchangeCode, storeTokens, fortnoxRequest, APP_URL } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const oauthError = u.searchParams.get("error");
  const appUrl = Deno.env.get("APP_URL") ?? APP_URL;
  const back = (q: string) => Response.redirect(`${appUrl}/fortnox?${q}`, 302);

  if (oauthError) return back(`error=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return back("error=missing_code_or_state");

  const sb = adminClient();
  const { data: st } = await sb.from("fortnox_oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st || new Date(st.expires_at) < new Date()) return back("error=invalid_or_expired_state");
  await sb.from("fortnox_oauth_states").delete().eq("state", state);

  const entity = st.legal_entity_code as string;
  try {
    const tokens = await exchangeCode(code);
    await storeTokens(sb, entity, tokens);
    await sb.from("fortnox_connections")
      .update({ scopes: tokens.scope ? tokens.scope.split(" ") : [], connected_by: st.created_by })
      .eq("legal_entity_code", entity);

    const info = await fortnoxRequest(sb, entity, "GET", "/companyinformation");
    const ci = info?.CompanyInformation ?? {};
    await sb.from("fortnox_connections").update({
      fortnox_company_name: ci.CompanyName ?? null,
      fortnox_org_number: ci.OrganizationNumber ?? null,
      fortnox_database_number: ci.DatabaseNumber != null ? String(ci.DatabaseNumber) : null,
    }).eq("legal_entity_code", entity);

    return back(`connected=${entity}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("fortnox_connections").update({ status: "error", last_error: msg }).eq("legal_entity_code", entity);
    return back(`error=${encodeURIComponent(msg)}`);
  }
});
