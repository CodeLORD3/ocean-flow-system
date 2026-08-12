import { supabase } from "@/integrations/supabase/client";

/**
 * Lagerrörelser är systemets enda skrivväg till lagersaldon.
 * Saldot i product_stock_locations härleds av databastriggern
 * apply_stock_movement — skriv aldrig saldot direkt.
 */
export type MovementType =
  | "inleverans"
  | "tillverkning_in"
  | "tillverkning_ut"
  | "overforing_in"
  | "overforing_ut"
  | "forsaljning"
  | "kundorder"
  | "svinn"
  | "justering"
  | "inventering";

export interface StockMovementInput {
  productId: string;
  locationId: string;
  /** Positiv = in, negativ = ut. Får aldrig vara 0. */
  quantityKg: number;
  movementType: MovementType;
  lotId?: string | null;
  quantityPieces?: number | null;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}

/**
 * Rörelsetyper som alltid är utflöden (kvantitet lagras negativ).
 * "kundorder" är uttag för en kundbeställning och hålls medvetet skilt från
 * "forsaljning" (disk/kassa) så att rapporter och inventering kan skilja dem.
 */
const OUTFLOW: MovementType[] = [
  "tillverkning_ut",
  "overforing_ut",
  "forsaljning",
  "kundorder",
  "svinn",
];


let cachedStaffId: string | null | undefined;

/** Personal-id för inloggad användare (cachas per session). */
export async function currentStaffId(): Promise<string | null> {
  if (cachedStaffId !== undefined) return cachedStaffId;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) {
    cachedStaffId = null;
    return null;
  }
  const { data } = await supabase.from("staff").select("id").eq("user_id", uid).limit(1);
  cachedStaffId = data?.[0]?.id ?? null;
  return cachedStaffId;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function normalize(m: StockMovementInput) {
  const magnitude = Math.abs(round3(m.quantityKg));
  const signed = OUTFLOW.includes(m.movementType) ? -magnitude : round3(m.quantityKg);
  return signed;
}

/** Registrerar en eller flera lagerrörelser. Nollrader hoppas över. */
export async function recordMovements(movements: StockMovementInput[]) {
  const staffId = await currentStaffId();
  const rows = movements
    .map((m) => ({ ...m, signed: normalize(m) }))
    .filter((m) => m.signed !== 0 && m.productId && m.locationId)
    .map((m) => ({
      product_id: m.productId,
      location_id: m.locationId,
      lot_id: m.lotId ?? null,
      movement_type: m.movementType,
      quantity_kg: m.signed,
      quantity_pieces: m.quantityPieces ?? null,
      unit_cost: m.unitCost ?? null,
      reference_type: m.referenceType ?? null,
      reference_id: m.referenceId ?? null,
      note: m.note ?? null,
      created_by: staffId,
    }));

  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("stock_movements").insert(rows as any).select("id");
  if (error) throw error;
  return data ?? [];
}

/** Registrerar en enskild lagerrörelse. */
export async function recordMovement(movement: StockMovementInput) {
  const res = await recordMovements([movement]);
  return res[0] ?? null;
}

/** Nuvarande saldo och snittkostpris på en lagerplats. */
export async function currentBalance(productId: string, locationId: string) {
  const { data } = await supabase
    .from("product_stock_locations")
    .select("quantity, avg_cost, unit_cost")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .limit(1);
  const row = data?.[0] as any;
  return {
    quantity: Number(row?.quantity || 0),
    avgCost: Number(row?.avg_cost ?? row?.unit_cost ?? 0),
  };
}

/**
 * Partiets bokförda inköpspris per kg. Detta är enda källan till lagervärde
 * för ett parti — aldrig produktens prisfält och aldrig lagerplatsens
 * blandade snittpris.
 */
export async function lotUnitCost(lotId: string): Promise<number | null> {
  const { data } = await supabase.from("lots").select("unit_cost").eq("id", lotId).maybeSingle();
  const cost = Number((data as any)?.unit_cost);
  return Number.isFinite(cost) && cost > 0 ? cost : null;
}

/** Flyttar kvantitet mellan två lagerplatser som två motbokade rörelser. */
export async function transferStock(params: {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantityKg: number;
  lotId?: string | null;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  note?: string | null;
}) {
  const { quantityKg } = params;
  if (!quantityKg) return;
  // Partipriset följer alltid med partiet oförändrat vid flytt. Först när
  // rörelsen saknar parti används lagerplatsens snittpris som reserv.
  const cost =
    (params.lotId ? await lotUnitCost(params.lotId) : null) ??
    params.unitCost ??
    (await currentBalance(params.productId, params.fromLocationId)).avgCost;

  await recordMovements([
    {
      productId: params.productId,
      locationId: params.fromLocationId,
      quantityKg,
      movementType: "overforing_ut",
      lotId: params.lotId,
      unitCost: cost || null,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: params.note,
    },
    {
      productId: params.productId,
      locationId: params.toLocationId,
      quantityKg,
      movementType: "overforing_in",
      lotId: params.lotId,
      unitCost: cost || null,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      note: params.note,
    },
  ]);
}

/** Ett partis kvarvarande kvantitet på en lagerplats. */
export interface LotBalance {
  lotId: string | null;
  quantityKg: number;
  bestBefore?: string | null;
}

function accumulateLots(rows: any[]): Map<string | null, number> {
  const acc = new Map<string | null, number>();
  for (const row of rows) {
    const key = (row.lot_id ?? null) as string | null;
    acc.set(key, round3((acc.get(key) || 0) + Number(row.quantity_kg || 0)));
  }
  for (const [key, value] of acc) if (value <= 0) acc.delete(key);
  return acc;
}

/**
 * Kvarvarande kvantitet per parti för en produkt på en lagerplats, härlett ur
 * rörelseloggen. Sorteras FIFO på bäst före — äldsta partiet plockas först.
 * Rader utan parti (historik före partiskapandet) hamnar sist.
 */
export async function lotBalancesAtLocation(
  productId: string,
  locationId: string,
): Promise<LotBalance[]> {
  const { data } = await supabase
    .from("stock_movements")
    .select("lot_id, quantity_kg")
    .eq("product_id", productId)
    .eq("location_id", locationId);

  const acc = accumulateLots(data || []);
  const lotIds = [...acc.keys()].filter((id): id is string => !!id);
  const bestBefore = new Map<string, string | null>();
  if (lotIds.length) {
    const { data: lots } = await supabase
      .from("lots")
      .select("id, best_before")
      .in("id", lotIds);
    for (const lot of lots || []) bestBefore.set((lot as any).id, (lot as any).best_before ?? null);
  }

  return [...acc.entries()]
    .map(([lotId, quantityKg]) => ({
      lotId,
      quantityKg,
      bestBefore: lotId ? bestBefore.get(lotId) ?? null : null,
    }))
    .sort((a, b) => {
      if (!a.lotId) return 1;
      if (!b.lotId) return -1;
      if (a.bestBefore && b.bestBefore) return a.bestBefore.localeCompare(b.bestBefore);
      if (a.bestBefore) return -1;
      if (b.bestBefore) return 1;
      return 0;
    });
}

/**
 * Kvarvarande kvantitet per produkt och parti på en lagerplats för en given
 * referens (t.ex. en butiksorder på transportlagret).
 */
export async function lotBalancesForReference(params: {
  locationId: string;
  referenceType: string;
  referenceId: string;
}): Promise<{ productId: string; lots: LotBalance[] }[]> {
  const { data } = await supabase
    .from("stock_movements")
    .select("product_id, lot_id, quantity_kg")
    .eq("location_id", params.locationId)
    .eq("reference_type", params.referenceType)
    .eq("reference_id", params.referenceId);

  const byProduct = new Map<string, any[]>();
  for (const row of data || []) {
    const pid = (row as any).product_id as string;
    if (!byProduct.has(pid)) byProduct.set(pid, []);
    byProduct.get(pid)!.push(row);
  }

  const out: { productId: string; lots: LotBalance[] }[] = [];
  for (const [productId, rows] of byProduct) {
    const acc = accumulateLots(rows);
    const lots = [...acc.entries()].map(([lotId, quantityKg]) => ({ lotId, quantityKg }));
    if (lots.length) out.push({ productId, lots });
  }
  return out;
}

/**
 * Sätter saldot på en lagerplats till ett målvärde genom att bokföra
 * differensen som en rörelse. Enda vägen att "skriva" ett saldo.
 */
export async function setBalance(params: {
  productId: string;
  locationId: string;
  targetQuantityKg: number;
  movementType?: MovementType;
  unitCost?: number | null;
  lotId?: string | null;
  note?: string | null;
}) {
  const current = await currentBalance(params.productId, params.locationId);
  const delta = round3(params.targetQuantityKg - current.quantity);
  if (delta === 0) return null;
  return recordMovement({
    productId: params.productId,
    locationId: params.locationId,
    quantityKg: delta,
    movementType: params.movementType ?? "justering",
    lotId: params.lotId ?? null,
    unitCost: params.unitCost ?? null,
    note: params.note ?? null,
  });
}

/**
 * Miniminivå är en inställning, inte ett saldo — den skrivs direkt på raden.
 * Ligger här så att product_stock_locations bara skrivs från denna fil.
 */
export async function setMinStock(params: {
  productId: string;
  locationId: string;
  minStock: number;
}) {
  const { error } = await supabase
    .from("product_stock_locations")
    .upsert(
      {
        product_id: params.productId,
        location_id: params.locationId,
        min_stock: params.minStock,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "product_id,location_id" },
    );
  if (error) throw error;
}
