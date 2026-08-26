// Anropas av pg_cron var 6:e timme. Skyddad med x-cron-secret.
import { adminClient, getAccessToken, json } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);

  const sb = adminClient();
  const { data: conns } = await sb.from("fortnox_connections").select("legal_entity_code").eq("status", "connected");
  const results: Array<{ entity: string; ok: boolean; error?: string }> = [];

  for (const c of conns ?? []) {
    try {
      await getAccessToken(sb, c.legal_entity_code, true);
      results.push({ entity: c.legal_entity_code, ok: true });
    } catch (e) {
      results.push({ entity: c.legal_entity_code, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ refreshed_at: new Date().toISOString(), results });
});
