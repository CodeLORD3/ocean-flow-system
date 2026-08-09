import { supabase } from "@/integrations/supabase/client";
import { recordMovement, currentStaffId } from "@/lib/stockLedger";

/**
 * Kundbeställningar (privatpersoner).
 *
 * Detta är INTE shop_orders (butikens beställning till grossisten) och har
 * ingen koppling till kassan. Uttag bokförs med egen rörelsetyp "kundorder"
 * så att inventering och rapporter kan skilja kundorder från diskförsäljning.
 */

export type OrderType = "upphamtning" | "leverans";
export type OrderCategory = "vanlig" | "catering";
export type OrderPackStatus = "opackad" | "pagaende" | "packad";
export type LinePackStatus = "opackad" | "packad" | "restnoterad" | "struken";
export type ReservationStatus = "reserverad" | "inkopsbehov" | "ingen";
export type OrderStatus =
  | "forfragan"
  | "ny"
  | "bekraftad"
  | "packad"
  | "delvis_utlamnad"
  | "levererad"
  | "avhamtad"
  | "avbruten";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  forfragan: "Förfrågan",
  ny: "Ny",
  bekraftad: "Bekräftad",
  packad: "Packad",
  delvis_utlamnad: "Delvis utlämnad",
  levererad: "Levererad",
  avhamtad: "Avhämtad",
  avbruten: "Avbruten",
};

export const PACK_STATUS_LABELS: Record<OrderPackStatus, string> = {
  opackad: "Opackad",
  pagaende: "Pågående",
  packad: "Packad",
};

export const LINE_PACK_LABELS: Record<LinePackStatus, string> = {
  opackad: "Opackad",
  packad: "Packad",
  restnoterad: "Restnoterad",
  struken: "Struken",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  upphamtning: "Upphämtning",
  leverans: "Leverans",
};

export const SOURCE_LABELS: Record<string, string> = {
  telefon: "Telefon",
  i_butik: "I butik",
  epost: "E-post",
};

/** Avvikelsegränser: vikt per rad och totalbelopp för ordern. */
export const WEIGHT_DEVIATION_LIMIT = 0.2;
export const TOTAL_DEVIATION_LIMIT = 0.15;

export interface RetailCustomer {
  id: string;
  store_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  note: string | null;
  excluded_allergens: string[];
  anonymized_at: string | null;
  created_at: string;
}

export interface CustomerOrderLine {
  id: string;
  customer_order_id: string;
  product_id: string | null;
  original_product_id: string | null;
  free_text_name: string | null;
  is_free_text: boolean;
  quantity_ordered: number;
  quantity_packed: number | null;
  unit: string;
  estimated_price_per_unit: number | null;
  price_per_unit: number | null;
  price_override_reason: string | null;
  price_override_by: string | null;
  line_total: number | null;
  note: string | null;
  pack_status: LinePackStatus;
  reservation_status: ReservationStatus;
  reserved_lot_id: string | null;
  reserved_quantity: number;
  substitution_approved: boolean;
  substitution_note: string | null;
  portion_per_guest: number | null;
  locked_from_scaling: boolean;
  movement_id: string | null;
  packed_at: string | null;
  sort_order: number;
  products?: any;
  lots?: any;
}

export interface CustomerOrder {
  id: string;
  order_number: string;
  store_id: string;
  customer_id: string | null;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  order_type: OrderType;
  category: OrderCategory;
  wanted_date: string;
  wanted_time: string | null;
  delivery_street: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  guest_count: number | null;
  allergy_note: string | null;
  excluded_allergens: string[];
  pack_status: OrderPackStatus;
  status: OrderStatus;
  source: string;
  received_by_name: string | null;
  estimated_total: number;
  total_incl_vat: number;
  note: string | null;
  packed_at: string | null;
  handed_over_at: string | null;
  created_at: string;
  customers_retail?: RetailCustomer | null;
  customer_order_lines?: CustomerOrderLine[];
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const num = (v: unknown) => Number(v ?? 0);

/** Ordernummer BUTIKSKOD-ÅÅÅÅMMDD-NNN från databasen (säkert vid samtidighet). */
export async function nextOrderNumber(storeId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("next_customer_order_number", {
    _store_id: storeId,
    _date: today,
  });
  if (error) throw error;
  return data as unknown as string;
}

/** Butikens lagerplatser (huvudnivå först). */
export async function storeLocations(storeId: string) {
  const { data } = await supabase
    .from("storage_locations")
    .select("id, name, parent_location_id, location_type, active")
    .eq("store_id", storeId)
    .eq("location_type", "butik")
    .eq("active", true);
  const rows = (data || []) as any[];
  return rows.sort((a, b) => (a.parent_location_id ? 1 : 0) - (b.parent_location_id ? 1 : 0));
}

/** Butikens primära lagerplats — där kundorderuttag bokförs. */
export async function primaryStoreLocationId(storeId: string) {
  const locs = await storeLocations(storeId);
  return locs[0]?.id ?? null;
}

/**
 * Dagens pris för en produkt i en butik.
 * Butikens prislista går först, annars produktens utpris.
 */
export async function todaysPrice(productId: string, storeId: string): Promise<number | null> {
  const { data: lists } = await supabase
    .from("price_lists")
    .select("id, created_at")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(1);
  const listId = (lists as any[])?.[0]?.id;
  if (listId) {
    const { data: item } = await supabase
      .from("price_list_items")
      .select("price")
      .eq("price_list_id", listId)
      .eq("product_id", productId)
      .limit(1);
    const price = (item as any[])?.[0]?.price;
    if (price != null) return Number(price);
  }
  const { data: prod } = await supabase
    .from("products")
    .select("retail_suggested, wholesale_price")
    .eq("id", productId)
    .limit(1);
  const p = (prod as any[])?.[0];
  const value = p?.retail_suggested ?? p?.wholesale_price;
  return value != null ? Number(value) : null;
}

export interface ReservationOutcome {
  status: ReservationStatus;
  lotId: string | null;
  reason: string;
}

/**
 * Reservationsregeln, per orderrad.
 *
 * Finns ett parti i butikens lager vars bäst före täcker leveransdatumet med
 * minst en dags marginal → reservera mot partiet. Annars blir raden ett
 * inköpsbehov och varan köps färsk inför leveransdagen.
 */
export async function evaluateReservation(params: {
  productId: string;
  storeId: string;
  wantedDate: string;
  quantity: number;
}): Promise<ReservationOutcome> {
  const locs = await storeLocations(params.storeId);
  const locationIds = locs.map((l) => l.id);
  if (locationIds.length === 0) {
    return { status: "inkopsbehov", lotId: null, reason: "Butiken saknar lagerplats" };
  }

  // Partier med saldo i butikens lager
  const { data: movements } = await supabase
    .from("stock_movements")
    .select("lot_id, quantity_kg, lots(id, lot_number, best_before)")
    .eq("product_id", params.productId)
    .in("location_id", locationIds)
    .not("lot_id", "is", null);

  const perLot = new Map<string, { qty: number; bestBefore: string | null; lotNumber: string }>();
  for (const m of (movements || []) as any[]) {
    const lot = m.lots;
    if (!lot) continue;
    const prev = perLot.get(lot.id) ?? {
      qty: 0,
      bestBefore: lot.best_before ?? null,
      lotNumber: lot.lot_number,
    };
    prev.qty += Number(m.quantity_kg || 0);
    perLot.set(lot.id, prev);
  }

  const wanted = new Date(params.wantedDate + "T00:00:00");
  const candidates = Array.from(perLot.entries())
    .filter(([, v]) => v.qty >= params.quantity - 0.0001)
    .filter(([, v]) => {
      if (!v.bestBefore) return false;
      const bb = new Date(v.bestBefore + "T00:00:00");
      // Minst en dags marginal efter leveransdatumet
      return bb.getTime() - wanted.getTime() >= 24 * 3600 * 1000;
    })
    // Först ut: partiet som går ut först (FIFO)
    .sort((a, b) => String(a[1].bestBefore).localeCompare(String(b[1].bestBefore)));

  if (candidates.length > 0) {
    const [lotId, v] = candidates[0];
    return {
      status: "reserverad",
      lotId,
      reason: `Parti ${v.lotNumber} håller till ${v.bestBefore}`,
    };
  }

  return {
    status: "inkopsbehov",
    lotId: null,
    reason: "Inget parti i butikens lager täcker leveransdatumet — varan köps färsk",
  };
}

/** Håller varan så länge att ordern kan ligga så långt fram? */
export function shelfLifeWarning(params: {
  productName: string;
  shelfLifeDays: number | null | undefined;
  wantedDate: string;
}): string | null {
  const days = Number(params.shelfLifeDays || 0);
  if (!days) return null;
  const wanted = new Date(params.wantedDate + "T00:00:00").getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  const ahead = Math.round((wanted - today) / (24 * 3600 * 1000));
  if (ahead > days) {
    return `${params.productName} håller ${days} dagar. Ordern ligger ${ahead} dagar fram, varan köps in inför leveransdagen.`;
  }
  return null;
}

/** Avviker den vägda vikten mer än 20 procent från beställd kvantitet? */
export function weightDeviates(ordered: number, packed: number) {
  if (!ordered) return false;
  return Math.abs(packed - ordered) / ordered > WEIGHT_DEVIATION_LIMIT;
}

/** Avviker verkligt belopp mer än 15 procent från det uppskattade? */
export function totalDeviates(estimated: number, actual: number) {
  if (!estimated) return false;
  return Math.abs(actual - estimated) / estimated > TOTAL_DEVIATION_LIMIT;
}

export async function logOrderEvent(params: {
  orderId: string;
  eventType: string;
  description?: string;
  oldValue?: unknown;
  newValue?: unknown;
  performedBy?: string | null;
}) {
  await supabase.from("customer_order_events").insert({
    customer_order_id: params.orderId,
    event_type: params.eventType,
    description: params.description ?? null,
    old_value: (params.oldValue ?? null) as any,
    new_value: (params.newValue ?? null) as any,
    performed_by: params.performedBy ?? null,
  } as any);
}

/**
 * Packar en orderrad på VÄGD vikt.
 *
 * Reservationen nollas, lagerrörelsen bokförs på butikens lager mot det
 * reserverade partiet med referens till ordern och orderraden.
 */
export async function packLine(params: {
  order: CustomerOrder;
  line: CustomerOrderLine;
  packedQuantity: number;
  pricePerUnit: number | null;
  note?: string | null;
  performedBy?: string | null;
}) {
  const { order, line } = params;
  const qty = round3(params.packedQuantity);
  const price = params.pricePerUnit != null ? Number(params.pricePerUnit) : null;
  const lineTotal = price != null ? round2(qty * price) : null;

  let movementId: string | null = null;

  if (!line.is_free_text && line.product_id && qty > 0) {
    const locationId = await primaryStoreLocationId(order.store_id);
    if (!locationId) {
      throw new Error("Butiken saknar lagerplats — uttaget kan inte bokföras.");
    }
    const movement = await recordMovement({
      productId: line.product_id,
      locationId,
      quantityKg: qty,
      movementType: "kundorder",
      lotId: line.reserved_lot_id,
      referenceType: "customer_order_line",
      referenceId: line.id,
      note: `Kundbeställning ${order.order_number}`,
    });
    movementId = (movement as any)?.id ?? null;
  }

  const { error } = await supabase
    .from("customer_order_lines")
    .update({
      quantity_packed: qty,
      price_per_unit: price,
      line_total: lineTotal,
      pack_status: "packad",
      reserved_quantity: 0,
      note: params.note ?? line.note,
      movement_id: movementId,
      packed_at: new Date().toISOString(),
      packed_by: await currentStaffId(),
    } as any)
    .eq("id", line.id);
  if (error) throw error;

  await logOrderEvent({
    orderId: order.id,
    eventType: "rad_packad",
    description: `Rad packad: ${qty} ${line.unit}`,
    oldValue: { quantity: line.quantity_ordered },
    newValue: { quantity: qty, price },
    performedBy: params.performedBy ?? null,
  });

  return movementId;
}

/** Motrörelse när en packad order avbryts eller varan går åter i lager. */
export async function reverseLine(params: {
  order: CustomerOrder;
  line: CustomerOrderLine;
  reason: string;
  asWaste?: boolean;
}) {
  const { order, line } = params;
  const qty = Number(line.quantity_packed || 0);
  if (!line.product_id || qty <= 0) return;
  const locationId = await primaryStoreLocationId(order.store_id);
  if (!locationId) return;

  if (params.asWaste) {
    // Ohämtad order som kasseras: svinn direkt, varan går inte åter i disken.
    await recordMovement({
      productId: line.product_id,
      locationId,
      quantityKg: qty,
      movementType: "svinn",
      lotId: line.reserved_lot_id,
      referenceType: "customer_order_line",
      referenceId: line.id,
      note: `${params.reason} — ${order.order_number}`,
    });
    return;
  }

  await recordMovement({
    productId: line.product_id,
    locationId,
    quantityKg: qty,
    movementType: "kundorder",
    lotId: line.reserved_lot_id,
    quantityPieces: null,
    referenceType: "customer_order_line",
    referenceId: line.id,
    note: `${params.reason} — ${order.order_number}`,
  });
}

/** Packstatus för hela ordern utifrån raderna. */
export function derivePackStatus(lines: CustomerOrderLine[]): OrderPackStatus {
  const active = lines.filter((l) => l.pack_status !== "struken");
  if (active.length === 0) return "opackad";
  const packed = active.filter((l) => l.pack_status === "packad");
  if (packed.length === 0) return "opackad";
  if (packed.length === active.length) return "packad";
  return "pagaende";
}

/** Är ordern ohämtad? Tre dagar efter önskat datum utan utlämning. */
export function isUncollected(order: CustomerOrder) {
  if (!["packad", "delvis_utlamnad"].includes(order.status)) return false;
  const wanted = new Date(order.wanted_date + "T00:00:00").getTime();
  const days = (Date.now() - wanted) / (24 * 3600 * 1000);
  return days >= 3;
}
