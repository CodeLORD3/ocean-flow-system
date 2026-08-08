import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Engångsjobb: sätt Ewa Ahlanders inloggningsadress.
const STAFF_ID = "8d39aaa7-82b5-402a-afe3-d7f200abe282";
const USER_ID = "e4f116fc-851d-48c2-8181-d91ee0e821c1";
const EMAIL = "ewa.ahlander@hotmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { error } = await admin.auth.admin.updateUserById(USER_ID, {
    email: EMAIL,
    email_confirm: true,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  await admin.from("staff").update({ email: EMAIL }).eq("id", STAFF_ID);

  return new Response(JSON.stringify({ ok: true, email: EMAIL }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
