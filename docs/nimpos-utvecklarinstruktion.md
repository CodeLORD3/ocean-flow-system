# Nimpos → Makrill Trade: instruktion till utvecklaren

Detta dokument skickas till Nimpos-utvecklaren. Det beskriver exakt vad som ska
implementeras på Nimpos-sidan för att liveförsäljningen från kassorna ska hamna i
Makrill Trade. Vår mottagare är redan byggd och driftsatt — inget behöver byggas hos oss.

Kontakt/ägare av integrationen på vår sida: Makrill Trade (systemleverantör).

---

## 1. Omfattning: vilka bolag och butiker kopplingen gäller

Kopplingen ska ske för två bolag och fem butiker. Varje kassa/butik ska skicka en fast,
stabil `store_code` enligt tabellen nedan. Använd exakt dessa strängar (små bokstäver,
inga å/ä/ö) — de är redan förregistrerade hos oss.

### De No 1 AB

| Butik | `store_code` | Ort |
|---|---|---|
| Ålsten / Bromma | `alsten` | Stockholm |
| Kungsholmen | `kungsholmen` | Stockholm |

### Fisk & Skaldjursspecialisten No 1 AB

| Butik | `store_code` | Ort |
|---|---|---|
| Torslanda Torg | `torslanda-torg` | Göteborg |
| Torslanda Amhult | `amhult` | Göteborg |
| Särö | `saro` | Göteborg (Särö Centrum) |

Regler:
- `store_code` måste vara **oförändrad över tid** — den är nyckeln till butiken hos oss och
  styr vilket bolag försäljningen bokförs mot (moms, dagsrapport, redovisning).
- Har en butik flera kassor skickas samma `store_code` från alla, plus `register_id`
  (t.ex. `kassa-1`, `kassa-2`) så vi kan skilja kassorna åt.
- Nya butiker: hör av er innan första anropet, så registrerar vi koden. Okänd
  `store_code` gör att kvittot parkeras hos oss (svar 200) och måste kopplas manuellt.
- Valuta: samtliga fem butiker rapporterar i `SEK`.

---

## 2. Vad ni ska göra: pusha ett HTTPS-anrop per kvitto

Endpoint (produktion):

```
POST https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/nimpos-sales
```

Anropet ska ske **direkt vid kvittoavslut** (inte i nattbatch). Ingen inloggning, ingen
API-nyckel — autentiseringen är en HMAC-signatur (avsnitt 3).

Headers:

| Header | Värde |
|---|---|
| `Content-Type` | `application/json` |
| `X-Nimpos-Event-Id` | Stabilt unikt id per händelse. Får aldrig återanvändas. Samma id vid retry. |
| `X-Nimpos-Timestamp` | Unix-sekunder när anropet skapas. Avvisas om äldre än 5 minuter. |
| `X-Nimpos-Signature` | `sha256=<hex>` — HMAC-SHA256 av **rå body** med den delade hemligheten. |

---

## 3. Signering (obligatoriskt)

1. Serialisera bodyn till JSON **en gång** och spara strängen.
2. Räkna HMAC-SHA256 över exakt den byte-strängen med den delade hemligheten.
3. Skicka hex-värdet som `X-Nimpos-Signature: sha256=<hex>`.
4. Skicka samma byte-sträng som body. Ingen omserialisering, ingen pretty-print efteråt —
   ett enda extra blanktecken gör att signaturen inte stämmer.

Den delade hemligheten (32 byte slumpvärde) genereras av oss och överlämnas i separat,
säker kanal. Den ska kunna roteras: bygg den som konfiguration, inte hårdkodad. Under
rotation får ni gärna stödja två hemligheter samtidigt, men det är inget krav.

Exempel (Node):

```js
const crypto = require("crypto");
const raw = JSON.stringify(payload);
const sig = crypto.createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
await fetch(URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Nimpos-Event-Id": eventId,
    "X-Nimpos-Timestamp": String(Math.floor(Date.now() / 1000)),
    "X-Nimpos-Signature": `sha256=${sig}`,
  },
  body: raw,
});
```

---

## 4. Body-format

Ett kvitto per anrop.

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
        "quantity": 1.24,
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

Fältkrav:

| Fält | Krav |
|---|---|
| `external_id` | Obligatoriskt. Kassans egna transaktions-id, unikt för all framtid. Vår idempotensnyckel tillsammans med `X-Nimpos-Event-Id`. |
| `store_code` | Obligatoriskt, enligt avsnitt 1. |
| `occurred_at` | ISO 8601 **med tidszon** (`+02:00`/`+01:00`). Aldrig lokal tid utan offset. |
| Alla belopp | **Öre som heltal** (`24900` = 249,00 kr). Aldrig decimaltal, aldrig strängar. |
| `total_ore` | Inkl. moms. Ska vara lika med summan av `payments[].amount_ore`. |
| `vat_breakdown` | En post per momssats som förekommer (6/12/25 %). Nettobelopp och momsbelopp i öre. |
| `payments` | En post per betalning. Blandbetalning = flera poster. `method`: `card`, `cash`, `swish`, `invoice`, `other`. |
| `quantity` | Viktvaror i kg med upp till 3 decimaler, styckvaror som heltal. `unit`: `kg` eller `st`. |
| `barcode` / `sku` | Minst ett av dem, helst båda — det är så vi matchar mot vårt artikelregister. |
| `control_code` | Kontrollkod från kontrollenheten om ni har den (Skatteverkets krav). |
| `type` | `sale` eller `return`. |
| `reverses_external_id` | Obligatoriskt vid `type: "return"` — `external_id` på det kvitto som återköps/makuleras. |

Skicka **inga kunduppgifter** (namn, personnummer, fullständiga kortnummer). Vi behöver
dem inte för butiksköp och de kastas i steg 1 hos oss.

Returer/makuleringar skickas som **egna events** med negativa belopp och
`reverses_external_id` satt — ändra aldrig ett redan skickat kvitto.

---

## 5. Svarskoder och retry

| Svar | Betydelse | Vad ni ska göra |
|---|---|---|
| `200 {"ok":true}` | Mottaget och bearbetat | Klart |
| `200 {"ok":true,"duplicate":true}` | Vi har redan händelsen | Klart, ingen retry |
| `400` | Trasig body eller saknad header | **Retry:a inte** — logga och larma, det är ett kodfel |
| `401` | Fel signatur | **Retry:a inte** — fel hemlighet eller omserialiserad body |
| `5xx` / timeout | Vårt fel | Retry:a med exponentiell backoff |

Backoff-krav: 1 s, 5 s, 30 s, 5 min, 30 min, sedan varje timme upp till 24 timmar. Samma
`X-Nimpos-Event-Id` vid varje försök — vi är idempotenta och skapar aldrig dubbletter.
Kassan får aldrig blockeras av vårt endpoint: skicka asynkront från en kö, timeout 10 s.

---

## 6. Läs-API för nattlig avstämning (skallkrav)

Push tappar alltid enstaka anrop över tid (nät, deploy, köhaveri). För att siffrorna ska
kunna användas som underlag för stängningsrapport och bokföring behöver vi kunna stämma av.
Ni ska därför exponera **ett** av följande, skyddat med API-nyckel eller Basic auth:

- `GET /sales?store_code=&from=&to=&cursor=` som returnerar samma kvittoobjekt som i
  avsnitt 4 (paginerat), eller
- en dagsrapport per butik och dag med: antal kvitton, bruttoomsättning, moms per sats och
  summa per betalsätt.

Vi kör en nattlig jobb som jämför antal kvitton och summa per butik och dag och hämtar in
det som saknas. Utan denna källa kan vi bara visa live-signal, inte garantera fullständighet.

---

## 7. Test och driftsättning

1. Vi genererar och överlämnar den delade hemligheten (separat kanal).
2. Ni skickar 5 testkvitton från en butik (helst `torslanda-torg`): kortköp, kontantköp,
   blandbetalning, viktvara med 3 decimaler, samt en retur som refererar till ett av dem.
3. Vi bekräftar att alla fem syns korrekt i vår admin (belopp, moms, betalsätt, artiklar).
4. Ni slår på push för resterande fyra butiker.
5. Vi verifierar avstämnings-API:t mot en hel dag innan integrationen godkänns.

Skicka gärna, om ni har det, en sandbox/testmiljö samt fem riktiga exempel-payloads så vi
kan validera parsningen mot verklig data innan driftsättning.

---

## 8. Frågor vi behöver svar på

1. Kan ni pusha per kvitto vid avslut, eller batchas det? Hur ofta?
2. Skickar ni öre eller kronor, och hur representeras vikt?
3. Hur ser makulering, retur och parkerat kvitto ut i era events?
4. Är butiks-/kassa-id stabilt över tid, och kan ni skicka vår `store_code` som eget fält?
5. Följer kontrollkod/kontrollenhets-id med?
6. Finns läs-API eller dagsrapport för avstämning (avsnitt 6)?
7. Har ni retry med backoff, och hur länge?
8. Vill ni att vi pushar sortiment/priser i andra riktningen?
