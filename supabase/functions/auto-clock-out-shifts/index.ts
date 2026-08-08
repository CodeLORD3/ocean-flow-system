import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Stänger alla stämplingar som startade före dagens datum (Stockholm-tid).
 *
 * Självläkande: den tittar inte bara på gårdagen, utan på allt som ligger kvar
 * öppet från en tidigare dag. Varje pass stängs vid slutet av sitt eget dygn,
 * så en missad natt ger inte felaktigt långa arbetspass.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const localDate = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Stockholm",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const startOfToday = new Date(`${localDate}T00:00:00+02:00`);

    const { data: openRows, error: readErr } = await supabase
      .from("staff_shifts")
      .select("id, clocked_in_at")
      .is("clocked_out_at", null)
      .lt("clocked_in_at", startOfToday.toISOString());

    if (readErr) {
      console.error("auto-clock-out read failed:", readErr.message);
      return new Response(JSON.stringify({ error: readErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const closed: { id: string; closed_at: string }[] = [];

    for (const row of openRows ?? []) {
      // Slutet av passets EGET dygn i Stockholm-tid.
      const shiftDay = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(row.clocked_in_at));
      const closeAt = new Date(`${shiftDay}T23:59:59+02:00`);

      const { error } = await supabase
        .from("staff_shifts")
        .update({ clocked_out_at: closeAt.toISOString() })
        .eq("id", row.id);

      if (error) {
        console.error(`auto-clock-out failed for shift ${row.id}:`, error.message);
        return new Response(JSON.stringify({ error: error.message, shift_id: row.id }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      closed.push({ id: row.id, closed_at: closeAt.toISOString() });
    }

    return new Response(JSON.stringify({ closed: closed.length, shifts: closed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("auto-clock-out error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
