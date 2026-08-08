import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Vem anropar? JWT valideras i koden (verify_jwt är av).
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Inte inloggad" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: "Ogiltig session" }, 401);
    const callerId = userData.user.id;

    // 2. Bara admin får byta någon annans inloggningsadress.
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", callerId).eq("role", "admin");
    const { data: callerStaff } = await admin
      .from("staff").select("portal_access").eq("user_id", callerId).maybeSingle();
    const isAdmin =
      (roleRows?.length ?? 0) > 0 ||
      ((callerStaff?.portal_access ?? []) as string[]).includes("admin");
    if (!isAdmin) return json({ error: "Endast admin kan ändra inloggningsadress" }, 403);

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
      const { error } = await admin.auth.admin.updateUserById(authUserId, {
        email,
        email_confirm: true,
        ...(password ? { password } : {}),
      });
      if (error) return json({ error: error.message }, 400);
    } else {
      // Inget konto ännu: skapa ett så adressen faktiskt kan användas för inloggning.
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password: password ?? "Byt123!",
        email_confirm: true,
        user_metadata: {
          first_name: staffRow.first_name,
          last_name: staffRow.last_name,
        },
      });
      if (error) return json({ error: error.message }, 400);
      authUserId = created.user!.id;
    }

    const { error: upErr } = await admin
      .from("staff").update({ email, user_id: authUserId }).eq("id", staffId);
    if (upErr) return json({ error: upErr.message }, 400);

    return json({ ok: true, email, user_id: authUserId, created_password: !!password });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Okänt fel" }, 500);
  }
});
