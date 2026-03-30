import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date().toISOString().split("T")[0];

    // 1. Find all Active pledges whose offer maturity_date <= today
    const { data: activePledges, error: fetchErr } = await supabase
      .from("pledges")
      .select("id, offer_id, trade_offers!inner(maturity_date)")
      .eq("status", "Active")
      .lte("trade_offers.maturity_date", today);

    if (fetchErr) throw fetchErr;

    if (!activePledges || activePledges.length === 0) {
      return new Response(JSON.stringify({ matured: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Update pledges to Matured
    const pledgeIds = activePledges.map((p: any) => p.id);
    const { error: updateErr } = await supabase
      .from("pledges")
      .update({ status: "Matured" })
      .in("id", pledgeIds);

    if (updateErr) throw updateErr;

    // 3. Update corresponding offers to Matured status
    const offerIds = [...new Set(activePledges.map((p: any) => p.offer_id))];
    const { error: offerErr } = await supabase
      .from("trade_offers")
      .update({ status: "Matured" })
      .in("id", offerIds)
      .eq("status", "Funded");

    if (offerErr) throw offerErr;

    // 4. Create notifications for investors
    for (const pledge of activePledges) {
      await supabase.from("notifications").insert({
        portal: "investor",
        target_page: "/portal/portfolio",
        message: "Your investment has matured — payout is being processed.",
        entity_type: "pledge",
        entity_id: pledge.id,
      });
    }

    return new Response(
      JSON.stringify({ matured: pledgeIds.length, offers_matured: offerIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
