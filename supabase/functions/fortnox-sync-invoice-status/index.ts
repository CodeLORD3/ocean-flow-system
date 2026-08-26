// Speglar fakturans verkliga status från Fortnox till fortnox_invoice_jobs.
import { adminClient, requireUser, json, corsHeaders, fortnoxRequest } from "../_shared/fortnox.ts";

function statusFromInvoice(inv: any): string {
  if (inv.Cancelled === true) return "cancelled";
  const balance = Number(inv.Balance ?? 0);
  if (inv.Booked === true && balance === 0) return "paid";
  if (inv.Sent === true) return "sent";
  if (inv.Booked === true) return "bookkept";
  return "created";
}

async function syncOne(sb: any, job: any) {
  const inv = (await fortnoxRequest(sb, job.legal_entity_code, "GET", `/invoices/${job.fortnox_document_number}`)).Invoice;
  const newStatus = statusFromInvoice(inv);
  const patch: Record<string, unknown> = {
    fortnox_booked: inv.Booked === true,
    fortnox_sent: inv.Sent === true,
    fortnox_cancelled: inv.Cancelled === true,
    fortnox_balance: inv.Balance != null ? Number(inv.Balance) : null,
    fortnox_total: inv.Total != null ? Number(inv.Total) : null,
    final_pay_date: inv.FinalPayDate || null,
    status_synced_at: new Date().toISOString(),
  };
  if (newStatus !== job.status) patch.status = newStatus;
  // Annullering hanteras separat – här bara statusen, ingen reversering.
  await sb.from("fortnox_invoice_jobs").update(patch).eq("id", job.id);
  return { order_id: job.order_id, document_number: job.fortnox_document_number, status: newStatus };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = adminClient();
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

  let query = sb.from("fortnox_invoice_jobs").select("*").not("fortnox_document_number", "is", null);

  if (!isCron) {
    const user = await requireUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { order_id } = await req.json().catch(() => ({}));
    if (!order_id) return json({ error: "order_id saknas" }, 400);
    query = query.eq("order_id", order_id);
  } else {
    query = query.in("status", ["created", "bookkept", "sent"]).limit(200);
  }

  const { data: jobs, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results: unknown[] = [];
  for (const job of jobs ?? []) {
    try {
      results.push(await syncOne(sb, job));
    } catch (e) {
      results.push({ order_id: job.order_id, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ synced_at: new Date().toISOString(), results });
});
