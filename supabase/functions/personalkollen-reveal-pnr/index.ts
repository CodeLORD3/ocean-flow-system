/**
 * Visar fullständigt personnummer för en Personalkollen-anställd.
 *
 * Kräver inloggad användare med rollen admin eller platform_admin. Varje visning
 * skrivs i aktivitetsloggen. Krypteringsnyckeln (PK_PNR_KEY) når aldrig frontend.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function decryptPnr(payload: string): Promise<string> {
  const secret = Deno.env.get("PK_PNR_KEY");
  if (!secret) throw new Error("PK_PNR_KEY saknas");
  const [ivB64, dataB64] = payload.split(":");
  if (!ivB64 || !dataB64) throw new Error("Ogiltigt krypterat värde");
  const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const key = await crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["decrypt"]);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(ivB64) }, key, bytes(dataB64));
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = service();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Inte inloggad" }, 401);
  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json({ error: "Inte inloggad" }, 401);

  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r) => r.role === "admin" || r.role === "platform_admin");
  if (!ok) return json({ error: "Saknar behörighet" }, 403);

  const body = await req.json().catch(() => ({}));
  const id = typeof body.pk_staff_id === "string" ? body.pk_staff_id : "";
  if (!id) return json({ error: "pk_staff_id krävs" }, 400);

  const { data: row, error } = await db
    .from("pk_staff")
    .select("id, first_name, last_name, pnr_encrypted")
    .eq("id", id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!row?.pnr_encrypted) return json({ error: "Personnummer saknas" }, 404);

  let value: string;
  try {
    value = await decryptPnr(String(row.pnr_encrypted));
  } catch (e) {
    return json({ error: String((e as Error).message) }, 500);
  }

  await db.from("activity_logs").insert({
    action_type: "read",
    description: `Personnummer visat: ${row.first_name ?? ""} ${row.last_name ?? ""}`.trim(),
    entity_type: "pk_staff",
    entity_id: row.id,
    user_id: user.id,
  });
  await db.from("pnr_access_log").insert({
    accessed_by: user.id,
    employee_id: null,
    inspector_session_id: typeof body.inspector_session_id === "string" ? body.inspector_session_id : null,
    reason: typeof body.reason === "string" ? body.reason.slice(0, 300) : "Administrativ visning",
  });

  return json({ personal_identification_number: value });
});
