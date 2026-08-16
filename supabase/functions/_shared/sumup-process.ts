/**
 * SumUp etapp 2: bearbetning av kön (sumup_events) till transaktionsregister
 * och lagerrörelser.
 *
 * Regler:
 *  - Kvittot är en lagerrörelse: försäljning drar ur butikens Försäljningslager
 *    enligt FEFO. Rörelseloggen är enda sanningen — vi skriver aldrig saldon.
 *  - Testkvitton (test_mode) bokförs i registret men rör aldrig lagret.
 *  - Omatchade artiklar stoppar inte kvittot: raden bokförs utan lagerrörelse
 *    och flaggas för granskning (review_status = 'unmatched').
 *  - Kvantitet "okand" (ingen väg fram i radtolkningen) ger heller ingen
 *    lagerrörelse — vi gissar inte vikter.
 *  - Retur bokförs som motrörelse tillbaka på ursprungskvittots partier.
 *  - Valutan följer handlaren (CHF för Zollikon) och blandas aldrig i rapporter.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { interpretLine, majorToMinor, normalizePayment, parseNameWeight, round3 } from "./sumup.ts";

export type SumupEventRow = {
  id: string;
  merchant_code: string;
  external_id: string;
  transaction_code: string | null;
  event_type: string | null;
  payload: any;
  receipt_payload: any;
  test_mode: boolean;
  occurred_at: string | null;
};

export type SumupMerchantRow = {
  merchant_code: string;
  store_id: string;
  legal_entity_id: string | null;
  currency: string;
};

type MovementRow = {
  product_id: string;
  location_id: string;
  lot_id: string | null;
  movement_type: string;
  quantity_kg: number;
  quantity_pieces: number | null;
  unit_cost: number | null;
  reference_type: string;
  reference_id: string | null;
  note: string | null;
  created_by: string | null;
};

/** Butikens försäljningslager — lagerplatsen kvittot drar ifrån. */
export async function salesLocation(db: SupabaseClient, storeId: string): Promise<string | null> {
  const { data } = await db
    .from("storage_locations")
    .select("id")
    .eq("store_id", storeId)
    .ilike("name", "%örsäljningslager%")
    .is("parent_location_id", null)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

type Match = { productId: string | null; unit: string | null; sku: string | null; matchedBy: string };

/** Bekräftad namnmappning vinner, annars exakt produktnamn. Aldrig gissning. */
async function matchByName(
  db: SupabaseClient,
  merchantCode: string,
  cleanName: string,
): Promise<Match> {
  const key = cleanName.trim().toLowerCase();
  if (!key) return { productId: null, unit: null, sku: null, matchedBy: "tomt_namn" };

  const { data: mapped } = await db
    .from("sumup_product_map")
    .select("product_id, unit, merchant_code")
    .eq("external_name_key", key)
    .limit(3);
  const hit = mapped?.find((m: any) => m.merchant_code === merchantCode) ?? mapped?.[0];
  if (hit?.product_id) {
    const { data: p } = await db
      .from("products")
      .select("id, sku, unit")
      .eq("id", hit.product_id)
      .maybeSingle();
    return {
      productId: hit.product_id as string,
      unit: (p?.unit as string) ?? hit.unit ?? null,
      sku: (p?.sku as string) ?? null,
      matchedBy: "mappning",
    };
  }

  const { data: exact } = await db
    .from("products")
    .select("id, sku, unit")
    .ilike("name", cleanName.trim())
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (exact?.id) {
    return {
      productId: exact.id as string,
      unit: (exact.unit as string) ?? null,
      sku: (exact.sku as string) ?? null,
      matchedBy: "namn",
    };
  }
  return { productId: null, unit: null, sku: null, matchedBy: "omatchad" };
}

/** Räknar upp omatchat namn så granskningsvyn kan prioritera. */
async function bumpUnmatched(db: SupabaseClient, merchantCode: string, name: string) {
  const key = name.trim().toLowerCase();
  if (!key) return;
  const { data: existing } = await db
    .from("sumup_product_map")
    .select("id, unmatched_count")
    .eq("external_name_key", key)
    .is("product_id", null)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await db
      .from("sumup_product_map")
      .update({
        unmatched_count: (existing.unmatched_count ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await db.from("sumup_product_map").insert({
      merchant_code: merchantCode,
      external_name: name.trim(),
      unmatched_count: 1,
    });
  }
}

/** Försäljning ut ur försäljningslagret, parti enligt FEFO. Saldot blockerar inte. */
async function saleMovements(
  db: SupabaseClient,
  args: { productId: string; locationId: string; qty: number; unit: string | null; itemId: string; note: string },
): Promise<MovementRow[]> {
  const { data: lots } = await db.rpc("pos_fefo_lots", {
    _product_id: args.productId,
    _location_id: args.locationId,
  });

  const pieces = (args.unit ?? "").toLowerCase().startsWith("st");
  const rows: MovementRow[] = [];
  let left = round3(Math.abs(args.qty));

  for (const lot of (lots ?? []) as any[]) {
    if (left <= 0) break;
    const take = round3(Math.min(left, Number(lot.available ?? 0)));
    if (take <= 0) continue;
    rows.push({
      product_id: args.productId,
      location_id: args.locationId,
      lot_id: lot.lot_id,
      movement_type: "forsaljning",
      quantity_kg: -take,
      quantity_pieces: pieces ? -Math.round(take) : null,
      unit_cost: lot.unit_cost != null ? Number(lot.unit_cost) : null,
      reference_type: "pos_transaction_item",
      reference_id: args.itemId,
      note: args.note,
      created_by: null,
    });
    left = round3(left - take);
  }

  if (left > 0) {
    rows.push({
      product_id: args.productId,
      location_id: args.locationId,
      lot_id: null,
      movement_type: "forsaljning",
      quantity_kg: -left,
      quantity_pieces: pieces ? -Math.round(left) : null,
      unit_cost: null,
      reference_type: "pos_transaction_item",
      reference_id: args.itemId,
      note: `${args.note} (utan parti, undersaldo)`,
      created_by: null,
    });
  }
  return rows;
}

/** Retur: motrörelser IN på samma partier som ursprungskvittot drog ifrån. */
async function returnMovements(
  db: SupabaseClient,
  args: {
    reversedId: string | null;
    productId: string;
    locationId: string;
    qty: number;
    unit: string | null;
    itemId: string;
    note: string;
  },
): Promise<MovementRow[]> {
  const pieces = (args.unit ?? "").toLowerCase().startsWith("st");
  const rows: MovementRow[] = [];
  let left = round3(Math.abs(args.qty));

  if (args.reversedId) {
    const { data: origItems } = await db
      .from("pos_transaction_items")
      .select("id")
      .eq("transaction_id", args.reversedId)
      .eq("product_id", args.productId);
    const ids = (origItems ?? []).map((i: any) => i.id);
    if (ids.length) {
      const { data: origMoves } = await db
        .from("stock_movements")
        .select("lot_id, quantity_kg, unit_cost")
        .eq("reference_type", "pos_transaction_item")
        .in("reference_id", ids)
        .order("quantity_kg", { ascending: true });
      for (const m of (origMoves ?? []) as any[]) {
        if (left <= 0) break;
        const take = round3(Math.min(left, Math.abs(Number(m.quantity_kg ?? 0))));
        if (take <= 0) continue;
        rows.push({
          product_id: args.productId,
          location_id: args.locationId,
          lot_id: m.lot_id ?? null,
          movement_type: "forsaljning",
          quantity_kg: take,
          quantity_pieces: pieces ? Math.round(take) : null,
          unit_cost: m.unit_cost != null ? Number(m.unit_cost) : null,
          reference_type: "pos_transaction_item",
          reference_id: args.itemId,
          note: args.note,
          created_by: null,
        });
        left = round3(left - take);
      }
    }
  }

  if (left > 0) {
    rows.push({
      product_id: args.productId,
      location_id: args.locationId,
      lot_id: null,
      movement_type: "forsaljning",
      quantity_kg: left,
      quantity_pieces: pieces ? Math.round(left) : null,
      unit_cost: null,
      reference_type: "pos_transaction_item",
      reference_id: args.itemId,
      note: args.reversedId
        ? `${args.note} (restmängd utan parti)`
        : `${args.note} (ursprungskvitto okänt, fristående inrörelse)`,
      created_by: null,
    });
  }
  return rows;
}

/** SumUps olika namn på "detta är en retur av transaktion X". */
function linkedExternalId(payload: any): string | null {
  const candidates = [
    payload?.refunded_transaction_id,
    payload?.related_transaction_id,
    payload?.linked_transaction_id,
    payload?.original_transaction_id,
    payload?.transaction_id_refunded,
  ];
  for (const c of candidates) if (c) return String(c);
  return null;
}

function vatBreakdown(payload: any): { rate: number; vat: number; net: number }[] {
  const rates = Array.isArray(payload?.vat_rates) ? payload.vat_rates : [];
  return rates.map((v: any) => ({
    rate: Number(v?.vat_rate ?? v?.rate ?? 0),
    vat: Number(v?.vat_amount ?? v?.vat ?? 0),
    net: Number(v?.net_amount ?? v?.net ?? 0),
  }));
}

export type ProcessResult = {
  event_id: string;
  external_id: string;
  status: "bearbetad" | "duplikat" | "fel";
  transaction_id?: string;
  movements?: number;
  unmatched?: number;
  unknown_quantity?: number;
  message?: string;
};

export async function processSumupEvent(
  db: SupabaseClient,
  ev: SumupEventRow,
  m: SumupMerchantRow,
): Promise<ProcessResult> {
  const fail = async (message: string): Promise<ProcessResult> => {
    await db
      .from("sumup_events")
      .update({ status: "fel", last_error: message.slice(0, 400), attempts: undefined })
      .eq("id", ev.id);
    await db.from("nimpos_rejects").insert({
      reason: "sumup_bearbetning",
      store_code: m.merchant_code,
      event_id: ev.external_id,
      detail: message.slice(0, 400),
    });
    return { event_id: ev.id, external_id: ev.external_id, status: "fel", message };
  };

  try {
    const payload = ev.payload ?? {};
    const currency = String(payload?.currency ?? m.currency).toUpperCase();
    if (currency !== String(m.currency).toUpperCase()) {
      return await fail(`valutaavvikelse: ${currency} mot förväntad ${m.currency}`);
    }

    // Idempotens: samma transaktion bokförs bara en gång.
    const { data: existing } = await db
      .from("pos_transactions")
      .select("id")
      .eq("source", "sumup")
      .eq("external_id", ev.external_id)
      .maybeSingle();
    if (existing?.id) {
      await db
        .from("sumup_events")
        .update({
          status: "bearbetad",
          transaction_id: existing.id,
          processed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", ev.id);
      return {
        event_id: ev.id,
        external_id: ev.external_id,
        status: "duplikat",
        transaction_id: existing.id,
      };
    }

    const type = String(ev.event_type ?? payload?.transaction_type ?? "PAYMENT").toUpperCase();
    const isReturn = type === "REFUND" || Number(payload?.amount ?? 0) < 0;
    const sign = isReturn ? -1 : 1;

    let reversedId: string | null = null;
    const linked = linkedExternalId(payload);
    if (linked) {
      const { data: orig } = await db
        .from("pos_transactions")
        .select("id")
        .eq("source", "sumup")
        .eq("external_id", linked)
        .maybeSingle();
      reversedId = orig?.id ?? null;
    }

    const receiptNo =
      ev.receipt_payload?.transaction_data?.receipt_no ??
      ev.receipt_payload?.receipt_no ??
      payload?.receipt_no ??
      null;
    const register =
      ev.receipt_payload?.transaction_data?.card_reader?.code ??
      payload?.card_reader?.code ??
      payload?.product_summary ??
      null;

    const { data: tx, error: txErr } = await db
      .from("pos_transactions")
      .insert({
        source: "sumup",
        external_id: ev.external_id,
        external_receipt_no: receiptNo ? String(receiptNo) : (ev.transaction_code ?? null),
        external_register: register ? String(register) : null,
        external_cashier: payload?.username ?? payload?.user?.username ?? null,
        store_id: m.store_id,
        legal_entity_id: m.legal_entity_id,
        currency,
        occurred_at: ev.occurred_at ?? payload?.timestamp ?? new Date().toISOString(),
        status: isReturn ? "reversed" : "completed",
        total_ore: sign * Math.abs(majorToMinor(payload?.amount)),
        vat_breakdown: vatBreakdown(payload),
        payment_method: normalizePayment(payload?.payment_type ?? payload?.card?.type),
        payment_details: [
          {
            method: normalizePayment(payload?.payment_type ?? payload?.card?.type),
            amount_minor: sign * Math.abs(majorToMinor(payload?.amount)),
            currency,
          },
        ],
        reversed_transaction_id: reversedId,
        test_mode: ev.test_mode,
      })
      .select("id")
      .single();
    if (txErr) throw txErr;

    const locationId = await salesLocation(db, m.store_id);
    const products: any[] = Array.isArray(payload?.products) ? payload.products : [];
    let unmatched = 0;
    let unknownQty = 0;
    let movementCount = 0;
    let lineNo = 0;

    for (const raw of products) {
      lineNo += 1;
      const rawName = String(raw?.name ?? raw?.description ?? "").trim();
      const named = parseNameWeight(rawName);
      const cleanName = named?.cleanName ?? rawName;
      const match = await matchByName(db, m.merchant_code, cleanName);
      if (!match.productId) {
        unmatched += 1;
        await bumpUnmatched(db, m.merchant_code, cleanName);
      }

      const isWeightItem = (match.unit ?? (named ? "kg" : "st")).toLowerCase().startsWith("kg");
      const line = interpretLine(raw, { isWeightItem });
      if (line.quantitySource === "okand") unknownQty += 1;

      const reviewStatus = !match.productId
        ? "unmatched"
        : line.quantitySource === "okand"
          ? "unknown_quantity"
          : "ok";

      const { data: item, error: itemErr } = await db
        .from("pos_transaction_items")
        .insert({
          transaction_id: tx.id,
          product_id: match.productId,
          product_name: rawName || "Okänd artikel",
          sku: match.sku,
          external_line_no: lineNo,
          quantity: sign * round3(Math.abs(line.quantity)),
          unit: match.unit ?? (named ? "kg" : "st"),
          pos_unit: named ? "kg" : "st",
          unit_mismatch: !!match.unit && !!named && !match.unit.toLowerCase().startsWith("kg"),
          matched_by: match.matchedBy,
          review_status: reviewStatus,
          quantity_source: line.quantitySource,
          external_quantity: line.externalQuantity,
          unit_price_ore: Math.abs(line.unitPriceMinor),
          line_total_ore: sign * Math.abs(line.lineTotalMinor),
          vat_rate: line.vatRate ?? 0,
        })
        .select("id")
        .single();
      if (itemErr) throw itemErr;

      // Lagret rörs bara för matchad produkt med säker kvantitet, aldrig i testläge.
      if (ev.test_mode || !match.productId || !locationId) continue;
      if (line.quantitySource === "okand" || line.quantity <= 0) continue;

      const note = `SumUp ${m.merchant_code} kvitto ${receiptNo ?? ev.external_id}`;
      const rows = isReturn
        ? await returnMovements(db, {
            reversedId,
            productId: match.productId,
            locationId,
            qty: line.quantity,
            unit: match.unit,
            itemId: item.id,
            note: `Retur ${note}`,
          })
        : await saleMovements(db, {
            productId: match.productId,
            locationId,
            qty: line.quantity,
            unit: match.unit,
            itemId: item.id,
            note,
          });

      if (rows.length) {
        const { data: moved, error: mErr } = await db
          .from("stock_movements")
          .insert(rows)
          .select("id, lot_id");
        if (mErr) throw mErr;
        movementCount += moved?.length ?? 0;
        await db
          .from("pos_transaction_items")
          .update({ movement_id: moved?.[0]?.id ?? null, lot_id: moved?.[0]?.lot_id ?? null })
          .eq("id", item.id);
      }
    }

    const problems = [
      unmatched ? `${unmatched} omatchade artiklar` : null,
      unknownQty ? `${unknownQty} rader med okänd kvantitet` : null,
      isReturn && !reversedId ? "ursprungskvitto okänt" : null,
    ].filter(Boolean);

    await db
      .from("sumup_events")
      .update({
        status: "bearbetad",
        transaction_id: tx.id,
        processed_at: new Date().toISOString(),
        last_error: problems.length ? problems.join(", ") : null,
      })
      .eq("id", ev.id);

    return {
      event_id: ev.id,
      external_id: ev.external_id,
      status: "bearbetad",
      transaction_id: tx.id,
      movements: movementCount,
      unmatched,
      unknown_quantity: unknownQty,
      message: problems.length ? problems.join(", ") : undefined,
    };
  } catch (e: any) {
    console.error("sumup-bearbetning misslyckades", e);
    return await fail(String(e?.message ?? e));
  }
}

/** Bearbetar kön: alla köade händelser (valfritt för en handlare). */
export async function processQueue(
  db: SupabaseClient,
  opts: { merchantCode?: string | null; limit?: number; eventId?: string | null } = {},
): Promise<ProcessResult[]> {
  let q = db
    .from("sumup_events")
    .select("id, merchant_code, external_id, transaction_code, event_type, payload, receipt_payload, test_mode, occurred_at")
    .order("occurred_at", { ascending: true })
    .limit(opts.limit ?? 200);
  if (opts.eventId) q = q.eq("id", opts.eventId);
  else q = q.eq("status", "koad");
  if (opts.merchantCode) q = q.eq("merchant_code", opts.merchantCode);

  const { data: events, error } = await q;
  if (error) throw error;

  const merchants = new Map<string, SumupMerchantRow>();
  const results: ProcessResult[] = [];
  for (const ev of (events ?? []) as SumupEventRow[]) {
    if (!merchants.has(ev.merchant_code)) {
      const { data: m } = await db
        .from("sumup_merchants")
        .select("merchant_code, store_id, legal_entity_id, currency")
        .eq("merchant_code", ev.merchant_code)
        .maybeSingle();
      if (!m) {
        results.push({
          event_id: ev.id,
          external_id: ev.external_id,
          status: "fel",
          message: "okänd merchant_code",
        });
        continue;
      }
      merchants.set(ev.merchant_code, m as SumupMerchantRow);
    }
    results.push(await processSumupEvent(db, ev, merchants.get(ev.merchant_code)!));
  }
  return results;
}
