# Shopify-integrationen från start till slut

Det här dokumentet är den fullständiga tekniska beskrivningen av hur webbordrar
från Shopify blir kundbeställningar i Makrill Trade, inklusive all källkod och
varje fallback-nivå. Genererat underlag — koden nedan är kopierad ordagrant ur
`supabase/functions/`.

## 1. Delarna

| Del | Fil | Roll |
|---|---|---|
| Delad hjälpkod | `supabase/functions/_shared/shopify-admin.ts` | domännormalisering, API-version, tokenupplösning |
| OAuth | `supabase/functions/shopify-oauth/index.ts` | hämtar och lagrar permanent Admin-token |
| Webhook (realtid) | `supabase/functions/shopify-order-webhook/index.ts` | tar emot order, verifierar HMAC, köar, bearbetar |
| Backfyllnad (pull) | `supabase/functions/shopify-backfill/index.ts` | hämtar historiska ordrar och matar samma kö |
| Inkorg | `src/pages/ShopifyWebOrders.tsx` | osorterade ordrar, manuellt butiksval, produktkoppling |
| Systemstatus | `src/components/shopify/ShopifyWebhookStatus.tsx` | kö, fel, selftest, OAuth-knapp, backfyllnad |
| Kundgranskning | `src/components/shopify/CustomerMatchReview.tsx` | tvetydiga kundmatchningar |

Tabeller: `shopify_webhook_events` (kö/logg), `shopify_store_map` (butiksnycklar),
`shopify_product_map` (SKU/titel → produkt), `shopify_oauth_tokens`,
`shopify_oauth_states`, samt målet `customer_orders` + `customer_order_lines`.

Hemligheter: `SHOPIFY_WEBHOOK_SECRET`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
`SHOPIFY_SHOP_DOMAIN`, ev. äldre `SHOPIFY_ADMIN_TOKEN`.

## 2. Flödet steg för steg

1. **Shopify POSTar** ordern till `/functions/v1/shopify-order-webhook`
   (`verify_jwt = false`, eftersom Shopify inte kan skicka JWT).
2. **Rå body läses som text** — ingen JSON-parsning före signaturkontrollen,
   eftersom HMAC räknas på exakt de bytes Shopify skickade.
3. **HMAC-SHA256** med `SHOPIFY_WEBHOOK_SECRET`, base64, jämförd tidskonstant
   mot `X-Shopify-Hmac-Sha256`. Fel signatur är det **enda** felsvaret (401).
4. **Kön skrivs** (`status: "koad"`, `raw_body` + `payload` sparas) och svaret
   `200` går tillbaka direkt.
5. **Bearbetningen körs efter svaret** via `EdgeRuntime.waitUntil` — Shopify
   raderar prenumerationen om URL:en upprepat svarar annat än 200.
6. `processEvent()` gör: duplikatkontroll → topic-routing → butikssortering →
   kundmatchning → orderskapande med rader och reservationer.

## 3. Alla fallback-nivåer

**Signeringsnyckel saknas** → händelsen loggas med `status: "fel"` och svaret är
ändå 200, så prenumerationen överlever ett konfigurationsmisstag.

**Kön kan inte skrivas** → loggas i funktionsloggen, svaret är 200.

**Butikssortering** (`resolveStore`), i tur och ordning:
1. `note_attributes.shopifyLocationId` mot `shopify_store_map`
2. `note_attributes.locationId`
3. `Delivery Location` som fritext, delsträngsmatchning
4. Ingen träff → `status: "osorterad"` → ordern hamnar i inkorgen och personal
   väljer butik manuellt (`/assign`), som kör exakt samma `createOrder()`.

**Kundmatchning** (`matchCustomer`), inom **bolaget** (inte butiken, eftersom
Ålsten och Kungsholmen delar webbutik):
1. `shopify_customer_id`
2. normaliserad e-post (`email_normalized`)
3. normaliserad telefon + efternamn
4. Efternamn saknas på gamla poster → sista ordet i det fria namnfältet
5. Flera kandidater → `ambiguous`, ordern skapas men flaggas för granskning —
   aldrig tyst val av första raden
6. Ingen träff → ny kund med `source: "shopify"`

Vid träff **kompletteras** bara tomma fält; befintliga uppgifter skrivs aldrig över.

**Produktmatchning**, per orderrad:
1. `line_items[].sku` mot `products.sku`
2. `shopify_product_map` på SKU
3. `shopify_product_map` på produkttiteln (Shopify lämnar ibland SKU tomt)
4. Ingen träff → raden blir fritext (`is_free_text`) med
   `needs_product_match: true`, ordern skapas ändå och raden kopplas i inkorgen

**Leveransdatum** (`parseDeliveryDate`), format i fallande ordning: ISO
`2026-08-16`, `16/8/2026`, `16 augusti 2026`, `August 16, 2026`. Ingen tolkning
lyckas → `created_at`. Tidsfönstret `"11:00 - 13:00"` ger `wanted_time = 11:00`.

**Reservation** (`evaluateReservation`): finns ett parti i butikens lager vars
bäst före täcker leveransdatumet med minst ett dygns marginal reserveras raden
(FEFO-ordning), annars blir raden `inkopsbehov`.

**Idempotens** på två nivåer: `customer_orders.shopify_order_id` är unikt, och
kön nycklas på `(shopify_order_id, topic)`. Omsändning ger `duplikat`.
Nyckeln inkluderar topic så att `orders/cancelled` för en känd order räknas som
en ny händelse.

**Avbokning** (`cancelOrder`): ordern sätts `avbruten`, reservationer och
inköpsbehov frisläpps, och var ordern packad eller utlämnad blir statusen
`avbokad_larm` med text om att varorna måste kontrolleras.

**Fel under bearbetning** → `status: "fel"` med meddelandet sparat; kan köras om
från Systemstatus via `/reprocess` (kräver inloggad personal).

**Selftest** → `/selftest` räknar ut signaturen med den konfigurerade nyckeln och
kör sedan exakt samma kodväg som en riktig webhook. Kräver inloggning och kan
aldrig kringgå kontrollen.

## 4. Backfyllnaden (pull)

`GET https://{shop}/admin/api/2026-07/orders.json?limit=250&status=open&financial_status=paid`
med `X-Shopify-Access-Token`. Cursor-paginering via `Link`-huvudets `page_info`
— vid paginering får bara `limit` och `page_info` skickas, annars svarar Shopify
400. Varje hämtad order läggs i **samma kö** med topic `orders/create` och samma
payloadformat som en riktig webhook, och bearbetas genom att anropa
`/reprocess`. Därför delar backfyllnad och realtid exakt samma affärslogik, och
funktionen är säker att köra hur många gånger som helst.

Tokenordning (`getAdminToken`): OAuth-token ur `shopify_oauth_tokens` för
butiken, annars äldre `SHOPIFY_ADMIN_TOKEN`. 401/403 från Shopify ger ett
tydligt fel om att `read_orders` (och `read_all_orders` för ordrar äldre än 60
dagar) saknas.

## 5. Fullständig källkod

### `supabase/functions/_shared/shopify-admin.ts`

```ts
/**
 * Delad hjälpkod för Shopify Admin API.
 *
 * Tokenkällor, i tur och ordning:
 *   1. OAuth-token från tabellen shopify_oauth_tokens (offline, permanent)
 *   2. Hemligheten SHOPIFY_ADMIN_TOKEN (äldre shpat_-token)
 *
 * Klienthemligheten (shpss_...) ligger i SHOPIFY_API_SECRET eller
 * SHOPIFY_ACCESS_TOKEN och läses bara från miljön — aldrig ur koden.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const SHOPIFY_API_VERSION = "2026-07";

/** Normaliserar butiksdomänen: "min-butik" → "min-butik.myshopify.com". */
export function shopDomain(raw: string): string {
  let d = (raw ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (d && !d.includes(".")) d = `${d}.myshopify.com`;
  return d;
}

export function configuredShop(): string {
  return shopDomain(Deno.env.get("SHOPIFY_SHOP_DOMAIN") ?? "");
}

export function apiKey(): string {
  return Deno.env.get("SHOPIFY_API_KEY") ?? "";
}

export function apiSecret(): string {
  return Deno.env.get("SHOPIFY_API_SECRET") ?? Deno.env.get("SHOPIFY_ACCESS_TOKEN") ?? "";
}

/** Hämtar giltig Admin-token för butiken, eller null om ingen finns. */
export async function getAdminToken(
  db: SupabaseClient,
  shop = configuredShop(),
): Promise<string | null> {
  if (shop) {
    const { data } = await db
      .from("shopify_oauth_tokens")
      .select("access_token")
      .eq("shop", shop)
      .maybeSingle();
    if (data?.access_token) return data.access_token as string;
  }
  const legacy = Deno.env.get("SHOPIFY_ADMIN_TOKEN") ?? "";
  return legacy || null;
}

/** Anropar Admin REST API med rätt token och version. */
export async function adminFetch(
  token: string,
  shop: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http")
    ? path
    : `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/${path.replace(/^\//, "")}`;
  return await fetch(url, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}
```

### `supabase/functions/shopify-order-webhook/index.ts`

```ts
/**
 * Shopify orders/create → kundbeställning i rätt butik, i realtid.
 *
 * Säkerhet: HMAC-SHA256 över RAW body med Shopifys signeringsnyckel,
 * base64-kodad och jämförd mot X-Shopify-Hmac-Sha256. Ingen JSON-parsning
 * sker före signaturkontrollen.
 *
 * Idempotens: Shopifys order-id är unikt på customer_orders.shopify_order_id.
 * Omsändningar loggas som "duplikat" och skapar aldrig en andra order.
 *
 * Butikssortering: note_attributes i tur och ordning
 *   1. shopifyLocationId  2. locationId  3. Delivery Location (adresstext)
 * mot den redigerbara mappningstabellen shopify_store_map. Ingen träff =
 * ordern hamnar i inkorgen "Osorterade webbordrar" för manuellt butiksval.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/* ------------------------------------------------------------------ HMAC */

async function hmacBase64(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Tidskonstant jämförelse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* --------------------------------------------------------- note_attributes */

type Attr = { name?: string; key?: string; value?: unknown };

function attr(payload: any, key: string): string | null {
  const list: Attr[] = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
  // Shopify skickar note_attributes som {name, value}; äldre exporter använder {key, value}.
  const hit = list.find((a) => {
    const k = String((a as any)?.name ?? (a as any)?.key ?? "").trim().toLowerCase();
    return k === key.toLowerCase();
  });
  const v = hit?.value;
  return v == null || String(v).trim() === "" ? null : String(v).trim();
}

/* ------------------------------------------------------------ enhetslogik */

const PIECE_UNITS = ["st", "stk", "styck", "pcs", "pc", "piece"];
/** Produktens lagerenhet — samma regel som src/lib/units.ts. Ingen omräkning. */
const stockUnitOf = (unit?: string | null): "kg" | "st" =>
  PIECE_UNITS.includes(String(unit ?? "").toLowerCase().trim()) ? "st" : "kg";

/* ------------------------------------------------------------- datum/tider */

const MONTHS: Record<string, number> = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6, juli: 7,
  augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10,
};

/** Månadsnamn eller förkortning ("aug", "Aug.", "augusti") → månadsnummer. */
function monthOf(raw: string): number | null {
  const k = raw.toLowerCase().replace(/\.$/, "").trim();
  if (MONTHS[k]) return MONTHS[k];
  const hit = Object.keys(MONTHS).find((m) => k.length >= 3 && m.startsWith(k));
  return hit ? MONTHS[hit] : null;
}

/** Tolkar Shopifys "Delivery Date" i de format kassan skickar. */
export function parseDeliveryDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
  if (dmy) {
    return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  }
  const words = s.toLowerCase().match(/(\d{1,2})\s+([a-zåäö]+)\.?\s+(\d{4})/);
  const wm = words ? monthOf(words[2]) : null;
  if (wm) {
    return `${words![3]}-${String(wm).padStart(2, "0")}-${String(words![1]).padStart(2, "0")}`;
  }
  const enWords = s.toLowerCase().match(/([a-zåäö]+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
  const em = enWords ? monthOf(enWords[1]) : null;
  if (em) {
    return `${enWords![3]}-${String(em).padStart(2, "0")}-${String(enWords![2]).padStart(2, "0")}`;
  }
  return null;
}

/** Första klockslaget i tidsfönstret, t.ex. "11:00 - 13:00" → "11:00". */
export function parseWindowStart(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}

/* ------------------------------------------------------ butikssortering */

interface MapRow {
  key_type: string;
  key_value: string;
  store_id: string;
  active: boolean;
}

export function resolveStore(payload: any, rows: MapRow[]): { storeId: string | null; via: string } {
  const active = rows.filter((r) => r.active !== false);
  const byType = (t: string) => active.filter((r) => r.key_type === t);

  const primary = attr(payload, "shopifyLocationId");
  if (primary) {
    const hit = byType("shopifyLocationId").find((r) => r.key_value === primary);
    if (hit) return { storeId: hit.store_id, via: `shopifyLocationId ${primary}` };
  }
  const secondary = attr(payload, "locationId");
  if (secondary) {
    const hit = byType("locationId").find((r) => r.key_value === secondary);
    if (hit) return { storeId: hit.store_id, via: `locationId ${secondary}` };
  }
  const text = attr(payload, "Delivery Location");
  if (text) {
    const needle = text.toLowerCase();
    const hit = byType("deliveryLocation").find((r) => needle.includes(r.key_value.toLowerCase()));
    if (hit) return { storeId: hit.store_id, via: `Delivery Location "${text}"` };
  }
  return { storeId: null, via: "ingen nyckel matchade" };
}

/* ------------------------------------------------------------ reservation */

/**
 * Reservationsregeln, samma som kundordermodulen: finns ett parti i butikens
 * lager vars bäst före täcker leveransdatumet med minst en dags marginal
 * reserveras raden mot partiet, annars blir raden ett inköpsbehov.
 */
async function evaluateReservation(
  db: SupabaseClient,
  productId: string,
  storeId: string,
  wantedDate: string,
  quantity: number,
): Promise<{ status: string; lotId: string | null }> {
  const { data: locs } = await db
    .from("storage_locations")
    .select("id, parent_location_id")
    .eq("store_id", storeId)
    .eq("location_type", "butik")
    .eq("active", true);
  const ids = (locs || []).map((l: any) => l.id);
  if (!ids.length) return { status: "inkopsbehov", lotId: null };

  const { data: movements } = await db
    .from("stock_movements")
    .select("lot_id, quantity_kg, lots(id, best_before)")
    .eq("product_id", productId)
    .in("location_id", ids)
    .not("lot_id", "is", null);

  const perLot = new Map<string, { qty: number; bestBefore: string | null }>();
  for (const m of (movements || []) as any[]) {
    const lot = m.lots;
    if (!lot) continue;
    const prev = perLot.get(lot.id) ?? { qty: 0, bestBefore: lot.best_before ?? null };
    prev.qty += Number(m.quantity_kg || 0);
    perLot.set(lot.id, prev);
  }

  const wanted = new Date(wantedDate + "T00:00:00").getTime();
  const candidates = [...perLot.entries()]
    .filter(([, v]) => v.qty >= quantity - 0.0001)
    .filter(([, v]) => {
      if (!v.bestBefore) return false;
      return new Date(v.bestBefore + "T00:00:00").getTime() - wanted >= 24 * 3600 * 1000;
    })
    .sort((a, b) => String(a[1].bestBefore).localeCompare(String(b[1].bestBefore)));

  if (candidates.length) return { status: "reserverad", lotId: candidates[0][0] };
  return { status: "inkopsbehov", lotId: null };
}

/* ------------------------------------------------------ orderuppbyggnad */

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Normaliserar telefon till +46-format. Rådata sparas orört i phone. */
function normPhone(v: unknown): string | null {
  if (v == null) return null;
  let d = String(v).replace(/[^0-9+]/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (d.startsWith("46")) d = "+" + d;
    else if (d.startsWith("0")) d = "+46" + d.slice(1);
    else d = "+46" + d;
  }
  d = "+" + d.slice(1).replace(/[^0-9]/g, "");
  return d.length < 8 ? null : d;
}

const normEmail = (v: unknown) =>
  v == null ? null : String(v).trim().toLowerCase() || null;

/** Sista ordet i ett fritt namnfält (används som reserv för gamla poster). */
const lastNameKey = (v: unknown) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : null;
};

/** Nyckel för det egna efternamnsfältet. */
const nameKey = (v: unknown) => String(v ?? "").trim().toLowerCase() || null;


type CustomerMatch =
  | { kind: "match"; id: string; via: string }
  | { kind: "ambiguous"; candidates: string[]; via: string }
  | { kind: "none" };

/**
 * Kundmatchning inom BOLAGET (inte butiken): Ålsten och Kungsholmen är samma
 * bolag och samma webbutik, så samma person är en kund.
 * Ordning: shopify_customer_id, normaliserad e-post, normaliserad telefon +
 * efternamn. Flera kandidater ger alltid granskning, aldrig tyst första rad.
 */
async function matchCustomer(
  db: SupabaseClient,
  entityId: string | null,
  keys: {
    shopifyCustomerId: string | null;
    email: string | null;
    phone: string | null;
    name: string;
    lastName: string | null;
  },
): Promise<CustomerMatch> {
  const base = () => {
    let q = db.from("customers_retail").select("id, name, last_name").is("anonymized_at", null);

    if (entityId) q = q.eq("legal_entity_id", entityId);
    return q;
  };

  if (keys.shopifyCustomerId) {
    const { data } = await base().eq("shopify_customer_id", keys.shopifyCustomerId);
    const rows = data || [];
    if (rows.length === 1) return { kind: "match", id: rows[0].id, via: "shopify_customer_id" };
    if (rows.length > 1) return { kind: "ambiguous", candidates: rows.map((r: any) => r.id), via: "shopify_customer_id" };
  }
  if (keys.email) {
    const { data } = await base().eq("email_normalized", keys.email);
    const rows = data || [];
    if (rows.length === 1) return { kind: "match", id: rows[0].id, via: "e-post" };
    if (rows.length > 1) return { kind: "ambiguous", candidates: rows.map((r: any) => r.id), via: "e-post" };
  }
  // Efternamnsfältet används exakt. Gamla poster utan fältet jämförs mot
  // sista ordet i det fria namnfältet så matchningen fungerar i övergången.
  const lk = nameKey(keys.lastName) ?? lastNameKey(keys.name);
  if (keys.phone && lk) {
    const { data } = await base().eq("phone_normalized", keys.phone);
    const rows = (data || []).filter(
      (r: any) => (nameKey(r.last_name) ?? lastNameKey(r.name)) === lk,
    );

    if (rows.length === 1) return { kind: "match", id: rows[0].id, via: "telefon + efternamn" };
    if (rows.length > 1) return { kind: "ambiguous", candidates: rows.map((r: any) => r.id), via: "telefon + efternamn" };
  }
  return { kind: "none" };
}

async function resolveCustomer(db: SupabaseClient, payload: any, storeId: string) {
  const c = payload?.customer ?? {};
  const ship = payload?.shipping_address ?? payload?.billing_address ?? {};
  const name =
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    [ship.first_name, ship.last_name].filter(Boolean).join(" ").trim() ||
    String(payload?.email ?? "").trim() ||
    "Webbkund";
  const firstName = String(c.first_name ?? ship.first_name ?? "").trim() || null;
  const lastName = String(c.last_name ?? ship.last_name ?? "").trim() || null;
  const phoneRaw = c.phone ?? ship.phone ?? payload?.phone ?? null;
  const emailRaw = c.email ?? payload?.email ?? payload?.contact_email ?? null;
  const shopifyCustomerId = c?.id != null ? String(c.id) : null;


  const { data: store } = await db
    .from("stores")
    .select("legal_entity_id")
    .eq("id", storeId)
    .maybeSingle();
  const entityId = (store?.legal_entity_id as string | null) ?? null;

  const address = {
    street: ship.address1 ?? null,
    postal_code: ship.zip ?? null,
    city: ship.city ?? null,
  };
  const snapshot = { name, phone: phoneRaw ?? null, ...address };

  const match = await matchCustomer(db, entityId, {
    shopifyCustomerId,
    email: normEmail(emailRaw),
    phone: normPhone(phoneRaw),
    name,
    lastName,
  });


  if (match.kind === "ambiguous") {
    return {
      id: null as string | null,
      created: false,
      review: `Tvetydig kundmatchning på ${match.via}: ${match.candidates.length} kandidater — kräver granskning`,
      matchedVia: match.via,
      ...snapshot,
    };
  }

  if (match.kind === "match") {
    // Kompletterar tomma fält utan att skriva över befintliga uppgifter.
    const { data: existing } = await db
      .from("customers_retail")
      .select("*")
      .eq("id", match.id)
      .maybeSingle();
    const patch: Record<string, unknown> = {};
    if (shopifyCustomerId && !existing?.shopify_customer_id) patch.shopify_customer_id = shopifyCustomerId;
    if (emailRaw && !existing?.email) patch.email = emailRaw;
    if (phoneRaw && !existing?.phone) patch.phone = phoneRaw;
    for (const k of ["street", "postal_code", "city"] as const) {
      if ((address as any)[k] && !existing?.[k]) patch[k] = (address as any)[k];
    }
    if (Object.keys(patch).length) await db.from("customers_retail").update(patch).eq("id", match.id);
    return {
      id: match.id,
      created: false,
      review: null as string | null,
      matchedVia: match.via,
      name: existing?.name ?? name,
      phone: existing?.phone ?? phoneRaw ?? null,
      street: existing?.street ?? address.street,
      postal_code: existing?.postal_code ?? address.postal_code,
      city: existing?.city ?? address.city,
    };
  }

  const { data, error } = await db
    .from("customers_retail")
    .insert({
      store_id: storeId,
      legal_entity_id: entityId,
      name,
      first_name: firstName,
      last_name: lastName,

      phone: phoneRaw ?? null,
      email: emailRaw ?? null,
      shopify_customer_id: shopifyCustomerId,
      source: "shopify",
      ...address,
    })
    .select("id")
    .single();
  if (error) throw new Error(`kunden kunde inte sparas: ${error.message}`);
  return { id: data.id as string, created: true, review: null as string | null, matchedVia: "ny kund", ...snapshot };
}


/** Skapar kundordern med rader. Anropas av webhooken och av manuellt butiksval. */
async function createOrder(db: SupabaseClient, payload: any, storeId: string, via: string) {
  const shopifyOrderId = String(payload?.id ?? "");
  const orderName = String(payload?.name ?? payload?.order_number ?? shopifyOrderId);

  const deliveryMethod = attr(payload, "Delivery Method");
  const isPickup = /pick\s*up|upph|h(ä|a)mt/i.test(deliveryMethod ?? "");
  const timeWindow = attr(payload, "Translated Delivery Time");
  const wantedDate =
    parseDeliveryDate(attr(payload, "Delivery Date")) ??
    String(payload?.created_at ?? new Date().toISOString()).slice(0, 10);

  const customer = await resolveCustomer(db, payload, storeId);

  const { data: orderNumber, error: numErr } = await db.rpc("next_customer_order_number", {
    _store_id: storeId,
    _date: new Date().toISOString().slice(0, 10),
  });
  if (numErr) throw new Error(`ordernummer kunde inte hämtas: ${numErr.message}`);

  const lineItems: any[] = Array.isArray(payload?.line_items) ? payload.line_items : [];
  const skus = lineItems.map((l) => String(l?.sku ?? "").trim()).filter(Boolean);
  // Shopify lämnar ibland SKU tomt (t.ex. signalkräftorna) — då kopplas raden
  // på produkttiteln istället, som också kan ligga som nyckel i kopplingstabellen.
  const titles = lineItems.map((l) => String(l?.title ?? l?.name ?? "").trim()).filter(Boolean);
  const mapKeys = [...new Set([...skus, ...titles])];

  const [{ data: products }, { data: mapped }] = await Promise.all([
    skus.length
      ? db.from("products").select("id, sku, unit, name").in("sku", skus)
      : Promise.resolve({ data: [] as any[] } as any),
    mapKeys.length
      ? db.from("shopify_product_map").select("shopify_sku, product_id").in("shopify_sku", mapKeys)
      : Promise.resolve({ data: [] as any[] } as any),
  ]);

  const bySku = new Map<string, any>();
  for (const p of (products || []) as any[]) bySku.set(String(p.sku).trim(), p);
  const mapBySku = new Map<string, string>();
  for (const m of (mapped || []) as any[]) mapBySku.set(String(m.shopify_sku).trim(), m.product_id);

  const extraIds = [...mapBySku.values()];
  const byId = new Map<string, any>();
  if (extraIds.length) {
    const { data: extra } = await db.from("products").select("id, sku, unit, name").in("id", extraIds);
    for (const p of (extra || []) as any[]) byId.set(p.id, p);
  }

  const notes: string[] = [];
  if (payload?.note) notes.push(String(payload.note));
  notes.push(`Shopify ${orderName} — butik via ${via}`);
  notes.push(`Kund: ${customer.matchedVia}`);
  if (customer.review) notes.push(customer.review);

  const paidTotal = Number(payload?.total_price ?? 0);
  const paid = String(payload?.financial_status ?? "").toLowerCase() === "paid";

  const { data: order, error: orderErr } = await db
    .from("customer_orders")
    .insert({
      order_number: orderNumber,
      store_id: storeId,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_phone_snapshot: customer.phone,
      order_type: isPickup ? "upphamtning" : "leverans",
      category: "vanlig",
      wanted_date: wantedDate,
      wanted_time: parseWindowStart(timeWindow),
      wanted_time_window: timeWindow,
      delivery_street: isPickup ? null : customer.street,
      delivery_postal_code: isPickup ? null : customer.postal_code,
      delivery_city: isPickup ? null : customer.city,
      status: "bekraftad",
      pack_status: "opackad",
      source: "shopify",
      received_by_name: "Shopify",
      note: notes.join(" · "),
      shopify_order_id: shopifyOrderId,
      shopify_order_number: orderName,
      is_web_order: true,
      web_paid: paid,
      paid_total: paidTotal || null,
      price_locked: true,
      web_delivery_method: deliveryMethod,
    })
    .select("id")
    .single();
  if (orderErr) throw new Error(`ordern kunde inte skapas: ${orderErr.message}`);

  let estimated = 0;
  let unmatched = 0;
  for (let i = 0; i < lineItems.length; i++) {
    const li = lineItems[i];
    const sku = String(li?.sku ?? "").trim();
    const title = String(li?.title ?? li?.name ?? "Okänd artikel");
    const mapKey = sku || title.trim();
    const product =
      (sku ? bySku.get(sku) : null) ??
      (mapBySku.has(mapKey) ? byId.get(mapBySku.get(mapKey)!) : null) ??
      (mapBySku.has(title.trim()) ? byId.get(mapBySku.get(title.trim())!) : null) ??
      null;
    // Styckvaror i antal, viktvaror i kg — mängden tas som den är.
    const qty = round3(Number(li?.quantity ?? 0));
    const price = round2(Number(li?.price ?? 0));
    const lineTotal = round2(qty * price);
    estimated += lineTotal;

    let reservation = { status: "ingen", lotId: null as string | null };
    if (product) {
      reservation = await evaluateReservation(db, product.id, storeId, wantedDate, qty);
    } else {
      unmatched++;
    }

    await db.from("customer_order_lines").insert({
      customer_order_id: order.id,
      product_id: product?.id ?? null,
      is_free_text: !product,
      free_text_name: product ? null : title,
      quantity_ordered: qty,
      paid_quantity: qty,
      unit: product ? stockUnitOf(product.unit) : "st",
      estimated_price_per_unit: price,
      // Förskottsbetald webborder: radpriset låses från Shopify.
      price_per_unit: price,
      line_total: lineTotal,
      price_locked: true,
      pack_status: "opackad",
      reservation_status: reservation.status,
      reserved_lot_id: reservation.lotId,
      reserved_quantity: reservation.status === "reserverad" ? qty : 0,
      shopify_line_id: li?.id != null ? String(li.id) : null,
      shopify_sku: sku || null,
      shopify_title: title,
      needs_product_match: !product,
      sort_order: i,
    });
  }

  await db
    .from("customer_orders")
    .update({ estimated_total: round2(estimated), total_incl_vat: round2(estimated) })
    .eq("id", order.id);

  await db.from("customer_order_events").insert({
    customer_order_id: order.id,
    event_type: "webborder_mottagen",
    description: `Shopify ${orderName} — betald via webben, priser låsta. Butik via ${via}.`,
    new_value: { shopify_order_id: shopifyOrderId, paid_total: paidTotal },
  });

  return {
    orderId: order.id as string,
    orderNumber,
    unmatched,
    customerId: customer.id,
    customerCreated: customer.created,
    customerReview: customer.review,
    matchedVia: customer.matchedVia,
  };
}

/* ------------------------------------------------------------- avbokning */

const PACK_LABEL: Record<string, string> = {
  pagaende: "under packning",
  packad: "färdigpackad",
};

/**
 * Avbokning från webben: markerar kundordern avbokad, frisläpper reserverade
 * partier och inköpsbehov, och signalerar larm om ordern redan var packad
 * eller under packning (varorna finns då fysiskt plockade i butiken).
 */
async function cancelOrder(
  db: SupabaseClient,
  payload: any,
  shopifyOrderId: string,
  orderName: string,
) {
  const { data: order } = await db
    .from("customer_orders")
    .select("id, order_number, store_id, status, pack_status")
    .eq("shopify_order_id", shopifyOrderId)
    .maybeSingle();
  if (!order) return { found: false as const, wasPacked: false };

  const handedOver = ["levererad", "avhamtad", "delvis_utlamnad"].includes(String(order.status));
  const packState = String(order.pack_status);
  const wasPacked = handedOver || packState === "packad" || packState === "pagaende";
  const packLabel = handedOver ? "redan utlämnad" : (PACK_LABEL[packState] ?? "opackad");

  const reason = String(payload?.cancel_reason ?? "").trim() || "avbokad i webbutiken";

  await db
    .from("customer_orders")
    .update({
      status: "avbruten",
      cancelled_at: payload?.cancelled_at ?? new Date().toISOString(),
      cancelled_reason: reason,
      cancelled_source: "shopify",
      cancelled_was_packed: wasPacked,
    })
    .eq("id", order.id);

  // Frisläpper reservationer och inköpsbehov så att partierna blir sökbara igen.
  const { data: released } = await db
    .from("customer_order_lines")
    .update({ reservation_status: "ingen", reserved_lot_id: null, reserved_quantity: 0 })
    .eq("customer_order_id", order.id)
    .in("reservation_status", ["reserverad", "inkopsbehov"])
    .select("id");

  await db.from("customer_order_events").insert({
    customer_order_id: order.id,
    event_type: "webborder_avbokad",
    description:
      `Shopify ${orderName} avbokad (${reason}). ${(released || []).length} rader frisläppta.` +
      (wasPacked ? ` LARM: ordern var ${packLabel} — kontrollera varorna.` : ""),
    new_value: { shopify_order_id: shopifyOrderId, was_packed: wasPacked, pack_status: packState },
  });

  return {
    found: true as const,
    orderId: order.id as string,
    orderNumber: order.order_number as string,
    storeId: order.store_id as string,
    wasPacked,
    packLabel,
    released: (released || []).length,
  };
}

/* ------------------------------------------------------------ bearbetning */


/**
 * Bearbetar en köad händelse. Körs ALLTID efter att svaret gått till Shopify,
 * så ett internt fel kan aldrig ge Shopify ett felsvar (Shopify raderar
 * prenumerationen om URL:en upprepat svarar annat än 200).
 */
async function processEvent(db: SupabaseClient, eventId: string): Promise<void> {
  const { data: ev } = await db
    .from("shopify_webhook_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return;

  const stamp = new Date().toISOString();
  await db
    .from("shopify_webhook_events")
    .update({
      status: "bearbetar",
      attempts: Number(ev.attempts ?? 0) + 1,
      last_attempt_at: stamp,
      error: null,
    })
    .eq("id", eventId);

  const fail = async (msg: string, status = "fel") => {
    await db
      .from("shopify_webhook_events")
      .update({ status, error: msg, processed_at: new Date().toISOString() })
      .eq("id", eventId);
  };

  try {
    let payload: any = ev.payload;
    if (!payload && ev.raw_body) {
      try {
        payload = JSON.parse(ev.raw_body);
      } catch {
        await fail("Ogiltig JSON i webhookens body");
        return;
      }
    }
    if (!payload) {
      await fail("Händelsen saknar payload");
      return;
    }

    const shopifyOrderId = payload?.id != null ? String(payload.id) : null;
    const orderName = String(payload?.name ?? payload?.order_number ?? shopifyOrderId ?? "");
    if (!shopifyOrderId) {
      await fail("Ordern saknar id");
      return;
    }

    await db
      .from("shopify_webhook_events")
      .update({ payload, shopify_order_id: shopifyOrderId, shopify_order_number: orderName })
      .eq("id", eventId);

    const topic = String(ev.topic ?? "orders/create").toLowerCase();

    /**
     * Idempotensnyckeln är order-id PLUS topic. En orders/cancelled för en känd
     * order är en ny händelse; bara omsändning av samma topic är ett duplikat.
     */
    const { data: sameTopic } = await db
      .from("shopify_webhook_events")
      .select("id, status, customer_order_id")
      .eq("shopify_order_id", shopifyOrderId)
      .eq("topic", ev.topic)
      .neq("id", eventId)
      .in("status", ["skapad", "avbokad", "avbokad_larm", "duplikat", "osorterad"]);
    if ((sameTopic || []).length) {
      const prev = (sameTopic || [])[0];
      await db
        .from("shopify_webhook_events")
        .update({
          status: "duplikat",
          customer_order_id: prev.customer_order_id ?? null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      return;
    }

    /* ---- Avbokning från webben ---- */
    if (topic === "orders/cancelled") {
      const res = await cancelOrder(db, payload, shopifyOrderId, orderName);
      if (!res.found) {
        await fail(`Avbokning för okänd order ${orderName} — ingen kundorder hittades`);
        return;
      }
      await db
        .from("shopify_webhook_events")
        .update({
          status: res.wasPacked ? "avbokad_larm" : "avbokad",
          store_id: res.storeId,
          customer_order_id: res.orderId,
          error: res.wasPacked
            ? `LARM: ${orderName} (${res.orderNumber}) avbokades men var ${res.packLabel} — kontrollera varorna i butiken`
            : null,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      return;
    }

    if (topic !== "orders/create" && topic !== "orders/paid") {
      await fail(`Topic ${topic} hanteras inte av systemet`, "okand_topic");
      return;
    }

    /* ---- Ny order ---- */
    // Samma order får aldrig bli två kundordrar.
    const { data: dupe } = await db
      .from("customer_orders")
      .select("id")
      .eq("shopify_order_id", shopifyOrderId)
      .maybeSingle();
    if (dupe) {
      await db
        .from("shopify_webhook_events")
        .update({
          status: "duplikat",
          customer_order_id: dupe.id,
          processed_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      return;
    }

    const { data: mapRows } = await db
      .from("shopify_store_map")
      .select("key_type, key_value, store_id, active");
    const { storeId, via } = resolveStore(payload, (mapRows || []) as MapRow[]);

    if (!storeId) {
      await fail("Butiken kunde inte avgöras — kräver manuellt butiksval", "osorterad");
      return;
    }

    const res = await createOrder(db, payload, storeId, via);
    await db
      .from("shopify_webhook_events")
      .update({
        status: "skapad",
        store_id: storeId,
        customer_order_id: res.orderId,
        error: res.customerReview,
        processed_at: new Date().toISOString(),
      })
      .eq("id", eventId);

  } catch (e) {
    await fail(e instanceof Error ? e.message : String(e));
  }
}

/** Kör bearbetningen efter att svaret skickats, utan att blockera svaret. */
function afterResponse(work: Promise<unknown>) {
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else void work;
}

/* ---------------------------------------------------------------- handler */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const raw = await req.text();

  /* Manuellt butiksval för osorterade webbordrar (kräver inloggad personal). */
  if (path.endsWith("/assign")) {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    const { data: userData } = await db.auth.getUser(token);
    if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const eventId = String(body?.event_id ?? "");
    const storeId = String(body?.store_id ?? "");
    if (!eventId || !storeId) return json({ ok: false, error: "event_id och store_id krävs" }, 400);

    const { data: ev } = await db
      .from("shopify_webhook_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return json({ ok: false, error: "Händelsen finns inte" }, 404);
    if (ev.status !== "osorterad") return json({ ok: false, error: "Händelsen är redan hanterad" }, 409);

    try {
      const payload = ev.payload ?? (ev.raw_body ? JSON.parse(ev.raw_body) : null);
      if (!payload) return json({ ok: false, error: "Händelsen saknar payload" }, 400);
      const res = await createOrder(db, payload, storeId, "manuellt butiksval");
      await db
        .from("shopify_webhook_events")
        .update({
          status: "skapad",
          store_id: storeId,
          customer_order_id: res.orderId,
          resolved_by: userData.user.id,
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", eventId);
      return json({ ok: true, ...res });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from("shopify_webhook_events").update({ error: msg }).eq("id", eventId);
      return json({ ok: false, error: msg }, 500);
    }
  }

  /* Kör om en misslyckad köad rad från Systemstatus (kräver inloggad personal). */
  if (path.endsWith("/reprocess")) {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "Ogiltig JSON" }, 400);
    }
    const eventId = String(body?.event_id ?? "");
    if (!eventId) return json({ ok: false, error: "event_id krävs" }, 400);
    const { data: ev } = await db
      .from("shopify_webhook_events")
      .select("id, status")
      .eq("id", eventId)
      .maybeSingle();
    if (!ev) return json({ ok: false, error: "Händelsen finns inte" }, 404);
    if (!["fel", "koad", "bearbetar"].includes(String(ev.status))) {
      return json({ ok: false, error: "Raden är redan färdigbehandlad" }, 409);
    }
    await processEvent(db, eventId);
    const { data: after } = await db
      .from("shopify_webhook_events")
      .select("status, error, customer_order_id")
      .eq("id", eventId)
      .maybeSingle();
    return json({ ok: after?.status !== "fel", ...after });
  }

  const secret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET") ?? "";
  const topic = req.headers.get("x-shopify-topic") ?? "orders/create";
  const header = req.headers.get("x-shopify-hmac-sha256") ?? "";

  /**
   * Saknad nyckel är ett internt konfigurationsfel, inte Shopifys fel:
   * logga det och svara 200 så att prenumerationen inte raderas.
   */
  if (!secret) {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: false,
      status: "fel",
      raw_body: raw,
      error: "SHOPIFY_WEBHOOK_SECRET saknas i miljön — signaturen kunde inte kontrolleras",
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Signeringsnyckel saknas" }, 200);
  }

  const expected = await hmacBase64(secret, raw);
  let signature = header;

  /**
   * Egen kontrollkörning: signaturen räknas ut med den konfigurerade nyckeln
   * och verifieras sedan i exakt samma kodväg som en riktig webhook. Kräver
   * inloggad personal och kan aldrig användas för att kringgå kontrollen.
   */
  if (path.endsWith("/selftest")) {
    const auth = req.headers.get("Authorization") ?? "";
    const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);
    signature = expected;
  }

  /* Enda felsvaret: ogiltig signatur. */
  if (!signature || !safeEqual(signature, expected)) {
    await db.from("shopify_webhook_events").insert({
      topic,
      hmac_valid: false,
      status: "ogiltig_hmac",
      error: "X-Shopify-Hmac-Sha256 stämmer inte med beräknad signatur",
      processed_at: new Date().toISOString(),
    });
    return json({ ok: false, error: "Ogiltig signatur" }, 401);
  }

  /* Signaturen är verifierad: spara rått i kön och kvittera direkt med 200. */
  let payload: any = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = null;
  }

  const { data: queued, error: queueErr } = await db
    .from("shopify_webhook_events")
    .insert({
      topic,
      hmac_valid: true,
      status: "koad",
      raw_body: raw,
      payload,
      shopify_order_id: payload?.id != null ? String(payload.id) : null,
      shopify_order_number: payload?.name ?? payload?.order_number ?? null,
    })
    .select("id")
    .single();

  if (queueErr || !queued) {
    // Kön kunde inte skrivas — logga i funktionsloggen och kvittera ändå med 200.
    console.error("kön kunde inte skrivas:", queueErr?.message);
    return json({ ok: false, queued: false, error: "Kön kunde inte skrivas" }, 200);
  }

  afterResponse(processEvent(db, queued.id));
  return json({ ok: true, queued: true, event_id: queued.id }, 200);
});

```

### `supabase/functions/shopify-backfill/index.ts`

```ts
/**
 * Backfyllnad av webbordrar från Shopify.
 *
 * Hämtar öppna, betalda ordrar via Shopify Admin API (REST orders.json,
 * status=open, financial_status=paid, paginerat med Link-huvudets page_info)
 * och lägger varje order i den BEFINTLIGA webhook-kön (shopify_webhook_events)
 * med topic orders/create och exakt samma payloadformat som en riktig webhook.
 *
 * Idempotens: kön har order-id PLUS topic som nyckel, så en order som redan
 * tagits emot blir "duplikat" och skapar aldrig en andra kundorder. Funktionen
 * är därför säker att köra hur många gånger som helst.
 *
 * Behörighet: endast inloggad personal (JWT valideras i koden).
 * Hemligheter: SHOPIFY_ADMIN_TOKEN och SHOPIFY_SHOP_DOMAIN — aldrig i koden.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  SHOPIFY_API_VERSION,
  configuredShop,
  getAdminToken,
  shopDomain,
} from "../_shared/shopify-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const API_VERSION = SHOPIFY_API_VERSION;

/** Nästa sida ur Shopifys Link-huvud (cursor-paginering). */
function nextPageInfo(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    if (!/rel="next"/.test(part)) continue;
    const url = part.match(/<([^>]+)>/)?.[1];
    if (!url) continue;
    return new URL(url).searchParams.get("page_info");
  }
  return null;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Endast POST" }, 405);

  const db = service();

  /* ---- Behörighet: inloggad personal ---- */
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);

  let body: any = {};
  try {
    body = req.body ? await req.json() : {};
  } catch {
    body = {};
  }
  const maxPages = Math.min(Math.max(Number(body?.max_pages ?? 10), 1), 50);

  /* ---- Token: OAuth-token för butiken, annars äldre shpat_-hemlighet ---- */
  const domain = shopDomain(body?.shop || configuredShop());
  if (!domain) {
    return json({ ok: false, error: "SHOPIFY_SHOP_DOMAIN måste finnas som hemlighet" }, 400);
  }
  const token = await getAdminToken(db, domain);
  if (!token) {
    return json(
      {
        ok: false,
        error:
          'Ingen Admin-token finns för butiken. Anslut Shopify via OAuth (knappen "Anslut Shopify") först.',
        needs_oauth: true,
      },
      400,
    );
  }


  const result = {
    ok: true,
    fetched: 0,
    queued: 0,
    duplicates: 0,
    errors: 0,
    unsorted: 0,
    pages: 0,
    messages: [] as string[],
  };

  let pageInfo: string | null = null;

  try {
    for (let page = 0; page < maxPages; page++) {
      const url = new URL(`https://${domain}/admin/api/${API_VERSION}/orders.json`);
      url.searchParams.set("limit", "250");
      if (pageInfo) {
        // Vid cursor-paginering får bara limit och page_info skickas med.
        url.searchParams.set("page_info", pageInfo);
      } else {
        url.searchParams.set("status", "open");
        url.searchParams.set("financial_status", "paid");
      }

      const res = await fetch(url.toString(), {
        headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      });

      if (res.status === 401 || res.status === 403) {
        return json(
          {
            ...result,
            ok: false,
            error:
              "Shopify nekade åtkomst (401/403). Token behöver läsbehörighet för ordrar: read_orders (plus read_all_orders om ordrar äldre än 60 dagar ska hämtas).",
          },
          400,
        );
      }
      if (!res.ok) {
        const text = await res.text();
        return json(
          { ...result, ok: false, error: `Shopify svarade ${res.status}: ${text.slice(0, 300)}` },
          400,
        );
      }

      const data = await res.json();
      const orders: any[] = Array.isArray(data?.orders) ? data.orders : [];
      result.pages++;
      result.fetched += orders.length;

      for (const order of orders) {
        const shopifyOrderId = order?.id != null ? String(order.id) : null;
        if (!shopifyOrderId) {
          result.errors++;
          continue;
        }

        // Redan mottagen som orders/create? Räknas som duplikat, inget köas.
        const { data: existing } = await db
          .from("shopify_webhook_events")
          .select("id")
          .eq("shopify_order_id", shopifyOrderId)
          .eq("topic", "orders/create")
          .in("status", ["skapad", "duplikat", "osorterad", "avbokad", "avbokad_larm"])
          .limit(1);
        if ((existing || []).length) {
          result.duplicates++;
          continue;
        }

        const raw = JSON.stringify(order);
        const { data: queued, error: qErr } = await db
          .from("shopify_webhook_events")
          .insert({
            topic: "orders/create",
            hmac_valid: true,
            status: "koad",
            raw_body: raw,
            payload: order,
            shopify_order_id: shopifyOrderId,
            shopify_order_number: order?.name ?? order?.order_number ?? null,
          })
          .select("id")
          .single();

        if (qErr || !queued) {
          result.errors++;
          result.messages.push(`${order?.name ?? shopifyOrderId}: kön kunde inte skrivas`);
          continue;
        }

        /**
         * Bearbetningen görs av webhook-funktionen så att backfyllnaden och
         * realtidsflödet delar exakt samma kodväg. Personalens token skickas
         * med — /reprocess kräver inloggning.
         */
        const fnRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-order-webhook/reprocess`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: auth,
              apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            },
            body: JSON.stringify({ event_id: queued.id }),
          },
        );
        const out = await fnRes.json().catch(() => ({}));
        const status = String((out as any)?.status ?? "");
        if (status === "skapad") result.queued++;
        else if (status === "duplikat") result.duplicates++;
        else if (status === "osorterad") {
          result.unsorted++;
          result.messages.push(`${order?.name ?? shopifyOrderId}: butiken kunde inte avgöras`);
        } else {
          result.errors++;
          result.messages.push(
            `${order?.name ?? shopifyOrderId}: ${(out as any)?.error ?? "bearbetningen misslyckades"}`,
          );
        }
      }

      pageInfo = nextPageInfo(res.headers.get("link") ?? res.headers.get("Link"));
      if (!pageInfo) break;
    }
  } catch (e) {
    return json(
      { ...result, ok: false, error: e instanceof Error ? e.message : String(e) },
      500,
    );
  }

  return json(result);
});
```

### `supabase/functions/shopify-oauth/index.ts`

```ts
/**
 * Shopify OAuth 2.0 (offline access token).
 *
 * Dev Dashboard-appar får inga shpat_-tokens längre, så butikens permanenta
 * Admin-token hämtas via OAuth:
 *
 *   POST /shopify-oauth/start   (inloggad personal)  → returnerar authorize-URL
 *   GET  /shopify-oauth/callback (Shopify)           → byter code mot token
 *   GET  /shopify-oauth/status  (inloggad personal)  → visar om token finns
 *
 * Hemligheter: SHOPIFY_API_KEY (klient-ID) och SHOPIFY_API_SECRET
 * (klienthemlighet, shpss_...). Token lagras i shopify_oauth_tokens och
 * returneras aldrig till klienten.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { apiKey, apiSecret, configuredShop, shopDomain } from "../_shared/shopify-admin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SCOPES = "read_orders,read_customers,read_locations";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const html = (title: string, message: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e6edf7;display:grid;place-items:center;height:100vh;margin:0}
div{max-width:34rem;padding:2rem;border:1px solid #1e2a44;border-radius:12px;background:#0f1830}
h1{font-size:1.1rem;margin:0 0 .5rem}p{margin:0;color:#9fb0cc;line-height:1.5}</style></head>
<body><div><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } },
  );

function service(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function functionBaseUrl(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/shopify-oauth`;
}

/** Konstant-tidsjämförelse av hex-strängar. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifierar Shopifys hmac-parameter på callback-URL:en. */
async function verifyQueryHmac(url: URL, secret: string): Promise<boolean> {
  const params = new URLSearchParams(url.search);
  const hmac = params.get("hmac") ?? "";
  if (!hmac) return false;
  params.delete("hmac");
  params.delete("signature");
  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return safeEqual(hex, hmac.toLowerCase());
}

/** Bara .myshopify.com-domäner får användas. */
function isValidShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const db = service();

  const clientId = apiKey();
  const clientSecret = apiSecret();

  /* ------------------------------------------------------------ callback */
  if (action === "callback") {
    if (!clientId || !clientSecret) {
      return html("Konfiguration saknas", "SHOPIFY_API_KEY och SHOPIFY_API_SECRET måste vara sparade.", 400);
    }
    const shop = shopDomain(url.searchParams.get("shop") ?? "");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    if (!isValidShop(shop) || !code || !state) {
      return html("Ogiltig återkoppling", "Shopify skickade ofullständiga uppgifter.", 400);
    }
    if (!(await verifyQueryHmac(url, clientSecret))) {
      return html("Signaturen stämmer inte", "Anropet kunde inte verifieras mot Shopify.", 401);
    }

    // state måste finnas och konsumeras exakt en gång
    const { data: stateRow } = await db
      .from("shopify_oauth_states")
      .select("state, shop, created_at")
      .eq("state", state)
      .maybeSingle();
    if (!stateRow || stateRow.shop !== shop) {
      return html("Sessionen gick inte att verifiera", "Starta anslutningen på nytt från Systemstatus.", 401);
    }
    await db.from("shopify_oauth_states").delete().eq("state", state);
    if (Date.now() - new Date(stateRow.created_at as string).getTime() > 15 * 60 * 1000) {
      return html("Anslutningen tog för lång tid", "Starta anslutningen på nytt från Systemstatus.", 401);
    }

    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    if (!res.ok) {
      const text = await res.text();
      return html("Shopify nekade tokenbytet", `Svar ${res.status}: ${text.slice(0, 200)}`, 400);
    }
    const payload = await res.json();
    const accessToken = payload?.access_token;
    if (!accessToken) return html("Ingen token mottogs", "Shopify svarade utan access_token.", 400);

    const { error } = await db.from("shopify_oauth_tokens").upsert(
      {
        shop,
        access_token: accessToken,
        scope: payload?.scope ?? null,
        access_mode: "offline",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shop" },
    );
    if (error) return html("Token kunde inte sparas", error.message, 500);

    return html(
      "Shopify är anslutet",
      `Butiken ${shop} är kopplad med behörigheterna ${payload?.scope ?? SCOPES}. Du kan stänga fönstret och köra hämtningen av ordrar.`,
    );
  }

  /* -------------------------------------------- start / status (personal) */
  const auth = req.headers.get("Authorization") ?? "";
  const { data: userData } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!userData?.user) return json({ ok: false, error: "Inloggning krävs" }, 401);

  if (action === "status") {
    const shop = configuredShop();
    const { data } = await db
      .from("shopify_oauth_tokens")
      .select("shop, scope, access_mode, updated_at")
      .eq("shop", shop)
      .maybeSingle();
    return json({
      ok: true,
      shop,
      connected: Boolean(data),
      scope: data?.scope ?? null,
      access_mode: data?.access_mode ?? null,
      updated_at: data?.updated_at ?? null,
      redirect_uri: `${functionBaseUrl()}/callback`,
      has_credentials: Boolean(clientId && clientSecret),
    });
  }

  if (action === "start") {
    if (!clientId || !clientSecret) {
      return json(
        { ok: false, error: "SHOPIFY_API_KEY och SHOPIFY_API_SECRET måste vara sparade som hemligheter" },
        400,
      );
    }
    let body: any = {};
    try {
      body = req.body ? await req.json() : {};
    } catch {
      body = {};
    }
    const shop = shopDomain(body?.shop || configuredShop());
    if (!isValidShop(shop)) {
      return json({ ok: false, error: "Ogiltig butiksdomän (ska vara namn.myshopify.com)" }, 400);
    }

    const state = crypto.randomUUID().replace(/-/g, "");
    const { error } = await db.from("shopify_oauth_states").insert({ state, shop });
    if (error) return json({ ok: false, error: error.message }, 500);

    const redirectUri = `${functionBaseUrl()}/callback`;
    const authorizeUrl =
      `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}&grant_options[]=`;

    return json({ ok: true, shop, authorize_url: authorizeUrl, redirect_uri: redirectUri });
  }

  return json({ ok: false, error: "Okänd åtgärd" }, 404);
});
```

