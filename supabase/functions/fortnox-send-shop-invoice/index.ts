// Skickar en butiksorder (shop_orders) till Fortnox som fakturautkast.
// Säljare är Grossist Göteborg (FSAB SE); kund är butikens Fortnox-kundnummer.
// Lagret flyttas redan vid packning/överföring, därför bokas inget lager här.
import { adminClient, requireUser, fortnoxRequest, FortnoxError, json, corsHeaders } from "../_shared/fortnox.ts";

type Row = {
  product_id: string | null;
  article_number: string;
  description: string;
  quantity: number;
  unit: string | null;
  price: number;
  vat_rate: number | null;
  ean?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await requireUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId: string | undefined = body?.order_id;
  const dryRun = body?.dry_run === true;
  const sendEmail = body?.send_email === true;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: "order_id (uuid) krävs" }, 400);

  const sb = adminClient();

  const { data: input, error: bErr } = await sb.rpc("fortnox_build_shop_invoice_input", { p_order_id: orderId });
  if (bErr) return json({ error: bErr.message }, 400);
  const inp = input as any;
  const entity: string = inp.legal_entity_code;
  const rows: Row[] = inp.rows ?? [];

  if (!inp.customer_number) {
    return json({ error: "Butiken saknar Fortnox-kundnummer. Ange det på Fakturor-sidan först." }, 409);
  }
  if (rows.length === 0) return json({ error: "Butiksordern har inga levererade rader" }, 409);

  let idempotencyKey = `MKR-SHOP-${orderId}`;

  const invoiceRows = () =>
    rows.map((r) => ({
      ArticleNumber: r.article_number,
      Description: r.description?.slice(0, 50),
      DeliveredQuantity: Number(r.quantity).toFixed(3),
      Price: Number(r.price),
      VAT: r.vat_rate ?? 25,
    }));

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
      ExternalInvoiceReference2: inp.order_number ? String(inp.order_number) : undefined,
      InvoiceRows: invoiceRows(),
    },
  };

  if (dryRun) {
    return json({ ok: true, dry_run: true, legal_entity_code: entity, idempotency_key: idempotencyKey, payload });
  }

  const { data: priorJobs } = await sb
    .from("fortnox_invoice_jobs")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  const prior = priorJobs?.[0] ?? null;

  if (prior?.fortnox_document_number && ["created", "bookkept", "sent", "paid"].includes(prior.status)) {
    return json({
      ok: true,
      already: true,
      already_sent: true,
      status: prior.status,
      document_number: prior.fortnox_document_number,
      url: prior.fortnox_url,
    });
  }

  // Samtidighetsspärr: pågår redan ett skickande (dubbelklick / dubbla anrop)?
  if (prior?.status === "creating" && Date.now() - new Date(prior.updated_at ?? prior.created_at).getTime() < 120_000) {
    return json({ error: "Fakturan skickas redan till Fortnox. Vänta någon minut och uppdatera status." }, 409);
  }

  // Ny faktura efter annullering: ny nyckel så Fortnox inte återanvänder den annullerade
  if (prior?.status === "cancelled" || (prior?.fortnox_document_number && prior?.status === "failed")) {
    idempotencyKey = `MKR-SHOP-${orderId}-R${Math.floor(Date.now() / 1000)}`;
    payload.Invoice.ExternalInvoiceReference1 = idempotencyKey;
  }

  const { data: job, error: jErr } = await sb
    .from("fortnox_invoice_jobs")
    .upsert(
      {
        order_id: orderId,
        order_kind: "shop_order",
        legal_entity_code: entity,
        idempotency_key: idempotencyKey,
        request_payload: payload,
        created_by: user.id,
        status: "creating",
        fortnox_document_number: null,
        fortnox_url: null,
        last_error: null,
      },
      { onConflict: "order_id" },
    )

    .select()
    .single();
  if (jErr) return json({ error: jErr.message }, 500);

  const fail = async (msg: string, status = 502) => {
    await sb
      .from("fortnox_invoice_jobs")
      .update({ status: "failed", last_error: msg, attempts: (job.attempts ?? 0) + 1 })
      .eq("id", job.id);
    return json({ error: msg }, status);
  };

  try {
    // Säkerställ artiklar i Fortnox (SERVICE, inget lager i Fortnox).
    // Samma artikel kan finnas på flera orderrader (olika partier/priser) – hantera varje artikelnummer en gång.
    const seen = new Map<string, string>();
    for (const r of rows) {
      const cached = seen.get(r.article_number);
      if (cached) {
        r.article_number = cached;
        continue;
      }
      const original = r.article_number;

      const { data: mapped } = await sb
        .from("fortnox_article_map")
        .select("fortnox_article_number")
        .eq("legal_entity_code", entity)
        .eq("product_id", r.product_id ?? "")
        .maybeSingle();
      if (mapped?.fortnox_article_number) {
        r.article_number = mapped.fortnox_article_number;
        seen.set(original, r.article_number);
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
        try {
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
        } catch (e) {
          // Artikeln skapades av ett parallellt anrop – det är inget fel
          const already =
            e instanceof FortnoxError &&
            e.status === 400 &&
            (e.fortnoxCode === 2000013 || /anv[äa]nds redan|already/i.test(e.message));
          if (!already) throw e;
        }
      }
      if (r.product_id) {
        await sb.from("fortnox_article_map").upsert(
          { legal_entity_code: entity, product_id: r.product_id, fortnox_article_number: r.article_number },
          { onConflict: "legal_entity_code,product_id" },
        );
      }
      seen.set(original, r.article_number);
    }

    payload.Invoice.InvoiceRows = invoiceRows();

    // Skapa faktura – kolla först om nyckeln redan finns hos Fortnox
    let doc: string | null = null;
    const existing = await fortnoxRequest<any>(
      sb,
      entity,
      "GET",
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

    const url = `https://apps.fortnox.se/fi/?sid=${doc}`;
    let status = "created";
    const setJob = async (patch: Record<string, unknown>) =>
      await sb.from("fortnox_invoice_jobs").update(patch).eq("id", job.id);

    await setJob({
      status,
      fortnox_document_number: doc,
      fortnox_url: url,
      response: { document_number: doc },
      last_error: null,
      attempts: (job.attempts ?? 0) + 1,
    });

    // Bokföring/utskick sker manuellt i Fortnox – om inte bolaget valt automatik
    const { data: conn } = await sb
      .from("fortnox_connections")
      .select("auto_bookkeep")
      .eq("legal_entity_code", entity)
      .maybeSingle();

    if (conn?.auto_bookkeep && status === "created") {
      await fortnoxRequest(sb, entity, "PUT", `/invoices/${doc}/bookkeep`);
      status = "bookkept";
      await setJob({ status, fortnox_booked: true });
      if (sendEmail) {
        await fortnoxRequest(sb, entity, "GET", `/invoices/${doc}/email`);
        status = "sent";
        await setJob({ status, fortnox_sent: true });
      }
    }

    // Spegla i butiksordern
    await sb.from("shop_orders").update({ invoice_status: "Faktura Skapad" }).eq("id", orderId);

    return json({ ok: true, document_number: doc, status, url });
  } catch (e) {
    return await fail(e instanceof Error ? e.message : String(e));
  }
});
