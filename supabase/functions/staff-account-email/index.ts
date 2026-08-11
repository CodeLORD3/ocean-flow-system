import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const IS_OPAQUE = SERVICE_KEY.startsWith("sb_");

// Databasklient med serviceidentitet. Opaka nycklar skickas endast som apikey.
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: IS_OPAQUE
      ? { apikey: SERVICE_KEY }
      : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Direkta anrop mot Auth Admin API så att opaka nycklar hanteras korrekt.
async function authAdmin(path: string, method: string, body?: unknown) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { message: text };
  }
  return { ok: res.ok, status: res.status, data: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Vem anropar? JWT valideras i koden (verify_jwt är av).
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Inte inloggad" }, 401);

    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      console.error("getClaims failed", claimsErr?.message);
      return json({ error: "Ogiltig session" }, 401);
    }
    const callerId = claimsData.claims.sub as string;

    // 2. Behörighet: admin-roll eller portalscope admin/wholesale.
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
    const { data: scopeRows, error: scopeErr } = await admin
      .from("user_scopes").select("scope_value")
      .eq("user_id", callerId).eq("scope_type", "portal")
      .in("scope_value", ["admin", "wholesale"]);
    if (roleErr || scopeErr) {
      console.error("permission lookup failed", roleErr?.message, scopeErr?.message);
      return json({ error: "Kunde inte läsa behörighet" }, 500);
    }
    const isAdmin = (roleRows?.length ?? 0) > 0 || (scopeRows?.length ?? 0) > 0;
    if (!isAdmin) return json({ error: "Endast admin kan skapa/ändra inloggning" }, 403);

    // 3. Indata
    const body = await req.json().catch(() => ({}));
    const staffId = typeof body.staff_id === "string" ? body.staff_id : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" && body.password.length >= 6
      ? body.password
      : undefined;
    if (!staffId) return json({ error: "staff_id saknas" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Ogiltig e-postadress" }, 400);

    const { data: staffRow, error: staffErr } = await admin
      .from("staff").select("id, user_id, first_name, last_name, email").eq("id", staffId).maybeSingle();
    if (staffErr) return json({ error: staffErr.message }, 400);
    if (!staffRow) return json({ error: "Personalkortet hittades inte" }, 404);

    let authUserId = staffRow.user_id as string | null;

    if (authUserId) {
      const res = await authAdmin(`/users/${authUserId}`, "PUT", {
        email,
        email_confirm: true,
        ...(password ? { password } : {}),
      });
      if (!res.ok) {
        console.error("updateUser failed", res.status, JSON.stringify(res.data));
        return json({ error: res.data?.msg || res.data?.message || "Kunde inte uppdatera kontot" }, 400);
      }
    } else {
      const res = await authAdmin("/users", "POST", {
        email,
        password: password ?? "Byt123!",
        email_confirm: true,
        user_metadata: { first_name: staffRow.first_name, last_name: staffRow.last_name },
      });
      if (res.ok && res.data?.id) {
        authUserId = res.data.id as string;
      } else {
        // Kontot kan redan finnas i auth utan koppling till personalkortet.
        const existing = await authAdmin(`/users?page=1&per_page=1&filter=${encodeURIComponent(email)}`, "GET");
        const match = existing.data?.users?.find(
          (u: any) => (u.email ?? "").toLowerCase() === email,
        );
        if (!match) {
          console.error("createUser failed", res.status, JSON.stringify(res.data));
          return json({ error: res.data?.msg || res.data?.message || "Kunde inte skapa kontot" }, 400);
        }
        authUserId = match.id as string;
        if (password) {
          const upd = await authAdmin(`/users/${authUserId}`, "PUT", { password, email_confirm: true });
          if (!upd.ok) console.error("password reset failed", upd.status, JSON.stringify(upd.data));
        }
      }
    }

    const { error: upErr } = await admin
      .from("staff").update({ email, user_id: authUserId }).eq("id", staffId);
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ ok: true, email, user_id: authUserId, created_password: !!password });
  } catch (e) {
    console.error("unhandled", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Okänt fel" }, 500);
  }
});
