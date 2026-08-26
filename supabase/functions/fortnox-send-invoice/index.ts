import { adminClient, requireUser, fortnoxRequest, FortnoxError, json, corsHeaders } from "../_shared/fortnox.ts";

type Row = {
  product_id: string | null;
  article_number: string;
  description: string;
  quantity: number;
  unit: string | null;
  price: number;
  vat_rate: number | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId: string | undefined = body?.order_id;
  const dryRun = body?.dry_run === true;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "order_id (uuid) krävs" }, 400);

  const sb = adminClient();

  // 1) Bygg underlag från databasen
  const { data: input, error: bErr } = await sb.rpc("fortnox_build_invoice_input", { p_order_id: orderId });
  if (bErr) return json({ error: bErr.message }, 400);
  const inp = input as any;
  const entity: string = inp.legal_entity_code;
  const rows: Row[] = inp.rows ?? [];

  if (!inp.customer_number) {
    return json({ error: "Kunden saknar Fortnox-koppling. Matcha kunden på Fortnox-sidan först." }, 409);
  }
  if (rows.length === 0) return json({ error: "Ordern har inga fakturerbara rader" }, 409);

  const idempotencyKey = `MKR-${inp.order_number ?? orderId.slice(0, 8)}`;

  const payload = {
    Invoice: {
      CustomerNumber: String(inp.customer_number),
      InvoiceDate: inp.invoice_date,
      DueDate: inp.due_date,
      Currency: inp.currency,
      VATIncluded: inp.vat_included === true,
      OurReference: inp.our_reference ?? undefined,
      YourReference: inp.your_reference ?? undefined,
      Remarks: inp.remarks ?? undefined,
      ExternalInvoiceReference1: idempotencyKey,
      InvoiceRows: rows.map((r) => ({
        ArticleNumber: r.article_number,
        Description: r.description?.slice(0, 50),
        DeliveredQuantity: Number(r.quantity).toFixed(3),
        Price: Number(r.price),
        VAT: r.vat_rate ?? 25,
      })),
    },
  };

  if (dryRun) return json({ ok: true, dry_run: true, legal_entity_code: entity, idempotency_key: idempotencyKey, payload });

  // 2) Idempotent jobb
  const { data: job, error: jErr } = await sb
    .from("fortnox_invoice_jobs")
    .upsert(
      {
        order_id: orderId,
        legal_entity_code: entity,
        idempotency_key: idempotencyKey,
        request_payload: payload,
        created_by: user.id,
        status: "sending",
      },
      { onConflict: "idempotency_key" },
    )
    .select()
    .single();
  if (jErr) return json({ error: jErr.message }, 500);

  if (job.status === "sent" && job.fortnox_document_number) {
    return json({ ok: true, already_sent: true, document_number: job.fortnox_document_number, url: job.fortnox_url });
  }

  const fail = async (msg: string, status = 502) => {
    await sb.from("fortnox_invoice_jobs")
      .update({ status: "error", last_error: msg, attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id);
    return json({ error: msg }, status);
  };

  try {
    // 3) Säkerställ artiklar i Fortnox (SERVICE, inget lager i Fortnox)
    for (const r of rows) {
      const { data: mapped } = await sb.from("fortnox_article_map")
        .select("fortnox_article_number")
        .eq("legal_entity_code", entity)
        .eq("product_id", r.product_id ?? "")
        .maybeSingle();
      if (mapped?.fortnox_article_number) {
        r.article_number = mapped.fortnox_article_number;
        continue;
      }
      let exists = true;
      try {
        await fortnoxRequest(sb, entity, "GET", `/articles/${encodeURIComponent(r.article_number)}`);
      } catch (e) {
        if (e instanceof FortnoxError && e.status === 404) exists = false;
        else throw e;
      }
      if (!exists) {
        await fortnoxRequest(sb, entity, "POST", "/articles", {
          Article: {
            ArticleNumber: r.article_number,
            Description: r.description?.slice(0, 50) ?? "Vara",
            Type: "SERVICE",
            StockGoods: false,
            Active: true,
            EAN: r.ean ?? undefined,
          },
        });
      }
      if (r.product_id) {
        await sb.from("fortnox_article_map").upsert(
          { legal_entity_code: entity, product_id: r.product_id, fortnox_article_number: r.article_number },
          { onConflict: "legal_entity_code,product_id" },
        );
      }
    }
    payload.Invoice.InvoiceRows = rows.map((r) => ({
      ArticleNumber: r.article_number,
      Description: r.description?.slice(0, 50),
      DeliveredQuantity: Number(r.quantity).toFixed(3),
      Price: Number(r.price),
      VAT: r.vat_rate ?? 25,
    }));

    // 4) Skapa faktura – kolla först om nyckeln redan finns hos Fortnox
    let doc: string | null = null;
    const existing = await fortnoxRequest<any>(
      sb, entity, "GET",
      `/invoices?externalinvoicereference1=${encodeURIComponent(idempotencyKey)}`,
    ).catch(() => null);
    const found = existing?.Invoices?.[0];
    if (found?.DocumentNumber) {
      doc = String(found.DocumentNumber);
    } else {
      const created = await fortnoxRequest<any>(sb, entity, "POST", "/invoices", payload);
      doc = created?.Invoice?.DocumentNumber != null ? String(created.Invoice.DocumentNumber) : null;
      if (!doc) return await fail("Fortnox returnerade ingen fakturanummer");
    }

    // 5) Bokför lager i Makrilltrade (idempotent i DB-funktionen)
    const { error: sErr } = await sb.rpc("fortnox_on_invoice_created", {
      p_order_id: orderId, p_entity: entity, p_document_number: doc,
    });

    const url = `https://apps.fortnox.se/fi/?sid=${doc}`;
    await sb.from("fortnox_invoice_jobs").update({
      status: "sent",
      fortnox_document_number: doc,
      fortnox_url: url,
      stock_booked_at: sErr ? null : new Date().toISOString(),
      last_error: sErr ? `Faktura skapad men lagerbokning misslyckades: ${sErr.message}` : null,
      attempts: (job.attempts ?? 0) + 1,
    }).eq("id", job.id);

    return json({ ok: true, document_number: doc, url, stock_booked: !sErr, stock_error: sErr?.message ?? null });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
