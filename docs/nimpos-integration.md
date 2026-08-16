# Förundersökning: liveförsäljning från Nimpos-kassor in i Makrill Trade

Status: förundersökning (inget byggt). Beslutsunderlag + färdig kravspec att skicka till Nimpos.

## 1. Utgångspunkt

Nimpos vill **pusha** data till oss, inte att vi pollar deras portal. Det passar oss bra:
push ger lägst latens ("live"), minst kostnad och vi slipper lagra deras API-nycklar.

Vi lägger alltså ut **ett publikt HTTPS-endpoint** (en edge-funktion) som Nimpos anropar
vid varje kvitto. Vi behåller ändå en **pull-fallback** (se 7) eftersom push alltid tappar
anrop ibland — nät, deploy, deras kö.

Målbild i admin: per butik och dag se omsättning, antal köp, snittkvitto, betalsätt,
topprodukter och en live-ström av senaste kvitton — utan att gå in i Nimpos-portalen.

## 2. Arkitektur

```text
Nimpos kassa ──POST──▶ /functions/v1/nimpos-sales   (edge, verify_jwt=false)
                          │  1. HMAC-verifiering (delad hemlighet)
                          │  2. rå händelse → nimpos_webhook_events (idempotens)
                          │  3. mappning butik/kassör/produkt
                          ▼
                 pos_transactions + pos_transaction_items  (befintliga tabeller)
                          │
                          ▼
        Admin: /pos-live  (Realtime-prenumeration + dagsaggregat per butik)
```

Vi återanvänder mönstret från Shopify-webhooken (se `docs/shopify-integration.md`):
råhändelse först, bearbetning sen, allt idempotent på externt id.

## 3. Endpointkontrakt (det Nimpos ska implementera mot)

`POST https://<vår-domän>/functions/v1/nimpos-sales`

Headers:
- `Content-Type: application/json`
- `X-Nimpos-Event-Id: <stabilt unikt id per händelse>`
- `X-Nimpos-Signature: sha256=<hex HMAC av rå body med delad hemlighet>`
- `X-Nimpos-Timestamp: <unix-sekunder>` (avvisas om äldre än 5 min → skydd mot replay)

Body (ett kvitto per anrop; `items` kan vara tom vid t.ex. makulering):

```json
{
  "event_type": "sale.completed",
  "receipt": {
    "external_id": "nimpos-tx-8891234",
    "receipt_no": "A-100231",
    "store_code": "amhult",
    "register_id": "kassa-2",
    "cashier_code": "erik",
    "occurred_at": "2026-08-16T14:02:11+02:00",
    "currency": "SEK",
    "total_ore": 24900,
    "vat_breakdown": [{ "rate": 12, "net_ore": 22232, "vat_ore": 2668 }],
    "payments": [{ "method": "card", "amount_ore": 24900, "card_brand": "visa", "last4": "4242" }],
    "control_code": "AB12CD34",
    "type": "sale",
    "reverses_external_id": null,
    "items": [
      {
        "line_no": 1,
        "sku": "1234",
        "barcode": "7350000000000",
        "name": "Lax filé",
        "quantity": 1.240,
        "unit": "kg",
        "unit_price_ore": 19900,
        "discount_ore": 0,
        "line_total_ore": 24676,
        "vat_rate": 12
      }
    ]
  }
}
```

Svar:
- `200 {"ok":true,"duplicate":false}` — mottaget (och vid dubblett `duplicate:true`, samma 200).
- `400` — trasig body/signatur saknas: Nimpos ska **inte** retry:a.
- `401` — felaktig signatur.
- `5xx` — vårt fel: Nimpos ska retry:a med exponentiell backoff (t.ex. 1s, 5s, 30s, 5m, 30m, upp till 24h).

Krav på Nimpos: stabila id:n som aldrig återanvänds, alla belopp i **öre som heltal**,
tidsstämpel med tidszon, retur/makulering som eget event med `type:"return"` och
`reverses_external_id` satt. Ingen personuppgift utöver vad vi behöver (inga fullständiga
kortnummer, inga personnummer).

## 4. Vad som saknas i vår databas

`pos_transactions` finns redan med `store_id`, `receipt_no`, `occurred_at`, `total_ore`,
`vat_breakdown`, `payment_method`, `status`, `legal_entity_id` — men den är byggd för vår
egen POS. Tillägg som behövs:

| Tabell | Tillägg |
|---|---|
| `pos_transactions` | `source text default 'internal'` ('internal' \| 'nimpos'), `external_id text`, `external_register text`, unikt index på `(source, external_id)` |
| `pos_transactions` | `cashier_id` måste bli nullable (Nimpos-kassörer finns inte i `pos_cashiers`) + `external_cashier text` |
| `pos_transaction_items` | `external_line_no int`, `barcode text` (product_id förblir nullable vid omatchad artikel) |
| ny: `nimpos_webhook_events` | `event_id` (unik), `event_type`, `payload jsonb`, `status`, `attempts`, `last_error`, `transaction_id`, `received_at`, `processed_at` |
| ny: `nimpos_store_map` | `store_code` → `store_id` (+ `register_id`, `active`) |
| ny: `nimpos_product_map` | `external_sku`/`barcode` → `products.id`, `unmatched_count` |

Alla nya tabeller: GRANT + RLS (läs för `authenticated` med admin/scope-kontroll, skrivning
bara via service_role i edge-funktionen).

## 5. Mappningskedjor (samma fallback-filosofi som Shopify)

- **Butik**: `nimpos_store_map.store_code` → annars `register_id`-mappning → annars
  parkeras händelsen som `unmapped_store` och visas i admin för manuell koppling.
- **Kassör**: `pos_cashiers.display_name`/kod → annars sparas rå `external_cashier`.
- **Produkt**: EAN mot `products.barcode` → `pos_products.article_sku`/`sku` →
  `nimpos_product_map` → annars omatchad rad (namn + belopp sparas ändå, försäljningen
  blir aldrig fel i kronor, bara i artikelstatistik). Omatchade rader listas för mappning.
- **Betalsätt**: normaliseras till `card` \| `cash` \| `swish` \| `invoice` \| `other`.
  Delbetalningar: första posten till `payment_method`, hela arrayen i `payment_details`.

## 6. Adminvyn (live)

Ny sida `/pos-live` i admin (+ per butik i butiksportalen, filtrerad på egen `store_id`):

- Topp: dagens omsättning, antal köp, snittkvitto, jämförelse mot samma veckodag förra veckan.
- Kort per butik: omsättning idag, antal köp, senaste kvitto-tid, "grön puls" om kvitto
  kommit senaste 15 min (annars varning: kassan kanske offline).
- Timgraf över omsättning/antal köp.
- Live-lista senaste 50 kvitton (Supabase Realtime på `pos_transactions`) med expanderbara rader.
- Topp 10 produkter idag och betalsättsfördelning.
- Driftpanel: antal händelser i `failed`/`unmapped` status + knapp "kör om".

Aggregat görs via en `security definer`-funktion (`pos_live_summary(_from, _to)`) så vi inte
drar hem tusentals rader till klienten.

## 6b. Grund för stängningsrapporten (Dagsrapport)

Kassadatan ska inte bara visas live — den ska vara **källan** till stängningsrapporten på
`/daily-report`, så att butiken inte skriver av siffror manuellt från Nimpos-portalen.

### Fältmappning Nimpos → `daily_reports`

| Fält i stängningsrapporten | Källa från kassadatan | Regel |
|---|---|---|
| `gross_sales` | SUM(`pos_transactions.total_ore`)/100 för dagen och butiken | inkl. moms, retur/makulering med negativt tecken |
| `net_sales` | brutto − moms (`vat_breakdown.vat_ore`) | fallback: brutto/1,12 om momsrader saknas |
| `receipt_count` | COUNT(kvitton med status `completed`) | returer räknas separat, ej som köp |
| `largest_sale` | MAX(`total_ore`)/100 | endast positiva kvitton |
| Betalsätt (kort/kontant/Swish) | SUM per `payments.method` | visas som avstämningsrad mot brutto |
| Moms per sats | SUM per `vat_breakdown.rate` | 12 % / 25 % / 6 % separat |
| Topprodukter | `pos_transaction_items` | informativ, sparas ej i rapporten |
| `staff_entries` | `pos_cashiers` + `staff_shifts` (stämpelklockan) | kassörskod matchas mot personal |
| `waste_items` | manuellt (svinn finns inte i kassan) | oförändrat |
| `comment`, `staff_notes` | manuellt | oförändrat |

### Live-beteende i formuläret

- Sidan prenumererar på `pos_transactions` (Realtime) för valt datum + butik och räknar om
  summorna direkt när ett nytt kvitto kommer in — fälten är alltså ifyllda **innan** man
  börjar skriva, och uppdateras under dagen.
- Varje autoifyllt fält visas som förifyllt värde med källmarkering ("från kassan") och en
  **lås-/redigera-knapp**. Om personalen skriver över värdet sparas både det manuella
  värdet och kassans värde, plus en diff (`pos_diff`) så avvikelser syns i admin.
- Är kassan offline/omappad visas en varning i toppen ("kassadata saknas för X — fyll i
  manuellt") och fälten faller tillbaka till dagens beteende (helt manuella).
- Vid dagens slut (stängning) fryses kassavärdena i rapporten: `pos_snapshot_at` sätts och
  senare inkommande kvitton för samma datum flaggas som efterregistrering i driftpanelen.

### DB-tillägg för detta

```sql
alter table public.daily_reports
  add column pos_gross_sales   numeric(12,2),
  add column pos_net_sales     numeric(12,2),
  add column pos_receipt_count integer,
  add column pos_largest_sale  numeric(12,2),
  add column pos_payments      jsonb not null default '[]'::jsonb,
  add column pos_vat_breakdown jsonb not null default '[]'::jsonb,
  add column pos_snapshot_at   timestamptz,
  add column pos_source        text;   -- 'nimpos' | 'manual'
```

Plus en `security definer`-funktion `pos_day_summary(_store_id uuid, _date date)` som
returnerar exakt de fält tabellen ovan behöver — samma funktion används av både live-vyn och
stängningsrapporten så siffrorna alltid är identiska.

Detta blir **etapp 4b** (efter live-vyn), eftersom det bygger på samma aggregatfunktion.

## 7. Fallback och avstämning

1. **Retry hos Nimpos** (deras ansvar, se svarskoder ovan).
2. **Reconcile-pull**: Nimpos exponerar `GET /sales?updated_since=&cursor=` (eller
   dagsrapport-CSV). Vi kör en nattlig cron `nimpos-reconcile` som jämför antal kvitton och
   summa per butik och dag och hämtar in det som saknas. Detta är enda anledningen till att
   vi behöver läsåtkomst hos dem — utan det kan vi aldrig bevisa att inget tappats.
3. **Larm**: butik utan kvitto under öppettid > 60 min → notis i systemet.

## 8. Säkerhet

- Delad HMAC-hemlighet per butikskedja (`NIMPOS_WEBHOOK_SECRET`), roterbar.
- Timestamp-fönster 5 min, `event_id`-unikhet → replay-skydd.
- `verify_jwt = false` på funktionen, men inget skrivs utan giltig signatur.
- Rå payload sparas i `nimpos_webhook_events` (rensas efter 90 dagar) för felsökning.
- Ingen kunddata behövs för butiksköp; om Nimpos skickar kunduppgifter ignorerar vi dem
  i steg 1 och tar beslut separat (GDPR).

## 9. Etapper

| Etapp | Innehåll | Uppskattning |
|---|---|---|
| 1 | Migration: kolumner + tre nya tabeller, GRANT/RLS | liten |
| 2 | Edge-funktion `nimpos-sales`: signatur, idempotens, råloggning | medel |
| 3 | Bearbetning: butik/kassör/produkt-mappning → pos_transactions/items | medel |
| 4 | Adminvy `/pos-live` + Realtime + `pos_live_summary()` | medel |
| 4b | Stängningsrapporten autoifylld live från kassan (se 6b) | medel |
| 5 | Mappnings-UI (omatchade butiker/produkter) + driftpanel | liten |
| 6 | `nimpos-reconcile` cron + offline-larm | medel |
| 7 | (valfritt) koppling till lager/partiavdrag och dagsrapporter | större |

Etapp 1–4 ger redan det efterfrågade: se live per ställe utan Nimpos-portalen.

## 10. Frågor till Nimpos innan vi bygger

1. Kan ni pusha **per kvitto direkt vid avslut** (annars: hur ofta batchas det?)
2. Stödjer ni HMAC-signering av body och en anpassad `Event-Id`-header?
3. Har ni retry med backoff, och hur länge?
4. Skickar ni **öre eller kronor**, och hur representeras vikt (kg med 3 decimaler?)
5. Hur ser makulering/retur/parkerat kvitto ut i era events?
6. Vilket **butiks-/kassa-id** följer med, och är det stabilt över tid?
7. Skickas kontrollkod/kontrollenhets-id (Skatteverkets krav) med?
8. Finns ett läs-API eller dagsrapport för nattlig avstämning?
9. Kan vi få en testmiljö/sandbox och exempel-payloads (helst 5 riktiga JSON-exempel:
   kort, kontant, blandbetalning, retur, viktvara)?
10. Skickar ni prisuppdateringar åt andra hållet (vill ni att vi pushar sortiment/priser)?

## 11. Rekommendation

Bygg push-endpointet enligt ovan (etapp 1–4), och gör punkt 8 i frågelistan till ett
skallkrav — utan avstämningskälla vet vi inte om vi tappat kvitton, och då kan siffrorna i
admin inte användas som bokföringsunderlag, bara som livesignal.
