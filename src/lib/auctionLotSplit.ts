import { supabase } from "@/integrations/supabase/client";
import { auctionLocationId, type AuctionPurchaseRow } from "@/lib/auctionPurchases";
import { currentStaffId, recordMovement } from "@/lib/stockLedger";

/**
 * Delning av ett auktionsparti.
 *
 * En låda behöver inte gå odelad till en destination: köper du 20 kg hel
 * slätvar och Schweiz ska ha 5,6 kg av lådan, delas partiet i delpartier som
 * ärver all härkomst från moderpartiet.
 *
 * Delningen bokförs alltid som lagerrörelser på samma lagerplats — uttag ur
 * moderpartiet och inleverans på delpartiet. Inga saldon skrivs över och ingen
 * rad raderas. Kopplingen sparas i lot_transformations så att spårbarheten
 * bakåt till lådan finns kvar.
 */

/** Fångst- och härkomstfält som ärvs från moderparti till delparti. */
const INHERITED_FIELDS = [
  "product_id",
  "species_fao_code",
  "latin_name",
  "commercial_name",
  "catch_area",
  "fishing_gear",
  "fishing_gear_code",
  "production_method",
  "is_thawed",
  "catch_date_from",
  "catch_date_to",
  "vessel_name",
  "vessel_reg",
  "vessel_nation",
  "supplier_id",
  "grade",
  "certificate",
  "certified_program",
  "supplier_lot_id",
  "best_before",
  "legal_entity_id",
  "auction_status",
  "auction_lot_number",
  "ring_reference",
  "nominal_weight_per_colli",
  "preliminary_unit_cost",
  "cost_pending_settlement",
  "price_status",
  "box_photo_url",
  "box_photo_urls",
  "field_sources",
] as const;

export interface SplitPart {
  /** Kilo i delen, högst en decimal. */
  quantityKg: number;
  /** Destination för delen, t.ex. "export". Sätts vid fördelningen. */
  destination?: string | null;
}

export interface SplitResult {
  childLotIds: string[];
  remainingKg: number;
}

/** Kilo med högst en decimal — samma regel som i hela lagret. */
export function roundKg(value: number): number {
  return Math.round((Number(value) || 0) * 10) / 10;
}

/** Vikten som finns att dela på partiet. */
export function splittableWeight(row: AuctionPurchaseRow): number {
  const perColli = Number(row.lots?.nominal_weight_per_colli ?? 0);
  const nominal = perColli ? perColli * Number(row.colli || 0) : 0;
  return roundKg(Number(row.lots?.quantity_kg ?? 0) || nominal);
}

/**
 * Delar moderpartiet i delpartier. Summan av delarna får aldrig överstiga
 * partiets vikt; resten ligger kvar på moderpartiet.
 */
export async function splitAuctionLot(
  row: AuctionPurchaseRow,
  parts: SplitPart[],
): Promise<SplitResult> {
  if (row.status === "makulerat") throw new Error("Ett makulerat parti kan inte delas.");
  const lotId = row.lot_id;
  if (!lotId) throw new Error("Partiet saknas och kan därför inte delas.");

  const total = splittableWeight(row);
  if (!total) {
    throw new Error("Partiet har ingen känd vikt ännu — vikten måste in före delning.");
  }

  const wanted = parts.map((p) => roundKg(p.quantityKg)).filter((kg) => kg > 0);
  if (!wanted.length) throw new Error("Ange hur många kilo delen ska vara.");
  if (wanted.some((kg) => kg < 0.1)) throw new Error("Minsta del är 0,1 kg.");

  const sum = roundKg(wanted.reduce((a, b) => a + b, 0));
  if (sum > total) {
    throw new Error(`Delarna är ${sum} kg men partiet är ${total} kg.`);
  }

  const { data: parent, error: parentError } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .single();
  if (parentError) throw parentError;
  const mother = parent as Record<string, any>;

  const { count } = await supabase
    .from("lots")
    .select("id", { count: "exact", head: true })
    .eq("parent_lot_id", lotId);
  let index = Number(count ?? 0);

  const [locationId, staffId] = await Promise.all([auctionLocationId(), currentStaffId()]);
  const productId = mother.product_id as string | null;
  const unitCost = mother.preliminary_unit_cost ?? Number(row.price_per_kg) ?? null;
  const childLotIds: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const quantityKg = roundKg(parts[i].quantityKg);
    if (quantityKg <= 0) continue;
    index += 1;

    const inherited: Record<string, any> = {};
    for (const f of INHERITED_FIELDS) {
      if (mother[f] !== undefined && mother[f] !== null) inherited[f] = mother[f];
    }

    const { data: child, error: childError } = await supabase
      .from("lots")
      .insert({
        ...inherited,
        lot_number: `${mother.lot_number}-${index}`,
        parent_lot_id: lotId,
        split_index: index,
        quantity_kg: quantityKg,
        colli_count: null,
        auction_destination: parts[i].destination ?? mother.auction_destination ?? null,
        status: "aktiv",
        created_by: staffId,
      } as any)
      .select("id")
      .single();
    if (childError) throw childError;
    const childId = (child as any).id as string;
    childLotIds.push(childId);

    // Rörelserna: ut ur moderpartiet, in på delpartiet, samma lagerplats.
    if (productId) {
      await recordMovement({
        productId,
        locationId,
        lotId,
        quantityKg: -quantityKg,
        movementType: "tillverkning_ut",
        unitCost: unitCost ? Number(unitCost) : undefined,
        referenceType: "lot_split",
        referenceId: childId,
        note: `Delning av parti ${mother.lot_number}`,
      });
      await recordMovement({
        productId,
        locationId,
        lotId: childId,
        quantityKg,
        movementType: "tillverkning_in",
        unitCost: unitCost ? Number(unitCost) : undefined,
        referenceType: "lot_split",
        referenceId: childId,
        note: `Delning av parti ${mother.lot_number}`,
      });
    }

    const { error: linkError } = await supabase.from("lot_transformations").insert({
      from_lot_id: lotId,
      to_lot_id: childId,
      quantity_in_kg: quantityKg,
      quantity_out_kg: quantityKg,
      created_by: staffId,
    } as any);
    if (linkError) throw linkError;
  }

  const remaining = roundKg(total - sum);
  const { error: motherError } = await supabase
    .from("lots")
    .update({ quantity_kg: remaining } as any)
    .eq("id", lotId);
  if (motherError) throw motherError;

  return { childLotIds, remainingKg: remaining };
}

/** Delpartierna som skapats ur ett moderparti. */
export async function lotSplitChildren(lotId: string) {
  const { data, error } = await supabase
    .from("lots")
    .select("id, lot_number, quantity_kg, auction_destination, split_index, created_at")
    .eq("parent_lot_id", lotId)
    .order("split_index", { ascending: true });
  if (error) throw error;
  return (data ?? []) as {
    id: string;
    lot_number: string;
    quantity_kg: number | null;
    auction_destination: string | null;
    split_index: number | null;
    created_at: string;
  }[];
}
