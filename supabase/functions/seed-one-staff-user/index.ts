// Engångsfunktion: skapar ETT personalkonto och kopplar det till befintlig
// staff-rad + behörighet i user_scopes. Rör inga andra konton.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

Deno.serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const { email, password, staff_id, portals = ["shop"], store_ids = [] } = await req.json();
  const out: Record<string, unknown> = { email };

  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users.find((u) => u.email?.toLowerCase() === String(email).toLowerCase());

  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    user = data.user!;
    out.account = "created";
  } else {
    const { error } = await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    out.account = error ? `update-failed: ${error.message}` : "password-reset";
  }

  const { error: linkErr } = await sb
    .from("staff")
    .update({ user_id: user.id, email, must_change_password: true })
    .eq("id", staff_id);
  out.link = linkErr ? `error: ${linkErr.message}` : "linked";

  await sb.from("user_scopes").delete().eq("user_id", user.id).in("scope_type", ["portal", "store"]);
  const rows = [
    ...portals.map((p: string) => ({ user_id: user!.id, scope_type: "portal", scope_value: p })),
    ...store_ids.map((s: string) => ({ user_id: user!.id, scope_type: "store", scope_value: s })),
  ];
  if (rows.length) {
    const { error } = await sb.from("user_scopes").upsert(rows, { onConflict: "user_id,scope_type,scope_value" });
    out.scopes = error ? `error: ${error.message}` : rows.length;
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
