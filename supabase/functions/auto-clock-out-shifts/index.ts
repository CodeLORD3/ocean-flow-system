import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Stockholm-tid: stäng allt som stämplats in före dagens början (lokal tid)
    const now = new Date();
    const localDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    // Slutet av föregående dygn (23:59:59 lokal tid) som utstämplingstid
    const startOfToday = new Date(`${localDate}T00:00:00+02:00`);
    const closeAt = new Date(startOfToday.getTime() - 1000);

    const { data, error } = await supabase
      .from("staff_shifts")
      .update({ clocked_out_at: closeAt.toISOString() })
      .is("clocked_out_at", null)
      .lt("clocked_in_at", startOfToday.toISOString())
      .select("id");

    if (error) {
      console.error("auto-clock-out failed:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ closed: data?.length ?? 0, closed_at: closeAt.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-clock-out error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
