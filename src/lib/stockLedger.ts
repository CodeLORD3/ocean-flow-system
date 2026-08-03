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

/** Rörelsetyper som alltid är utflöden (kvantitet lagras negativ). */
const OUTFLOW: MovementType[] = ["tillverkning_ut", "overforing_ut", "forsaljning", "svinn"];

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
  const cost =
    params.unitCost ?? (await currentBalance(params.productId, params.fromLocationId)).avgCost;

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
