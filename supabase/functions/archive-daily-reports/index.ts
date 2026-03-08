import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Archive all non-archived purchase reports (confirmed or not) from previous days
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const { data, error } = await supabase
    .from("purchase_reports")
    .update({ archived_at: now.toISOString() })
    .is("archived_at", null)
    .lt("created_at", todayStart)
    .select("id");

  if (error) {
    console.error("Archive error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ archived: data?.length ?? 0, timestamp: now.toISOString() }),
    { headers: { "Content-Type": "application/json" } }
  );
});
