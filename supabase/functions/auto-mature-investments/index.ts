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

    // Calculate 7 days from now
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const sevenDaysDate = sevenDaysFromNow.toISOString().split("T")[0];

    // 1. Find Active pledges maturing in exactly 7 days → send reminder
    const { data: reminderPledges } = await supabase
      .from("pledges")
      .select("id, amount, offer_id, trade_offers!inner(title, maturity_date, interest_rate)")
      .eq("status", "Active")
      .eq("trade_offers.maturity_date", sevenDaysDate);

    if (reminderPledges && reminderPledges.length > 0) {
      for (const pledge of reminderPledges) {
        const offer = (pledge as any).trade_offers;
        const rate = Number(offer.interest_rate || 0);
        const expectedPayout = Math.round(Number(pledge.amount) * (1 + rate / 100));
        await supabase.from("notifications").insert({
          portal: "investor",
          target_page: "/portal/portfolio",
          message: `Your investment in "${offer.title}" matures in 7 days. Expected payout: ${expectedPayout.toLocaleString()} kr.`,
          entity_type: "pledge",
          entity_id: pledge.id,
        });
      }
    }

    // 2. Find all Active pledges whose offer maturity_date <= today → mature them
    const { data: activePledges, error: fetchErr } = await supabase
      .from("pledges")
      .select("id, amount, offer_id, trade_offers!inner(title, maturity_date, interest_rate)")
      .eq("status", "Active")
      .lte("trade_offers.maturity_date", today);

    if (fetchErr) throw fetchErr;

    if (!activePledges || activePledges.length === 0) {
      return new Response(JSON.stringify({ matured: 0, reminders: reminderPledges?.length || 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Update pledges to Matured
    const pledgeIds = activePledges.map((p: any) => p.id);
    const { error: updateErr } = await supabase
      .from("pledges")
      .update({ status: "Matured" })
      .in("id", pledgeIds);

    if (updateErr) throw updateErr;

    // 4. Update corresponding offers to Matured status
    const offerIds = [...new Set(activePledges.map((p: any) => p.offer_id))];
    const { error: offerErr } = await supabase
      .from("trade_offers")
      .update({ status: "Matured" })
      .in("id", offerIds)
      .eq("status", "Funded");

    if (offerErr) throw offerErr;

    // 5. Create notifications for matured investments
    for (const pledge of activePledges) {
      const offer = (pledge as any).trade_offers;
      const rate = Number(offer.interest_rate || 0);
      const expectedPayout = Math.round(Number(pledge.amount) * (1 + rate / 100));
      await supabase.from("notifications").insert({
        portal: "investor",
        target_page: "/portal/portfolio",
        message: `"${offer.title}" has matured. Payout of ${expectedPayout.toLocaleString()} kr is being processed.`,
        entity_type: "pledge",
        entity_id: pledge.id,
      });
    }

    return new Response(
      JSON.stringify({
        matured: pledgeIds.length,
        offers_matured: offerIds.length,
        reminders: reminderPledges?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
