// One-off seeder that creates auth users for the 6 staff members and links
// them to their staff records with portal_access + allowed_store_id.
// Safe to re-run: existing users get their password reset and links updated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ZOLLIKON_STORE_ID = "93adfded-5d68-41e3-9b00-c3b3db4f5ee4";

const USERS = [
  { email: "info@fiskskaldjur.ch",     password: "Anna123",    first: "Anna",    portals: ["shop"],                          store: ZOLLIKON_STORE_ID },
  { email: "info@fiskskaldjur.se",     password: "Robin123",   first: "Robin",   portals: ["wholesale", "production"],       store: null },
  { email: "timhvarfvenius@gmail.com", password: "Tim123",     first: "Tim",     portals: ["shop", "wholesale", "production"], store: null },
  { email: "joakim@fiskskaldjur.ch",   password: "Joakim123",  first: "Joakim",  portals: ["shop", "wholesale", "production"], store: null },
  { email: "baldvin@fiskskaldjur.se",  password: "Baldvin123", first: "Baldvin", portals: ["shop", "wholesale", "production"], store: null },
  { email: "mensur@fiskskaldjur.se",   password: "Mensur123",  first: "Mensur",  portals: ["production"],                    store: null },
];

Deno.serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const results: any[] = [];

  // Fetch all users once
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });

  for (const u of USERS) {
    let user = list?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

    if (!user) {
      const { data, error } = await sb.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
      });
      if (error) {
        results.push({ email: u.email, status: "create-failed", error: error.message });
        continue;
      }
      user = data.user!;
      results.push({ email: u.email, status: "created" });
    } else {
      const { error } = await sb.auth.admin.updateUserById(user.id, {
        password: u.password,
        email_confirm: true,
      });
      results.push({ email: u.email, status: error ? "update-failed" : "password-reset", error: error?.message });
    }

    // Find staff row by first_name
    const { data: staffRows } = await sb
      .from("staff")
      .select("id")
      .ilike("first_name", u.first)
      .limit(1);

    if (staffRows && staffRows.length) {
      const { error: e2 } = await sb
        .from("staff")
        .update({
          user_id: user!.id,
          portal_access: u.portals,
          allowed_store_id: u.store,
          email: u.email,
        })
        .eq("id", staffRows[0].id);
      results.push({ email: u.email, link: e2 ? `error: ${e2.message}` : "linked" });
    } else {
      results.push({ email: u.email, link: "no staff row found" });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
