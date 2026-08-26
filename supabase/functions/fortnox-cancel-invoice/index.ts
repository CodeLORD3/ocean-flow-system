// Annullerar ett Fortnox-utkast och reverserar lageruttaget i Makrilltrade.
import { adminClient, requireUser, json, corsHeaders, fortnoxRequest } from "../_shared/fortnox.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId: string | undefined = body?.order_id;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "order_id (uuid) krävs" }, 400);

  const sb = adminClient();

  const { data: job, error: jErr } = await sb
    .from("fortnox_invoice_jobs")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (jErr) return json({ error: jErr.message }, 500);
  if (!job || !job.fortnox_document_number) return json({ error: "Ingen faktura i Fortnox för denna order" }, 404);
  if (job.status === "cancelled") {
    return json({ ok: true, already: true, document_number: job.fortnox_document_number });
  }

  const nr = job.fortnox_document_number;
  const entity = job.legal_entity_code;

  const fail = async (msg: string, status = 500) => {
    await sb.from("fortnox_invoice_jobs").update({ last_error: msg }).eq("id", job.id);
    return json({ error: msg }, status);
  };

  try {
    const inv = (await fortnoxRequest<any>(sb, entity, "GET", `/invoices/${nr}`)).Invoice;

    if (inv?.Booked === true) {
      return json(
        { error: `Faktura ${nr} är bokförd i Fortnox och kan inte annulleras. Skapa kreditfaktura.` },
        409,
      );
    }

    if (inv?.Cancelled !== true) {
      await fortnoxRequest(sb, entity, "PUT", `/invoices/${nr}/cancel`);
    }

    const { error: rErr } = await sb.rpc("fortnox_on_invoice_cancelled", {
      p_order_id: orderId,
      p_entity: entity,
      p_document_number: String(nr),
    });
    if (rErr) return await fail(`Annullerad i Fortnox men lagerreversering misslyckades: ${rErr.message}`);

    await sb.from("fortnox_invoice_jobs").update({
      status: "cancelled",
      fortnox_cancelled: true,
      cancelled_at: new Date().toISOString(),
      last_error: null,
    }).eq("id", job.id);

    return json({ ok: true, document_number: String(nr), status: "cancelled" });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
