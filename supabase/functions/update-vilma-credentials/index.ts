import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = "45ea9fee-2125-441d-95a9-b476769edcdd";
  const newEmail = "Vilma.gunnarsson@icloud.com";
  const newPassword = "Vilma123";

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    email: newEmail,
    password: newPassword,
    email_confirm: true,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, user: data.user?.email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
