/** Aktiverar en klockstation med aktiveringskod och returnerar en sessionstoken. */
import {
  clockCodeHash,
  corsHeaders,
  json,
  randomToken,
  service,
  SESSION_TTL_MINUTES,
  sessionTokenHash,
} from "../_shared/clock.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "Ogiltig förfrågan" }, 400);
  }

  const code = String(body.activation_code ?? "").trim();
  if (code.length < 8) {
    return json(req, { error: "Ange en giltig aktiveringskod (minst 8 tecken)." }, 400);
  }

  const db = service();
  const hash = await clockCodeHash(code);
  const { data: station } = await db
    .from("clock_stations")
    .select("id, name, store_id, status, profile")
    .eq("activation_code_hash", hash)
    .maybeSingle();

  if (!station) return json(req, { error: "Aktiveringskoden gäller inte." }, 401);
  if (station.status !== "active") {
    return json(req, { error: "Stationen är återkallad. Kontakta administratör." }, 403);
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60_000).toISOString();
  const { error } = await db.from("clock_station_sessions").insert({
    station_id: station.id,
    token_hash: await sessionTokenHash(token),
    expires_at: expiresAt,
  });
  if (error) return json(req, { error: "Kunde inte aktivera stationen." }, 500);

  await db.from("clock_stations").update({ last_seen_at: new Date().toISOString() }).eq("id", station.id);

  let storeName: string | null = null;
  if (station.store_id) {
    const { data: store } = await db.from("stores").select("name").eq("id", station.store_id).maybeSingle();
    storeName = (store?.name as string | undefined) ?? null;
  }

  return json(req, {
    session_token: token,
    expires_at: expiresAt,
    station: {
      id: station.id,
      name: station.name,
      store_name: storeName,
      profile: station.profile,
    },
  });
});
