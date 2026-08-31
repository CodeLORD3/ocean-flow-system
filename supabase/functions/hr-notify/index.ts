import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { sendSms, normalizePhoneSe } from "../_shared/sms.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function authorized(req: Request): boolean {
  const secret = Deno.env.get("HR_NOTIFY_CRON_SECRET");
  return Boolean(secret) && req.headers.get("x-cron-secret") === secret;
}

function messageFor(row: { template_key: string; body: string | null; payload: Record<string, unknown> }): string {
  if (row.body?.trim()) return row.body.trim();
  const payload = row.payload ?? {};
  const date = typeof payload.date === "string" ? ` (${payload.date})` : "";
  const labels: Record<string, string> = {
    sick_day15: "Påminnelse om sjukperiod och dag 15",
    karens_warning: "Påminnelse om karensregistrering",
    vacation_expiry: "Semesterdagar behöver planeras",
    las_warning: "Påminnelse om LAS-gräns",
  };
  return `${labels[row.template_key] ?? "Ny HR-notis"}${date}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metod stöds inte" }, 405);
  if (!authorized(req)) return json({ error: "Åtkomst nekad" }, 401);

  const db = service();
  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit") ?? 50) || 50, 1), 200);
  const now = new Date().toISOString();
  const { data: rows, error } = await db
    .from("hr_notifications")
    .select("id, recipient, channel, template_key, body, payload, attempts")
    .eq("status", "queued")
    .in("channel", ["sms", "email"])
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows ?? []) {
    const attempts = Number(row.attempts ?? 0) + 1;
    try {
      if (row.channel === "sms") {
        const phone = normalizePhoneSe(row.recipient);
        if (!phone) throw new Error("Ogiltigt svenskt mobilnummer");
        const result = await sendSms(db, {
          phone,
          type: "paminnelse",
          text: messageFor(row),
        });
        if (!result.ok) throw new Error(result.error ?? "SMS kunde inte skickas");
      } else {
        // E-post kräver en aktiverad mailtransport. Låt kön ligga kvar tills den finns,
        // istället för att markera meddelandet som skickat utan leverans.
        skipped++;
        continue;
      }

      await db.from("hr_notifications").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts,
        error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      sent++;
    } catch (e) {
      const errorText = e instanceof Error ? e.message : String(e);
      await db.from("hr_notifications").update({
        status: attempts >= 5 ? "failed" : "queued",
        attempts,
        error: errorText.slice(0, 500),
        next_attempt_at: new Date(Date.now() + Math.min(60 * 60_000, 2 ** attempts * 60_000)).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      failed++;
    }
  }

  return json({ ok: true, processed: (rows ?? []).length, sent, failed, skipped });
});
