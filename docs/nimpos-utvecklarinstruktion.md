# Sales Ingest API v1 — integrationsspecifikation för Nimpos

Detta dokument är allt en extern utvecklare behöver. Inget konto, ingen inloggning och
ingen åtkomst till Makrill Trades gränssnitt eller databas krävs — endast ett publikt
HTTPS-endpoint och en delad hemlighet.

Ni bygger: ett utgående anrop per kvitto, samt (rekommenderat) ett läs-API hos er för
nattlig avstämning (avsnitt 8).

---

## 1. Endpoint

```
POST https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/nimpos-sales
```

- TLS obligatoriskt. HTTP/1.1 eller HTTP/2.
- Ingen API-nyckel, ingen Bearer-token, ingen IP-vitlistning. Autentisering sker
  uteslutande via HMAC-signatur (avsnitt 3).
- Anropet ska ske direkt vid kvittoavslut, asynkront från en kö. Sätt timeout 10 sekunder;
  kassan får aldrig blockeras av vårt endpoint.
- `OPTIONS` besvaras med CORS-headers. Alla andra metoder än `GET`/`POST`/`OPTIONS` ger `405`.

---

## 2. Butikskoder (`store_code`)

Varje kassa ska skicka en fast `store_code`. Koderna nedan är redan registrerade i vårt
system och styr vilket bolag försäljningen bokförs mot. Använd exakt dessa strängar —
små bokstäver, inga å/ä/ö.

### De No 1 AB

| Butik | `store_code` |
|---|---|
| Ålsten / Bromma | `alsten` |
| Kungsholmen | `kungsholmen` |

### Fisk & Skaldjursspecialisten No 1 AB

| Butik | `store_code` |
|---|---|
| Torslanda Torg | `torslanda-torg` |
| Torslanda Amhult | `amhult` |
| Särö | `saro` |

Regler:
- `store_code` måste vara oförändrad över tid. Den är butikens identitet hos oss.
- Flera kassor i samma butik skickar samma `store_code` men olika `register_id`
  (t.ex. `kassa-1`, `kassa-2`).
- Okänd `store_code` gör att kvittot **parkeras** hos oss — svaret blir `200` med
  `"parked":"unmapped_store"`. Kvittot är inte förlorat, men det räknas inte som
  försäljning förrän koden kopplats. Meddela oss innan ni börjar skicka en ny butik.
- Samtliga fem butiker rapporterar i `SEK`.

---

## 3. Autentisering: HMAC-SHA256

En delad hemlighet (32 byte slumpvärde, hex) överlämnas av oss i separat säker kanal.

Så här signerar ni:

1. Serialisera bodyn till JSON **en gång** och spara resultatet som en byte-sträng.
2. Räkna `HMAC-SHA256(hemlighet, raw_body)`.
3. Skicka hex-värdet i `X-Nimpos-Signature: sha256=<hex>`.
4. Skicka **exakt samma byte-sträng** som body.

Viktigt: signaturen räknas över råa bytes. Omserialisera, indentera eller ändra inte
bodyn efter signeringen — ett enda extra blanktecken ger `401`.

Headers:

| Header | Krav | Beskrivning |
|---|---|---|
| `Content-Type` | Ja | `application/json` |
| `X-Nimpos-Signature` | Ja | `sha256=<hex HMAC av rå body>` |
| `X-Nimpos-Event-Id` | Ja | Stabilt unikt id per händelse. Får aldrig återanvändas. **Samma id vid retry** — det är vår dubblettspärr. |
| `X-Nimpos-Timestamp` | Rekommenderad | Unix-sekunder. Avvisas med `400 stale_timestamp` om mer än 300 sekunder från vår serverklocka. Kräver NTP-synkad klocka. |

Hemligheten ska ligga i konfiguration, inte i kod, så den kan roteras utan release.

Signeringsexempel (Node 18+):

```js
const crypto = require("crypto");

async function send(payload, eventId, SECRET) {
  const raw = JSON.stringify(payload);
  const sig = crypto.createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
  const res = await fetch(
    "https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/nimpos-sales",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Nimpos-Signature": `sha256=${sig}`,
        "X-Nimpos-Event-Id": eventId,
        "X-Nimpos-Timestamp": String(Math.floor(Date.now() / 1000)),
      },
      body: raw, // exakt samma sträng som signerades
    },
  );
  return { status: res.status, body: await res.json() };
}
```

C# (.NET):

```csharp
var raw = JsonSerializer.Serialize(payload);
using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
var sig = Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(raw))).ToLower();

var req = new HttpRequestMessage(HttpMethod.Post, url);
req.Headers.Add("X-Nimpos-Signature", $"sha256={sig}");
req.Headers.Add("X-Nimpos-Event-Id", eventId);
req.Headers.Add("X-Nimpos-Timestamp", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString());
req.Content = new StringContent(raw, Encoding.UTF8, "application/json");
```

---

## 4. Request body

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

### Fältreferens — `receipt`

| Fält | Typ | Krav | Regler |
|---|---|---|---|
| `external_id` | string | Ja | Kassans transaktions-id. Unikt för all framtid. Vår andra dubblettspärr och nyckeln för statusuppslag (avsnitt 7). |
| `receipt_no` | string | Nej | Kvittonummer som det står på papperskvittot. |
| `store_code` | string | Ja | Enligt avsnitt 2. |
| `register_id` | string | Rek. | Kassa-id inom butiken. |
| `cashier_code` | string | Rek. | Kassörens kod/namn. Sparas rått om vi inte känner igen den. |
| `occurred_at` | string | Ja | ISO 8601 **med tidszonsoffset** (`+02:00` sommar, `+01:00` vinter). Aldrig lokal tid utan offset. Utan fält används mottagningstid. |
| `currency` | string | Ja | `SEK` för dessa butiker. |
| `total_ore` | integer | Ja | Totalt inkl. moms i **öre**. Ska vara lika med summan av `payments[].amount_ore`. |
| `vat_breakdown` | array | Ja | En post per förekommande momssats: `{ rate, net_ore, vat_ore }`. `rate` i procent (6/12/25). |
| `payments` | array | Ja | En post per betalning: `{ method, amount_ore, card_brand?, last4? }`. Blandbetalning = flera poster. |
| `control_code` | string | Rek. | Kontrollkod från kontrollenheten (Skatteverkets krav). |
| `type` | string | Ja | `sale` eller `return`. |
| `reverses_external_id` | string | Vid retur | `external_id` på kvittot som återköps/makuleras. |
| `items` | array | Ja | Kvittorader. Får vara tom vid t.ex. rena makuleringar. |

### Fältreferens — `items[]`

| Fält | Typ | Krav | Regler |
|---|---|---|---|
| `line_no` | integer | Rek. | Radnummer på kvittot. |
| `sku` | string | Ja* | Artikelnummer i kassan. |
| `barcode` | string | Ja* | EAN/GTIN. |
| `name` | string | Ja | Artikelnamn som det visas på kvittot. |
| `quantity` | number | Ja | Viktvara: kg med upp till 3 decimaler. Styckvara: heltal. Alltid **positivt** — retur styrs av `type`. |
| `unit` | string | Ja | `kg` eller `st`. |
| `unit_price_ore` | integer | Ja | Pris per enhet i öre, inkl. moms. |
| `discount_ore` | integer | Nej | Rabatt på raden i öre, positivt tal. |
| `line_total_ore` | integer | Ja | Radsumma i öre efter rabatt, inkl. moms. |
| `vat_rate` | number | Ja | Momssats i procent. |

\* Minst ett av `sku` och `barcode` måste finnas, helst båda — det är så artikeln matchas
mot vårt artikelregister. Matchar den inte bokförs raden ändå med namn och belopp, så
kronorna blir aldrig fel; bara artikelstatistiken saknas tills vi kopplat artikeln.

### Absoluta krav på format

- **Alla belopp i öre som heltal.** `24900` = 249,00 kr. Aldrig `249.00`, aldrig strängar.
- **Alla tidsstämplar med tidszon.**
- **Inga kunduppgifter.** Skicka inte namn, adress, personnummer eller fullständiga
  kortnummer. Vi behöver dem inte för butiksköp och de kastas vid mottagning.
- **Ändra aldrig ett redan skickat kvitto.** Retur och makulering skickas som nya events
  med `type: "return"`, positiva `quantity`/belopp och `reverses_external_id` satt. Vi
  vänder tecknet på vår sida.

---

## 5. Svar

Alla svar är JSON.

| HTTP | Body | Betydelse | Er åtgärd |
|---|---|---|---|
| `200` | `{"ok":true,"duplicate":false,"transaction_id":"...","unmatched_items":0}` | Mottaget och bokfört | Klart |
| `200` | `{"ok":true,"duplicate":true}` | Vi hade redan händelsen (samma `X-Nimpos-Event-Id` eller `external_id`) | Klart, ingen retry |
| `200` | `{"ok":true,"parked":"unmapped_store","message":"..."}` | Okänd `store_code` — parkerat hos oss | Ingen retry. Larma internt + kontakta oss |
| `200` | `{"ok":true,"parked":"failed","message":"..."}` | Vi kunde inte bearbeta innehållet | Ingen retry. Skicka `message` till oss |
| `400` | `{"error":"missing_headers"}` | `X-Nimpos-Signature` eller `X-Nimpos-Event-Id` saknas | **Ingen retry** — kodfel |
| `400` | `{"error":"stale_timestamp"}` | Tidsstämpel mer än 5 min fel | Kontrollera NTP, skicka om med ny tidsstämpel |
| `400` | `{"error":"bad_json"}` / `{"error":"missing_receipt"}` | Trasig body | **Ingen retry** — kodfel |
| `401` | `{"error":"bad_signature"}` | Fel hemlighet eller omserialiserad body | **Ingen retry** — kodfel |
| `405` | `{"error":"method_not_allowed"}` | Fel HTTP-metod | Ingen retry |
| `5xx` | `{"error":"..."}` eller tomt | Vårt fel | Retry:a |
| timeout | — | Okänt utfall | Retry:a med samma event-id |

`unmatched_items` > 0 betyder att kvittot bokförts men att vissa artiklar inte kunde
matchas mot vårt register. Det kräver ingen åtgärd av er.

### Retry-krav

Vid `5xx` och timeout: exponentiell backoff **1 s → 5 s → 30 s → 5 min → 30 min → varje
timme upp till 24 timmar**. Använd samma `X-Nimpos-Event-Id` vid varje försök. Vi är
idempotenta på både event-id och `external_id`, så dubbletter kan aldrig uppstå.

Vid `400`/`401`: retry:a inte — det är alltid ett kodfel som måste rättas. Larma i stället.

---

## 6. Kom-igång med curl

```bash
SECRET="<delad hemlighet>"
URL="https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/nimpos-sales"

BODY='{"event_type":"sale.completed","receipt":{"external_id":"test-001","receipt_no":"T-1","store_code":"torslanda-torg","register_id":"kassa-1","cashier_code":"test","occurred_at":"2026-08-16T14:02:11+02:00","currency":"SEK","total_ore":24900,"vat_breakdown":[{"rate":12,"net_ore":22232,"vat_ore":2668}],"payments":[{"method":"card","amount_ore":24900}],"type":"sale","items":[{"line_no":1,"sku":"1234","barcode":"7350000000000","name":"Lax file","quantity":1.24,"unit":"kg","unit_price_ore":19900,"line_total_ore":24676,"vat_rate":12}]}}'

SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')

curl -sS -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Nimpos-Signature: sha256=$SIG" \
  -H "X-Nimpos-Event-Id: test-evt-001" \
  -H "X-Nimpos-Timestamp: $(date +%s)" \
  --data-binary "$BODY"
```

Förväntat svar: `{"ok":true,"duplicate":false,"transaction_id":"...","unmatched_items":0}`.
Kör samma kommando igen → `{"ok":true,"duplicate":true}` (idempotensen verifierad).

---

## 7. Statusuppslag — verifiera själva utan konto hos oss

Samma endpoint svarar på `GET` så att ni kan kontrollera vad som hänt med ett kvitto utan
åtkomst till vårt gränssnitt.

```
GET .../nimpos-sales?external_id=<external_id>
X-Nimpos-Signature: sha256=<HMAC av query-strängen utan inledande "?">
```

Signaturen räknas alltså över strängen `external_id=test-001` (inte över någon body).

```bash
QS="external_id=test-001"
SIG=$(printf '%s' "$QS" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -sS "$URL?$QS" -H "X-Nimpos-Signature: sha256=$SIG"
```

Svar:

| HTTP | Body | Betydelse |
|---|---|---|
| `200` | `{"received":true,"status":"completed","occurred_at":"...","total_ore":24900,"item_count":1}` | Bokfört. `status` kan även vara `reversed` (retur). |
| `200` | `{"received":true,"status":"unmapped_store","message":"..."}` | Mottaget men parkerat — se `message`. |
| `404` | `{"received":false,"status":"unknown"}` | Vi har aldrig sett kvittot → skicka om det. |

Använd detta i er egen övervakning: stäm av ett stickprov per butik och dag, eller alla
kvitton där ni fått timeout.

---

## 8. Läs-API hos er för nattlig avstämning (skallkrav)

Push tappar alltid enstaka anrop över tid — nät, driftsättningar, köhaverier. För att
siffrorna ska kunna användas som underlag för dagsavslut och bokföring, och inte bara som
livesignal, behöver vi kunna stämma av mot er som sanning. Exponera **ett** av följande,
skyddat med API-nyckel eller Basic auth över TLS:

**Alternativ A — kvittolista:**

```
GET /sales?store_code=<kod>&from=<ISO>&to=<ISO>&cursor=<opaque>
→ { "receipts": [ <samma objekt som avsnitt 4> ], "next_cursor": "..." }
```

**Alternativ B — dagsrapport per butik och dag:**

```
GET /daily-report?store_code=<kod>&date=YYYY-MM-DD
→ {
    "receipt_count": 214,
    "gross_ore": 18422500,
    "vat_breakdown": [{ "rate": 12, "net_ore": 16448661, "vat_ore": 1973839 }],
    "payments": [{ "method": "card", "amount_ore": 15200000 }],
    "return_count": 3,
    "return_ore": -45900
  }
```

Vi anropar detta nattligt, jämför antal kvitton och summa per butik och dag, och hämtar
in eller efterfrågar det som saknas.

---

## 9. Test- och driftsättningsplan

| Steg | Ansvar | Innehåll |
|---|---|---|
| 1 | Vi | Genererar och överlämnar den delade hemligheten säkert. |
| 2 | Ni | Skickar 5 testkvitton från `torslanda-torg`: kortköp, kontantköp, blandbetalning, viktvara med 3 decimaler, samt en retur som refererar till ett av dem. |
| 3 | Ni | Verifierar `duplicate:true` vid omsändning av samma event-id, och `GET`-statusuppslag på varje `external_id`. |
| 4 | Vi | Bekräftar belopp, moms, betalsätt och artiklar i vårt system. |
| 5 | Ni | Slår på push för resterande fyra butiker. |
| 6 | Båda | Verifierar avstämnings-API:t (avsnitt 8) mot en hel handelsdag. Därefter godkänd integration. |

Har ni sandbox/testmiljö, skicka gärna åtkomst plus fem riktiga exempel-payloads så vi kan
validera parsningen mot verklig data före driftsättning.

---

## 10. Frågor vi behöver svar på

1. Kan ni pusha per kvitto vid avslut, eller batchas det — och i så fall hur ofta?
2. Skickar ni öre eller kronor, och hur representeras vikt?
3. Hur ser makulering, retur och parkerat kvitto ut i era events?
4. Är butiks-/kassa-id stabilt över tid, och kan ni skicka vår `store_code` som eget fält?
5. Följer kontrollkod/kontrollenhets-id med?
6. Vilket alternativ i avsnitt 8 väljer ni, och när kan det vara klart?
7. Har ni retry med backoff enligt avsnitt 5, och hur länge behåller ni köade händelser?
8. Vill ni att vi pushar sortiment och priser i andra riktningen?

---

## 11. Checklista före leverans

- [ ] Signatur räknad över exakt samma bytes som skickas i bodyn
- [ ] Hemligheten i konfiguration, roterbar utan release
- [ ] `X-Nimpos-Event-Id` unikt per händelse och **oförändrat vid retry**
- [ ] Alla belopp i öre som heltal
- [ ] Alla tidsstämplar med tidszonsoffset, klockan NTP-synkad
- [ ] Rätt `store_code` per kassa enligt avsnitt 2
- [ ] Retry med backoff vid `5xx`/timeout, ingen retry vid `400`/`401`
- [ ] Utgående anrop asynkront från kö, 10 s timeout, blockerar aldrig kassan
- [ ] Inga kunduppgifter i payloaden
- [ ] Retur skickas som eget event med `reverses_external_id`
