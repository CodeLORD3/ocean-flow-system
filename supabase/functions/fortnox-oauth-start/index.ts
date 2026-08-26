import { adminClient, requireUser, json, corsHeaders, FORTNOX_AUTH_URL, FORTNOX_SCOPES, LEGAL_ENTITIES } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { legal_entity_code } = await req.json().catch(() => ({}));
  if (!legal_entity_code || !LEGAL_ENTITIES[legal_entity_code]) return json({ error: "Okänt bolag" }, 400);

  const sb = adminClient();
  const state = crypto.randomUUID();

  await sb.from("fortnox_connections").upsert(
    { legal_entity_code, legal_entity_name: LEGAL_ENTITIES[legal_entity_code] },
    { onConflict: "legal_entity_code", ignoreDuplicates: true },
  );
  const { error } = await sb.from("fortnox_oauth_states").insert({
    state,
    legal_entity_code,
    created_by: user.id,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return json({ error: error.message }, 500);

  const url = new URL(FORTNOX_AUTH_URL);
  url.searchParams.set("client_id", Deno.env.get("FORTNOX_CLIENT_ID")!);
  url.searchParams.set("redirect_uri", Deno.env.get("FORTNOX_REDIRECT_URI")!);
  url.searchParams.set("scope", FORTNOX_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("account_type", "service");

  return json({ url: url.toString() });
});
