# Kopiera till bokafiskskaldjur.se

Allt nedan är klart att klistra in i projektet för den publika bokningssidan.
Bokningssidan har **inga databasnycklar** — den anropar bara `booking-api`.

---

## 1. Butiksinfo (steg 1 — välj butik)

Fyra butiker i Göteborg. Veckodag: 0 = söndag … 6 = lördag.

```json
[
  {
    "id": "1426d0bb-dd09-46be-9d11-bc96d203eede",
    "slug": "amhult",
    "name": "Fiskskaldjur Amhult",
    "address": "Flygfältgatan 29, 423 37 Torslanda",
    "opening_hours": {
      "tis-tors": "10:00–18:00",
      "fre": "10:00–18:30",
      "lör": "10:00–15:00",
      "sön-mån": "stängt"
    }
  },
  {
    "id": "4d208dcf-cfc0-4724-b2bd-80e72a8337c8",
    "slug": "eriksberg",
    "name": "Fiskskaldjur Eriksberg",
    "address": "Kvarnpirsgatan 8, 417 64 Göteborg",
    "opening_hours": {
      "ons-tors": "11:00–18:00",
      "fre": "10:00–18:00",
      "lör": "10:00–15:00",
      "sön-tis": "stängt"
    }
  },
  {
    "id": "9ca4f9de-5a14-4bdf-90e7-b22246d41f55",
    "slug": "saro",
    "name": "Fiskskaldjur Särö Centrum",
    "address": "Furubergsvägen 4, 429 41 Särö",
    "opening_hours": {
      "tis-fre": "10:30–18:00",
      "lör": "10:30–15:00",
      "sön-mån": "stängt"
    }
  },
  {
    "id": "857b421c-8319-4a66-97c1-7bff980f4967",
    "slug": "torslanda",
    "name": "Fiskskaldjur Torslanda Torg",
    "address": "Torslanda Torg 1, 418 78 Göteborg",
    "opening_hours": {
      "tors": "12:00–18:00",
      "fre": "10:00–18:00",
      "lör": "10:00–15:00",
      "sön-ons": "stängt"
    }
  }
]
```

Telefonnummer saknas i registret för samtliga fyra — fyll i dem i
Makrilltrade (butiksinställningar) och de följer automatiskt med i `/catalog`.

Hämta hellre listan live än att hårdkoda den: `GET /catalog` returnerar
butiker med `address`, `phone`, `booking_open`, `booking_closed_message`,
`booking_note`, `image_url` (butiksfoto, kan vara null) och `opening_hours`
(per veckodag).

`booking_note` är en informationstext som alltid ska visas vid butiken.
Marstrand har t.ex. "Förbokningar endast – ingen fiskvagn på plats."

---

## 2. API-kopplingen

**Bas-URL**

```
https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/booking-api
```

**Publik nyckel (anon, får ligga i klientkoden)**

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6Y3ZvcW5yaGp0cnhsemhoZG11Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc5OTcsImV4cCI6MjA4ODIwMzk5N30.sbF0nwtWU2JZqZmhUvhjqou3pIyOnVGCBTYQYOY9ki0
```

Skicka den som `apikey` och `Authorization: Bearer <anon>` på varje anrop.

**CORS** — dessa origins är vitlistade i `booking-api`:
`https://bokafiskskaldjur.se`, `https://www.bokafiskskaldjur.se`,
bokningsprojektets förhandsvisning (`id-preview--e69a8370-…lovable.app`,
`e69a8370-….lovableproject.com`) och `http://localhost:8080`.
Ny domän → säg till, den läggs in i `ALLOWED_ORIGINS`.

### Hjälpare att klistra in

```ts
const BOOKING_API =
  "https://tzcvoqnrhjtrxlzhhdmu.supabase.co/functions/v1/booking-api";
const ANON = "…anon-nyckeln ovan…";

async function bookingApi(action: string, body?: unknown, query?: string) {
  const res = await fetch(`${BOOKING_API}/${action}${query ?? ""}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Något gick fel. Ring gärna butiken.");
  return json;
}
```

### GET /catalog

`/catalog` eller `/catalog?store=<butiks-uuid>`

```json
{
  "ok": true,
  "stores": [
    { "id": "…", "name": "…", "address": "…", "phone": null,
      "booking_open": true, "booking_closed_message": null, "image_url": "https://…/butik.jpeg",
      "opening_hours": [{ "weekday": 2, "open_time": "10:00:00", "close_time": "18:00:00", "closed": false }] }
  ],
  "products": [
    { "id": "…", "name": "Färska Räkor Premium", "circa_price": 349,
      "unit": "kg", "step": 0.5, "lead_days": 1, "image_url": null }
  ]
}
```

`circa_price` visas som **cirkapris** — aldrig som slutpris. Svaret cachas 5 min.

### POST /send-code

```json
{ "phone": "0701234567", "form_started_at": 1755168000000, "honeypot": "" }
```

- `form_started_at`: `Date.now()` när formuläret öppnades. Submit under
  3 sekunder loggas som bot och **inget SMS skickas** — svaret ser normalt ut.
- `honeypot`: dolt fält som måste vara tomt.
- Gränser: 10 koder/timme per IP, 5 per dygn och nummer. Överskridande ger
  också ett normalt svar utan SMS.
- Fel på numret ger exakt: `Ange ett svenskt mobilnummer, eller ring butiken så bokar vi åt dig.`

Svar: `{ "ok": true, "sent": true, "test_mode": true }`

### POST /verify-code

```json
{ "phone": "0701234567", "code": "123456" }
```

Svar vid träff: `{ "ok": true, "verification_ref": "<uuid>" }`
Annars `{ "ok": false, "message": "…", "expired": true? }` — visa meddelandet
rakt upp. Koden lever 10 minuter och tål 3 försök.

### POST /create-booking

`verification_ref` måste vara högst 15 minuter gammal. Max 3 bokningar per
dygn och nummer, max 8 varor per bokning, max 10 per vara.

```json
{
  "store_id": "1426d0bb-dd09-46be-9d11-bc96d203eede",
  "verification_ref": "<uuid från verify-code>",
  "phone": "0701234567",
  "first_name": "Anna",
  "last_name": "Andersson",
  "email": "anna@example.com",
  "wanted_date": "2026-08-20",
  "time_window": "12-14",
  "note": "Gärna okokta",
  "lines": [{ "product_id": "<uuid>", "quantity": 1.5 }]
}
```

Svar:

```json
{ "ok": true, "order_number": "…", "estimated_total": 523.5, "customer_known": false }
```

Regler som API:et upprätthåller: hämtdagen måste ligga inom ledtiden och
butikens öppettider, hämttiden inom öppettiderna, och priset låses aldrig —
dagspris sätts vid hämtning i butiken.

### POST /staff-booking (ej för publika sidan)

Kräver inloggad butikspersonal (`Authorization: Bearer <användarens JWT>`),
annars 401. Används i Makrilltrade när butiken bokar per telefon.

### Felhantering i UI

Alla fel kommer som `{ "ok": false, "error": "<svensk text>" }` med status 400
(401 för `staff-booking` utan inloggning). Texterna är kundvänliga och kan
visas direkt.
