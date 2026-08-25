/**
 * Backfyller personnummer från Personalkollen till personalregistret utan att
 * lämna ut klartext till frontend eller loggar.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set([
  "https://makrilltrade.com",
  "https://www.makrilltrade.com",
  "https://ocean-flow-system.lovable.app",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.has(origin) || origin.endsWith(".lovable.app");
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://makrilltrade.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

type Row = Record<string, unknown>;

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

function nameOf(r: Row): string {
  return `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || String(r.employee_id ?? r.id ?? "okänd");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const db = service();
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(req, { error: "Inte inloggad" }, 401);

  const { data: auth } = await db.auth.getUser(token);
  const user = auth?.user;
  if (!user) return json(req, { error: "Inte inloggad" }, 401);

  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r: Row) => r.role === "admin" || r.role === "platform_admin");
  if (!ok) return json(req, { error: "Saknar behörighet" }, 403);

  const { data: rows, error } = await db
    .from("pk_staff")
    .select("id, pk_id, first_name, last_name, pnr_encrypted, employee_id")
    .not("employee_id", "is", null);
  if (error) return json(req, { error: error.message }, 500);

  const employeeIds = [...new Set((rows ?? []).map((r: Row) => String(r.employee_id)).filter(Boolean))];
  const { data: employees, error: employeeError } = await db
    .from("employees")
    .select("id, first_name, last_name, is_active, pnr_hash")
    .in("id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  if (employeeError) return json(req, { error: employeeError.message }, 500);

  const employeeById = new Map((employees ?? []).map((e: Row) => [String(e.id), e]));
  const activeIds = new Set((employees ?? []).filter((e: Row) => e.is_active !== false).map((e: Row) => String(e.id)));
  const alreadyWithHash = new Set((employees ?? []).filter((e: Row) => e.pnr_hash).map((e: Row) => String(e.id)));

  let attempted = 0;
  let updated = 0;
  const missing: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; reason: string }[] = [];
  const touched = new Set<string>();

  for (const row of rows ?? []) {
    const employeeId = String(row.employee_id ?? "");
    if (!employeeId || touched.has(employeeId)) continue;
    const employee = employeeById.get(employeeId);
    if (!employee) {
      skipped.push(`${nameOf(row)}: saknar personalrad`);
      continue;
    }
    if (!activeIds.has(employeeId)) continue;
    if (alreadyWithHash.has(employeeId)) {
      touched.add(employeeId);
      continue;
    }

    const source = (rows ?? []).find((r: Row) => String(r.employee_id) === employeeId && r.pnr_encrypted);
    if (!source?.pnr_encrypted) {
      missing.push(nameOf(employee));
      touched.add(employeeId);
      continue;
    }

    attempted++;
    try {
      const pnr = await decryptPnr(String(source.pnr_encrypted));
      const { error: rpcError } = await db.rpc("service_set_employee_pnr", {
        _employee_id: employeeId,
        _pnr: pnr,
      });
      if (rpcError) throw new Error(rpcError.message);
      updated++;
    } catch (e) {
      failed.push({ name: nameOf(employee), reason: (e as Error).message });
    }
    touched.add(employeeId);
  }

  await db.from("activity_logs").insert({
    action_type: "update",
    description: `Personnummer backfyllt från Personalkollen: ${updated}/${attempted}`,
    entity_type: "employees",
    entity_id: "personalkollen-backfill-pnr",
    user_id: user.id,
  });

  return json(req, {
    ok: failed.length === 0,
    employees_seen: employeeIds.length,
    already_with_pnr_hash: alreadyWithHash.size,
    attempted,
    updated,
    missing_pnr: missing.sort((a, b) => a.localeCompare(b, "sv")),
    skipped,
    failed,
  });
});
