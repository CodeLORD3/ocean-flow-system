import { supabase } from "@/integrations/supabase/client";
import { prepareUpload, COMPRESS_PHOTO } from "@/lib/imageCompress";
import { currentStaffId, recordMovement } from "@/lib/stockLedger";

/**
 * Auktionsinköp vid ringen i Fiskhamnen.
 *
 * Vid ringen finns bara tre uppgifter: pris per kg, antal kolli och ett foto av
 * lådans informationslapp. Partiet föds direkt med status "preliminärt".
 *
 * Lagerrörelsen bokförs i stock_movements — men först när partiet har både vara
 * och vikt (från tolkningen av lappen eller auktionens följesedel). En rörelse
 * utan vikt finns inte, och saldon skrivs aldrig direkt. Tills dess visas
 * partiet som "vikt saknas" i dagens lista.
 */

export const AUCTION_LOCATION_NAME = "Fiskhamnen auktion";
const PHOTO_BUCKET = "lot-documents";

export type AuctionStatus =
  | "preliminart"
  | "verifierat"
  | "kontrollerat"
  | "disponibelt"
  | "makulerat";

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  preliminart: "Preliminärt",
  verifierat: "Verifierat",
  kontrollerat: "Kontrollerat",
  disponibelt: "Disponibelt",
  makulerat: "Makulerat",
};

export interface AuctionPurchaseRow {
  id: string;
  purchase_date: string;
  price_per_kg: number;
  colli: number;
  box_photo_url: string | null;
  box_photo_urls: string[] | null;
  status: AuctionStatus;
  destination: string | null;
  suggestions: Record<string, unknown>;
  suggestions_confirmed_at: string | null;
  lot_id: string | null;
  movement_id: string | null;
  client_key: string;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  created_by: string | null;
  lots?: {
    id: string;
    lot_number: string;
    commercial_name: string | null;
    vessel_name: string | null;
    quantity_kg: number | null;
    colli_count: number | null;
    nominal_weight_per_colli: number | null;
    auction_status: string | null;
    auction_lot_number: string | null;
  } | null;
}

let cachedLocationId: string | null = null;

/** Lagerplatsen för auktionsköpen. Finns alltid — läggs upp med systemet. */
export async function auctionLocationId(): Promise<string> {
  if (cachedLocationId) return cachedLocationId;
  const { data, error } = await supabase
    .from("storage_locations")
    .select("id")
    .eq("name", AUCTION_LOCATION_NAME)
    .limit(1);
  if (error) throw error;
  const id = (data?.[0] as any)?.id as string | undefined;
  if (!id) throw new Error(`Lagerplatsen ${AUCTION_LOCATION_NAME} saknas`);
  cachedLocationId = id;
  return id;
}

/** Dagens datum i svensk tid, som YYYY-MM-DD. */
export function swedishToday(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ringens interna nummer tills auktionens partinummer tagit över. */
export function ringReference(date: string): string {
  const stamp = date.replace(/-/g, "");
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `RING-${stamp}-${rand}`;
}

/**
 * Både komma och punkt är decimaltecken vid ringen — "89,5" och "89.5" är
 * samma pris. Tomt eller ogiltigt ger null.
 */
export function parseDecimal(raw: string): number | null {
  const text = String(raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

export interface NewAuctionPurchase {
  pricePerKg: number;
  colli: number;
  /** Ett foto per kolli — lika många bilder som lådor. */
  photos: File[];
  /** Egen nyckel per köp så samma köp aldrig kan sparas två gånger. */
  clientKey: string;
  purchaseDate?: string;
}

/** Laddar upp lådlapparnas foton och returnerar adresserna som sparas på partiet. */
async function uploadBoxPhotos(photos: File[], date: string): Promise<string[]> {
  return Promise.all(
    photos.map(async (photo) => {
      const { file, ext, contentType } = await prepareUpload(photo, COMPRESS_PHOTO);
      const path = `auktion/${date}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, file, { contentType, upsert: false });
      if (error) throw error;
      return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    }),
  );
}

/** Bilderna på ett köp — nya köp har en per kolli, äldre köp har en enda. */
export function boxPhotos(row: AuctionPurchaseRow): string[] {
  const list = (row.box_photo_urls ?? []).filter(Boolean);
  if (list.length) return list;
  return row.box_photo_url ? [row.box_photo_url] : [];
}

/** Hur många bilder som saknas mot antalet kolli. */
export function missingPhotoCount(row: AuctionPurchaseRow): number {
  return Math.max(0, row.colli - boxPhotos(row).length);
}

/**
 * Registrerar ett vunnet bud. Skapar partiet med status preliminärt och
 * fotona bifogade. Idempotent på klientnyckeln — ett köat köp som synkas två
 * gånger blir aldrig två partier.
 */
export async function createAuctionPurchase(input: NewAuctionPurchase): Promise<AuctionPurchaseRow> {
  const date = input.purchaseDate ?? swedishToday();

  if (input.photos.length !== input.colli) {
    throw new Error(
      `Ta en bild per kolli: ${input.photos.length} av ${input.colli} bilder är tagna.`,
    );
  }

  const { data: existing } = await supabase
    .from("auction_purchases")
    .select("*")
    .eq("client_key", input.clientKey)
    .maybeSingle();
  if (existing) return existing as unknown as AuctionPurchaseRow;

  const [locationId, staffId, photoUrls] = await Promise.all([
    auctionLocationId(),
    currentStaffId(),
    uploadBoxPhotos(input.photos, date),
  ]);

  const ringRef = ringReference(date);

  const { data: lot, error: lotError } = await supabase
    .from("lots")
    .insert({
      lot_number: ringRef,
      ring_reference: ringRef,
      quantity_kg: 0,
      colli_count: input.colli,
      box_photo_url: photoUrls[0],
      box_photo_urls: photoUrls,
      auction_status: "preliminart",
      preliminary_unit_cost: input.pricePerKg,
      cost_pending_settlement: true,
      price_status: "preliminar",
      legal_entity_id: "fsab-se",
      created_by: staffId,
    } as any)
    .select("id")
    .single();
  if (lotError) throw lotError;

  const { data, error } = await supabase
    .from("auction_purchases")
    .insert({
      purchase_date: date,
      location_id: locationId,
      lot_id: (lot as any).id,
      price_per_kg: input.pricePerKg,
      colli: input.colli,
      box_photo_url: photoUrls[0],
      box_photo_urls: photoUrls,
      status: "preliminart",
      client_key: input.clientKey,
      created_by: staffId,
    } as any)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as AuctionPurchaseRow;
}

/** Nominell vikt = vikt per kolli gånger antal kolli, när vikten finns. */
export function nominalWeight(row: AuctionPurchaseRow): number | null {
  const perColli = Number(row.lots?.nominal_weight_per_colli ?? 0);
  if (!perColli) return null;
  return Math.round(perColli * row.colli * 10) / 10;
}

/** Preliminärt belopp för raden, när vikten är känd. */
export function preliminaryAmount(row: AuctionPurchaseRow): number | null {
  const weight = nominalWeight(row);
  if (weight === null) return null;
  return Math.round(weight * Number(row.price_per_kg));
}

/**
 * Bokför inköpsrörelsen till Fiskhamnen auktion. Körs så snart partiet har
 * både vara och nominell vikt, och bara en gång per köp.
 */
export async function bookAuctionPurchaseMovement(row: AuctionPurchaseRow): Promise<string | null> {
  if (row.movement_id || row.status === "makulerat") return null;
  const productId = (row.lots as any)?.product_id as string | undefined;
  const weight = nominalWeight(row);
  if (!productId || !weight) return null;

  const locationId = row.lots ? await auctionLocationId() : await auctionLocationId();
  const movement = await recordMovement({
    productId,
    locationId,
    lotId: row.lot_id,
    quantityKg: weight,
    movementType: "inleverans",
    unitCost: Number(row.price_per_kg),
    referenceType: "auction_purchase",
    referenceId: row.id,
    note: "Auktionsinköp vid ringen, preliminärt pris",
  });
  const movementId = (movement as any)?.id ?? null;

  await supabase
    .from("auction_purchases")
    .update({ movement_id: movementId } as any)
    .eq("id", row.id);
  await supabase
    .from("lots")
    .update({ quantity_kg: weight } as any)
    .eq("id", row.lot_id!);

  return movementId;
}

/**
 * Makulerar ett köp. Finns en bokförd inköpsrörelse skapas en motrörelse så
 * att saldot på Fiskhamnen auktion blir noll för partiet — raden raderas aldrig.
 */
export async function cancelAuctionPurchase(row: AuctionPurchaseRow, reason: string) {
  const staffId = await currentStaffId();

  if (row.movement_id) {
    const weight = nominalWeight(row);
    const productId = (row.lots as any)?.product_id as string | undefined;
    if (weight && productId) {
      await recordMovement({
        productId,
        locationId: await auctionLocationId(),
        lotId: row.lot_id,
        quantityKg: -weight,
        movementType: "justering",
        unitCost: Number(row.price_per_kg),
        referenceType: "auction_purchase_cancel",
        referenceId: row.id,
        note: `Makulerat auktionsinköp: ${reason}`,
      });
    }
  }

  const { error } = await supabase
    .from("auction_purchases")
    .update({
      status: "makulerat",
      cancelled_at: new Date().toISOString(),
      cancelled_by: staffId,
      cancelled_reason: reason,
    } as any)
    .eq("id", row.id);
  if (error) throw error;

  if (row.lot_id) {
    const { error: lotError } = await supabase
      .from("lots")
      .update({
        auction_status: "makulerat",
        status: "terminerad",
        terminated_reason: `Makulerat auktionsinköp: ${reason}`,
      } as any)
      .eq("id", row.lot_id);
    if (lotError) throw lotError;
  }
}

/** Uppdaterar pris eller kolli på ett köp som inte lämnat auktionen. */
export async function updateAuctionPurchase(
  id: string,
  patch: { pricePerKg?: number; colli?: number },
) {
  const update: Record<string, unknown> = {};
  if (patch.pricePerKg != null) update.price_per_kg = patch.pricePerKg;
  if (patch.colli != null) update.colli = patch.colli;
  if (!Object.keys(update).length) return;
  const { error } = await supabase.from("auction_purchases").update(update as any).eq("id", id);
  if (error) throw error;
  // Partiet bär samma uppgifter som köpet — kolli och det preliminära
  // kilopriset måste därför följa med rättningen.
  const lotPatch: Record<string, unknown> = {};
  if (patch.colli != null) lotPatch.colli_count = patch.colli;
  if (patch.pricePerKg != null) lotPatch.preliminary_unit_cost = patch.pricePerKg;
  if (Object.keys(lotPatch).length) {
    const { data } = await supabase
      .from("auction_purchases")
      .select("lot_id")
      .eq("id", id)
      .maybeSingle();
    const lotId = (data as any)?.lot_id;
    if (lotId) {
      const { error: lotError } = await supabase
        .from("lots")
        .update(lotPatch as any)
        .eq("id", lotId);
      if (lotError) throw lotError;
    }
  }
}
