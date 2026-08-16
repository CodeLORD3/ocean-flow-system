/**
 * Delad bearbetningslogik för Nimpos-kvitton (kön i nimpos_webhook_events).
 * Används av nimpos-sales (mottagning), nimpos-replay (omspelning) och
 * nimpos-reconcile (efterhämtning av saknade kvitton).
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Payment = { method?: string; amount_ore?: number; card_brand?: string; last4?: string };

export function normalizeMethod(raw?: string): string {
  const m = (raw ?? "").toLowerCase();
  if (/card|kort|visa|master|debit|credit/.test(m)) return "card";
  if (/cash|kontant/.test(m)) return "cash";
  if (/swish/.test(m)) return "swish";
  if (/invoice|faktura/.test(m)) return "invoice";
  return "other";
}

export function toOre(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Kortdata får aldrig lagras: last4/pan tvättas bort ur payloaden. */
export function scrubCardData(input: any): any {
  if (Array.isArray(input)) return input.map(scrubCardData);
  if (input && typeof input === "object") {
    const out: any = {};
    for (const [key, value] of Object.entries(input)) {
      if (/^(last4|last_four|pan|card_number|masked_pan)$/i.test(key)) continue;
      out[key] = scrubCardData(value);
    }
    return out;
  }
  return input;
}

/* ------------------------------------------------------------------ mappning */

export async function mapStore(
  db: SupabaseClient,
  storeCode?: string,
  registerId?: string,
): Promise<string | null> {
  if (storeCode) {
    const { data } = await db
      .from("nimpos_store_map")
      .select("store_id")
      .eq("store_code", storeCode)
      .eq("active", true)
      .maybeSingle();
    if (data?.store_id) return data.store_id as string;
  }
  if (registerId) {
    const { data } = await db
      .from("nimpos_store_map")
      .select("store_id")
      .eq("register_id", registerId)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (data?.store_id) return data.store_id as string;
  }
  return null;
}

/** Butikens försäljningslager — lagerplatsen kvittot drar ifrån. */
export async function salesLocation(db: SupabaseClient, storeId: string): Promise<string | null> {
  const { data } = await db
    .from("storage_locations")
    .select("id, name, parent_location_id")
    .eq("store_id", storeId)
    .ilike("name", "%örsäljningslager%")
    .is("parent_location_id", null)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Kassörskod mot personalregistret, annars sparas koden rå. */
async function mapCashier(
  db: SupabaseClient,
  storeId: string,
  code?: string,
): Promise<{ cashierId: string | null; staffId: string | null }> {
  if (!code) return { cashierId: null, staffId: null };
  const { data: cashiers } = await db
    .from("pos_cashiers")
    .select("id, store_id, display_name")
    .ilike("display_name", code)
    .limit(5);
  const cashierId = cashiers?.length
    ? ((cashiers.find((c: any) => c.store_id === storeId) ?? cashiers[0]).id as string)
    : null;

  const { data: staff } = await db
    .from("staff")
    .select("id, first_name, last_name, store_id")
    .or(`first_name.ilike.${code},last_name.ilike.${code}`)
    .limit(5);
  const staffId = staff?.length
    ? ((staff.find((s: any) => s.store_id === storeId) ?? staff[0]).id as string)
    : null;

  return { cashierId, staffId };
}

type ProductMatch = { productId: string | null; matchedBy: string | null; unit: string | null };

/** Produkt på sku (Nimpos använder våra SKU:er), reserv på barcode, sedan bekräftad mappning. */
async function mapProduct(
  db: SupabaseClient,
  sku?: string,
  barcode?: string,
  name?: string,
): Promise<ProductMatch> {
  if (sku) {
    const { data } = await db.from("products").select("id, unit").eq("sku", sku).maybeSingle();
    if (data?.id) return { productId: data.id as string, matchedBy: "sku", unit: data.unit as string };
  }
  if (barcode) {
    const { data } = await db.from("products").select("id, unit").eq("barcode", barcode).maybeSingle();
    if (data?.id) {
      return { productId: data.id as string, matchedBy: "barcode", unit: data.unit as string };
    }
  }

  const orParts = [
    sku ? `external_sku.eq.${sku}` : null,
    barcode ? `barcode.eq.${barcode}` : null,
  ].filter(Boolean) as string[];

  let mapRow: any = null;
  if (orParts.length) {
    const { data } = await db
      .from("nimpos_product_map")
      .select("id, product_id")
      .or(orParts.join(","))
      .limit(1)
      .maybeSingle();
    mapRow = data;
  }

  if (mapRow?.product_id) {
    const { data: p } = await db
      .from("products")
      .select("id, unit")
      .eq("id", mapRow.product_id)
      .maybeSingle();
    return { productId: mapRow.product_id as string, matchedBy: "map", unit: (p?.unit as string) ?? null };
  }

  // Omatchad: hamnar i granskningsvyn på /pos-live med förslag
  if (sku || barcode) {
    if (mapRow?.id) {
      const { data: cur } = await db
        .from("nimpos_product_map")
        .select("unmatched_count")
        .eq("id", mapRow.id)
        .maybeSingle();
      await db
        .from("nimpos_product_map")
        .update({
          last_seen_at: new Date().toISOString(),
          external_name: name ?? null,
          unmatched_count: (cur?.unmatched_count ?? 0) + 1,
        })
        .eq("id", mapRow.id);
    } else {
      await db.from("nimpos_product_map").insert({
        external_sku: sku ?? null,
        barcode: barcode ?? null,
        external_name: name ?? null,
        unmatched_count: 1,
        last_seen_at: new Date().toISOString(),
      });
    }
  }
  return { productId: null, matchedBy: null, unit: null };
}

/* ------------------------------------------------------- lagerrörelser (FEFO) */

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

/**
 * Försäljning ut ur försäljningslagret, parti enligt FEFO.
 * Saldot blockerar aldrig: räcker inte partierna bokförs resten utan parti och
 * undersaldot flaggas av databasens befintliga guard (Systemstatus).
 */
async function saleMovements(
  db: SupabaseClient,
  args: {
    productId: string;
    locationId: string;
    qty: number;
    unit: string | null;
    itemId: string;
    staffId: string | null;
    note: string;
  },
): Promise<MovementRow[]> {
  const { data: lots } = await db.rpc("pos_fefo_lots", {
    _product_id: args.productId,
    _location_id: args.locationId,
  });

  const rows: MovementRow[] = [];
  let left = round3(Math.abs(args.qty));
  const pieces = (args.unit ?? "").toLowerCase().startsWith("st");

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
      created_by: args.staffId,
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
      created_by: args.staffId,
    });
  }

  return rows;
}

/* ---------------------------------------------------------------- bearbetning */

export async function processEvent(
  db: SupabaseClient,
  eventRowId: string,
  body: any,
  eventId: string,
  testMode: boolean,
): Promise<{ body: any; status: number }> {
  const r = body?.receipt ?? body;

  const park = async (status: string, message: string) => {
    await db
      .from("nimpos_webhook_events")
      .update({ status, last_error: message, processed_at: new Date().toISOString() })
      .eq("id", eventRowId);
    await db.from("nimpos_rejects").insert({
      reason: status,
      store_code: r?.store_code ?? null,
      event_id: eventId,
      detail: message,
    });
    // 200: innehållsfel — kassan ska inte retry:a i evighet
    return { body: { ok: true, parked: status, message }, status: 200 };
  };

  try {
    const storeId = await mapStore(db, r.store_code, r.register_id);
    if (!storeId) {
      return await park("unmapped_store", `Okänd butikskod: ${r.store_code ?? "(saknas)"}`);
    }

    const externalId = String(r.external_id ?? eventId);
    const { data: existing } = await db
      .from("pos_transactions")
      .select("id")
      .eq("source", "nimpos")
      .eq("external_id", externalId)
      .maybeSingle();
    if (existing?.id) {
      await db
        .from("nimpos_webhook_events")
        .update({
          status: "duplicate",
          transaction_id: existing.id,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventRowId);
      return { body: { ok: true, duplicate: true, transaction_id: existing.id }, status: 200 };
    }

    const { cashierId, staffId } = await mapCashier(db, storeId, r.cashier_code);
    const payments: Payment[] = Array.isArray(r.payments) ? r.payments : [];
    const isReturn = String(r.type ?? "sale") === "return";
    const sign = isReturn ? -1 : 1;

    const { data: store } = await db
      .from("stores")
      .select("legal_entity_id")
      .eq("id", storeId)
      .maybeSingle();

    let reversedId: string | null = null;
    if (r.reverses_external_id) {
      const { data: orig } = await db
        .from("pos_transactions")
        .select("id")
        .eq("source", "nimpos")
        .eq("external_id", String(r.reverses_external_id))
        .maybeSingle();
      reversedId = orig?.id ?? null;
    }

    const { data: tx, error: txErr } = await db
      .from("pos_transactions")
      .insert({
        source: "nimpos",
        external_id: externalId,
        external_receipt_no: r.receipt_no ?? null,
        external_register: r.register_id ?? null,
        external_cashier: r.cashier_code ?? null,
        cashier_id: cashierId,
        store_id: storeId,
        legal_entity_id: store?.legal_entity_id ?? null,
        occurred_at: r.occurred_at ? new Date(r.occurred_at).toISOString() : new Date().toISOString(),
        status: isReturn ? "reversed" : "completed",
        total_ore: sign * Math.abs(toOre(r.total_ore)),
        vat_breakdown: Array.isArray(r.vat_breakdown) ? r.vat_breakdown : [],
        payment_method: normalizeMethod(payments[0]?.method),
        payment_details: payments.map((p) => ({
          method: normalizeMethod(p.method),
          amount_ore: toOre(p.amount_ore),
          card_brand: p.card_brand ?? null,
        })),
        control_code: r.control_code ?? null,
        reversed_transaction_id: reversedId,
        test_mode: testMode,
      })
      .select("id")
      .single();

    if (txErr) throw txErr;

    const locationId = await salesLocation(db, storeId);
    const items = Array.isArray(r.items) ? r.items : [];
    let unmatched = 0;
    let unitMismatch = 0;
    let movementCount = 0;

    for (const it of items) {
      const match = await mapProduct(db, it.sku ?? undefined, it.barcode ?? undefined, it.name);
      const posUnit = String(it.unit ?? "st");
      // Enhetsavvikelse loggas, kvantiteten bokförs som den kom — aldrig tyst omräkning
      const mismatch =
        !!match.unit && match.unit.toLowerCase() !== posUnit.toLowerCase();
      if (!match.productId) unmatched++;
      if (mismatch) unitMismatch++;

      const qty = round3(Math.abs(Number(it.quantity ?? 0)));

      const { data: item, error: itemErr } = await db
        .from("pos_transaction_items")
        .insert({
          transaction_id: tx.id,
          product_id: match.productId,
          product_name: it.name ?? "Okänd artikel",
          sku: it.sku ?? null,
          barcode: it.barcode ?? null,
          external_line_no: it.line_no ?? null,
          quantity: sign * qty,
          unit: match.unit ?? posUnit,
          pos_unit: posUnit,
          unit_mismatch: mismatch,
          matched_by: match.matchedBy,
          review_status: match.productId ? (mismatch ? "unit_mismatch" : "ok") : "unmatched",
          unit_price_ore: Math.abs(toOre(it.unit_price_ore)),
          line_total_ore: sign * Math.abs(toOre(it.line_total_ore)),
          discount_ore: Math.abs(toOre(it.discount_ore)),
          vat_rate: Number(it.vat_rate ?? 12),
        })
        .select("id")
        .single();
      if (itemErr) throw itemErr;

      // Lagerrörelser: testkvitton rör aldrig skarpt lager
      if (testMode || !match.productId || !locationId || qty === 0) continue;

      let rows: MovementRow[];
      if (isReturn) {
        rows = await returnMovements(db, {
          reversedId,
          productId: match.productId,
          locationId,
          qty,
          unit: match.unit ?? posUnit,
          itemId: item.id,
          staffId,
          note: `Retur kvitto ${externalId}`,
        });
      } else {
        rows = await saleMovements(db, {
          productId: match.productId,
          locationId,
          qty,
          unit: match.unit ?? posUnit,
          itemId: item.id,
          staffId,
          note: `Kassa ${r.store_code ?? ""} kvitto ${externalId}`.trim(),
        });
      }

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
      unitMismatch ? `${unitMismatch} enhetsavvikelser` : null,
      isReturn && !reversedId ? "ursprungskvitto okänt" : null,
    ].filter(Boolean);

    await db
      .from("nimpos_webhook_events")
      .update({
        status: problems.length ? "processed_partial" : "processed",
        transaction_id: tx.id,
        processed_at: new Date().toISOString(),
        last_error: problems.length ? problems.join(", ") : null,
      })
      .eq("id", eventRowId);

    return {
      body: {
        ok: true,
        duplicate: false,
        transaction_id: tx.id,
        unmatched_items: unmatched,
        unit_mismatches: unitMismatch,
        movements: movementCount,
        test_mode: testMode,
      },
      status: 200,
    };
  } catch (e) {
    console.error("bearbetning misslyckades", e);
    return await park("failed", (e as Error).message ?? String(e));
  }
}

/**
 * Retur: motrörelser IN på samma partier som ursprungskvittot drog ifrån.
 * Är ursprungskvittot okänt bokförs returen som fristående inrörelse utan parti
 * med flagga i noteringen.
 */
async function returnMovements(
  db: SupabaseClient,
  args: {
    reversedId: string | null;
    productId: string;
    locationId: string;
    qty: number;
    unit: string | null;
    itemId: string;
    staffId: string | null;
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
          created_by: args.staffId,
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
      created_by: args.staffId,
    });
  }

  return rows;
}
