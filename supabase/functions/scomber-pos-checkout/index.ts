// POST /scomber-pos-checkout
// Persists a POS sale: creates pos_transactions + pos_transaction_items,
// then writes batch_allocations for each line (FIFO over makrilltrade_batches_cache).
// Replaces the direct-table writes the POS UI used to do.

import {
  corsHeaders,
  errorResponse,
  getServiceClient,
  jsonResponse,
  readJson,
  requireNumber,
  requireString,
  ValidationError,
} from "../_shared/scomber.ts";

interface CheckoutLine {
  article_id: string;          // Makrilltrade native article id
  pos_product_id?: string;     // optional link back to pos_products
  product_name: string;
  sku?: string;
  quantity: number;
  unit: "piece" | "kg" | "custom";
  unit_price_ore: number;
  line_total_ore: number;
  vat_rate: number;
  discount_ore?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  try {
    const body = await readJson(req);
    const cashierId = requireString(body.cashier_id, "cashier_id");
    const paymentMethod = requireString(body.payment_method, "payment_method");
    const totalOre = requireNumber(body.total_ore, "total_ore");
    const vatBreakdown = body.vat_breakdown ?? {};
    const shiftId = typeof body.shift_id === "string" ? body.shift_id : null;
    const paymentDetails = body.payment_details ?? null;
    const controlCode = typeof body.control_code === "string" ? body.control_code : null;

    const lines = Array.isArray(body.lines) ? body.lines as CheckoutLine[] : null;
    if (!lines || lines.length === 0) {
      throw new ValidationError("lines[] is required");
    }

    const sb = getServiceClient();

    // 1. Insert transaction
    const { data: tx, error: txErr } = await sb
      .from("pos_transactions")
      .insert({
        cashier_id: cashierId,
        shift_id: shiftId,
        payment_method: paymentMethod,
        payment_details: paymentDetails,
        total_ore: totalOre,
        vat_breakdown: vatBreakdown,
        control_code: controlCode,
        status: "completed",
      })
      .select("id, receipt_no, occurred_at, store_id")
      .single();
    if (txErr) throw txErr;

    // 2. Insert line items
    const itemsInsert = lines.map((l) => ({
      transaction_id: tx.id,
      product_id: l.pos_product_id ?? null,
      product_name: l.product_name,
      sku: l.sku ?? null,
      quantity: l.quantity,
      unit: l.unit,
      unit_price_ore: l.unit_price_ore,
      line_total_ore: l.line_total_ore,
      discount_ore: l.discount_ore ?? 0,
      vat_rate: l.vat_rate,
    }));

    const { data: insertedItems, error: itErr } = await sb
      .from("pos_transaction_items")
      .insert(itemsInsert)
      .select("id");
    if (itErr) throw itErr;

    // 3. Allocate against batches (FIFO by caught_at, then synced_at)
    const allocations: Array<{
      batch_id: string;
      article_id: string;
      source_type: string;
      source_id: string;
      quantity: number;
      unit: string;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const itemId = insertedItems[i].id;

      const { data: batches } = await sb
        .from("makrilltrade_batches_cache")
        .select("batch_id, quantity_remaining, caught_at, synced_at")
        .eq("article_id", line.article_id)
        .gt("quantity_remaining", 0)
        .order("caught_at", { ascending: true, nullsFirst: false })
        .order("synced_at", { ascending: true });

      let toAllocate = Number(line.quantity);
      for (const b of batches ?? []) {
        if (toAllocate <= 0) break;
        const take = Math.min(toAllocate, Number(b.quantity_remaining));
        allocations.push({
          batch_id: b.batch_id,
          article_id: line.article_id,
          source_type: "pos_transaction_item",
          source_id: itemId,
          quantity: take,
          unit: line.unit,
        });
        await sb
          .from("makrilltrade_batches_cache")
          .update({ quantity_remaining: Number(b.quantity_remaining) - take })
          .eq("batch_id", b.batch_id);
        toAllocate -= take;
      }
      // If no batches available, we still record the sale but skip allocation.
      // Reconciliation runs later via scomber-makrilltrade-sync.
    }

    if (allocations.length > 0) {
      const { error: allocErr } = await sb.from("batch_allocations").insert(allocations);
      if (allocErr) throw allocErr;
    }

    // 4. Lagerrörelser: försäljningen ut ur butikens försäljningslager, FEFO.
    //    Enda skrivvägen till saldon är stock_movements. Idempotent: rörelser
    //    skrivs bara om kvittot inte redan har några.
    const movements = await postSaleMovements(sb, tx.id, lines, insertedItems);

    return jsonResponse({
      ok: true,
      transaction: {
        id: tx.id,
        receipt_no: tx.receipt_no,
        occurred_at: tx.occurred_at,
      },
      allocations: allocations.length,
      movements: movements.written,
      unposted_lines: movements.unposted,
    });
  } catch (e) {
    if (e instanceof ValidationError) return errorResponse(e.message, 400);
    console.error("scomber-pos-checkout error:", e);
    return errorResponse("Internal error", 500, String(e));
  }
});

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Kassaköp drar lager bara i Schweiz (Zollikon och Morges) just nu. De svenska
 * bolagen stödjer inte funktionen ännu — där bokförs inga rörelser från kassan.
 */
async function stockPostingEnabled(sb: any, storeId: string): Promise<boolean> {
  const { data: store } = await sb
    .from("stores")
    .select("legal_entity_id")
    .eq("id", storeId)
    .maybeSingle();
  const entity = store?.legal_entity_id as string | null;
  if (!entity) return false;
  const { data: le } = await sb
    .from("legal_entities")
    .select("country")
    .eq("legal_entity_id", entity)
    .maybeSingle();
  return String(le?.country ?? "").toUpperCase() === "CH";
}

/** Butikens försäljningslager — lagerplatsen kvittot drar ifrån. */
async function salesLocation(sb: any, storeId: string): Promise<string | null> {
  const { data } = await sb
    .from("storage_locations")
    .select("id")
    .eq("store_id", storeId)
    .eq("location_type", "butik")
    .eq("active", true)
    .is("parent_location_id", null)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Vår artikel bakom kassaraden: native id först, annars kassaartikelns koppling. */
async function resolveProduct(sb: any, line: CheckoutLine): Promise<{ id: string; unit: string } | null> {
  const { data: direct } = await sb
    .from("products")
    .select("id, unit")
    .eq("id", line.article_id)
    .maybeSingle();
  if (direct?.id) return { id: direct.id, unit: direct.unit ?? "kg" };

  if (line.pos_product_id) {
    const { data: pp } = await sb
      .from("pos_products")
      .select("erp_id")
      .eq("id", line.pos_product_id)
      .maybeSingle();
    if (pp?.erp_id) {
      const { data: p } = await sb
        .from("products")
        .select("id, unit")
        .eq("id", pp.erp_id)
        .maybeSingle();
      if (p?.id) return { id: p.id, unit: p.unit ?? "kg" };
    }
  }
  return null;
}

/**
 * Bokför försäljningen som rörelser ut ur butikens försäljningslager, parti
 * enligt FEFO. Idempotent per kvitto: finns rörelser redan skrivs inga nya.
 * Rader utan matchad artikel eller utan butikslager bokförs inte — de
 * rapporteras tillbaka som unposted_lines så att de kan rättas.
 */
async function postSaleMovements(
  sb: any,
  transactionId: string,
  lines: CheckoutLine[],
  items: Array<{ id: string }>,
): Promise<{ written: number; unposted: number; skipped?: string }> {
  const { data: tx } = await sb
    .from("pos_transactions")
    .select("store_id, receipt_no")
    .eq("id", transactionId)
    .maybeSingle();
  const storeId = tx?.store_id as string | null;
  if (!storeId) return { written: 0, unposted: lines.length };

  if (!(await stockPostingEnabled(sb, storeId))) {
    return { written: 0, unposted: 0, skipped: "lagerdrag_ej_aktivt_i_bolaget" };
  }



  const itemIds = items.map((i) => i.id);
  const { data: already } = await sb
    .from("stock_movements")
    .select("id")
    .eq("reference_type", "pos_transaction_item")
    .in("reference_id", itemIds)
    .limit(1);
  if (already?.length) return { written: 0, unposted: 0 };

  const locationId = await salesLocation(sb, storeId);
  if (!locationId) {
    console.error(`pos-checkout: butik ${storeId} saknar butikslager — kvitto drar inte lager`);
    return { written: 0, unposted: lines.length };
  }

  const rows: Record<string, unknown>[] = [];
  let unposted = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const itemId = items[i]?.id;
    const qty = round3(Math.abs(Number(line.quantity ?? 0)));
    const product = await resolveProduct(sb, line);
    if (!product || !itemId || qty === 0) {
      unposted++;
      continue;
    }
    const pieces = (product.unit ?? "").toLowerCase().startsWith("st");
    const note = `Kassa kvitto ${tx?.receipt_no ?? ""}`.trim();

    const { data: lots } = await sb.rpc("pos_fefo_lots", {
      _product_id: product.id,
      _location_id: locationId,
    });

    let left = qty;
    for (const lot of (lots ?? []) as any[]) {
      if (left <= 0) break;
      const take = round3(Math.min(left, Number(lot.available ?? 0)));
      if (take <= 0) continue;
      rows.push({
        product_id: product.id,
        location_id: locationId,
        lot_id: lot.lot_id,
        movement_type: "forsaljning",
        quantity_kg: -take,
        quantity_pieces: pieces ? -Math.round(take) : null,
        unit_cost: lot.unit_cost != null ? Number(lot.unit_cost) : null,
        reference_type: "pos_transaction_item",
        reference_id: itemId,
        note,
      });
      left = round3(left - take);
    }
    if (left > 0) {
      rows.push({
        product_id: product.id,
        location_id: locationId,
        lot_id: null,
        movement_type: "forsaljning",
        quantity_kg: -left,
        quantity_pieces: pieces ? -Math.round(left) : null,
        unit_cost: null,
        reference_type: "pos_transaction_item",
        reference_id: itemId,
        note: `${note} (utan parti, undersaldo)`,
      });
    }
  }

  if (!rows.length) return { written: 0, unposted };

  const { data: moved, error } = await sb.from("stock_movements").insert(rows).select("id, lot_id, reference_id");
  if (error) throw error;

  // Kopplar raden till sin första rörelse så kvittot kan spåras till partiet.
  for (const itemId of new Set((moved ?? []).map((m: any) => m.reference_id))) {
    const first = (moved ?? []).find((m: any) => m.reference_id === itemId);
    await sb
      .from("pos_transaction_items")
      .update({ movement_id: first?.id ?? null, lot_id: first?.lot_id ?? null })
      .eq("id", itemId);
  }

  return { written: moved?.length ?? 0, unposted };
}
