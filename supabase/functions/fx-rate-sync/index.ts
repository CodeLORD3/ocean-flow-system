// Hämtar dagliga växelkurser (dagens snitt enligt ECB via frankfurter.app) och
// sparar dem så att CHF-omsättning kan visas i SEK.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IS_OPAQUE = SERVICE_KEY.startsWith("sb_");

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    headers: IS_OPAQUE
      ? { apikey: SERVICE_KEY }
      : { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const base = String(body.base ?? "CHF").toUpperCase();
    const quote = String(body.quote ?? "SEK").toUpperCase();
    const today = isoDate(new Date());
    const start = typeof body.from === "string" ? body.from : isoDate(new Date(Date.now() - 90 * 864e5));
    const end = typeof body.to === "string" ? body.to : today;

    // frankfurter.app ger ECB:s dagliga referenskurs (dagens snittkurs).
    const res = await fetch(
      `https://api.frankfurter.app/${start}..${end}?from=${base}&to=${quote}`,
    );
    if (!res.ok) return json({ error: `Kursdata svarade ${res.status}` }, 502);
    const data = await res.json();
    const rates: Record<string, Record<string, number>> = data?.rates ?? {};

    const rows = Object.entries(rates)
      .map(([date, r]) => ({
        rate_date: date,
        base_currency: base,
        quote_currency: quote,
        rate: Number(r?.[quote]),
        source: "ECB dagskurs (frankfurter.app)",
      }))
      .filter((r) => Number.isFinite(r.rate) && r.rate > 0);

    if (rows.length === 0) return json({ ok: true, saved: 0 });

    const { error } = await admin
      .from("fx_daily_rates")
      .upsert(rows, { onConflict: "rate_date,base_currency,quote_currency" });
    if (error) return json({ error: error.message }, 400);

    return json({ ok: true, saved: rows.length, from: start, to: end, base, quote });
  } catch (e) {
    console.error("fx-rate-sync", e instanceof Error ? e.message : e);
    return json({ error: e instanceof Error ? e.message : "Okänt fel" }, 500);
  }
});
