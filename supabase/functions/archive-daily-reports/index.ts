import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Archive all non-archived purchase reports whose report_date is before today.
  // The report_date is the business date set on the report (defaults to creation
  // date but can be edited); at 00:00 we archive everything that belongs to a
  // previous day, so reports automatically fall under the date the user set.
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const { data, error } = await supabase
    .from("purchase_reports")
    .update({ archived_at: now.toISOString() })
    .is("archived_at", null)
    .lt("report_date", todayISO)
    .select("id");

  if (error) {
    console.error("Archive error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ archived: data?.length ?? 0, timestamp: now.toISOString() }),
    { headers: { "Content-Type": "application/json" } },
  );
});
