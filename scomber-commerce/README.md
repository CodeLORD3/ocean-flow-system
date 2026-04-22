# Scomber Commerce API

Commerce API för Fisk & Skaldjursspecialisten. Läser artiklar, batcher och lager från **Makrilltrade** (ERP), applicerar en egen **prismotor** och **spårbarhetslogik**, och exponerar REST-endpoints som POS:en, B2B-portalen och faktureringsmotorn alla konsumerar.

## Arkitektur

```
Makrilltrade (MySQL)          ← källa till sanning för lager, inköp
        │
        ▼ (SELECT only)
Scomber Commerce API          ← den här tjänsten
        │
        ├── egen MySQL-DB      ← prisregler, transaktioner, B2B-order
        │
        ▼
POS, B2B-portal, Fakturering  ← thin clients
```

## Starta lokalt (med mockdata)

```bash
npm install
npm run dev
```

API:et startar på `http://localhost:3030` med mockade fiskhandlardata.

## Testa

```bash
npm test
```

Tester körs utan externa beroenden — täcker prismotor (markup, target-margin, valuta, butiks-multiplier, clamping) och FIFO-batchallokering.

## Endpoints

```
GET  /health
GET  /api/articles?storeId=amhult
GET  /api/articles/:sku/traceability?storeId=amhult
POST /api/pricing/morning-suggest          ← morgonrutinen
PUT  /api/articles/:sku/price-override
POST /api/transactions
```

### Exempel: morgonprissättning för alla 3 butiker

```bash
curl -X POST http://localhost:3030/api/pricing/morning-suggest \
  -H 'Content-Type: application/json' \
  -d '{"storeIds":["amhult","saro","torslanda"]}'
```

Svaret är en lista med föreslagna priser, nuvarande priser, förändring i öre, och en förklaring (rationale) per artikel per butik. **Ingen av dessa är live** förrän någon gör `PUT /price-override`.

### Exempel: godkänn ett förslag

```bash
curl -X PUT http://localhost:3030/api/articles/LAX-HEL-001/price-override \
  -H 'Content-Type: application/json' \
  -d '{"storeId":"amhult","priceOre":17900,"reason":"Godkänt morgonpris 22/4"}'
```

## Koppla till riktig Makrilltrade

1. Kör `sql/scomber_commerce_schema.sql` för att skapa Scomber-DB:n.
2. Öppna `src/adapters/makrilltrade.ts` och **ersätt SQL-frågorna** med Makrilltrades riktiga tabell- och kolumnnamn. Börja med `listArticles()` — anpassa den, kör API:et, verifiera att `GET /api/articles?storeId=...` returnerar något vettigt.
3. Gör samma sak för `listBatchesForSku`, `listBatchAllocationsForStore`, `getBatch`, `getArticle`.
4. I `server.ts`, byt ut `MakrilltradeMockAdapter` mot `MakrilltradeMySQLAdapter` med en mysql2-pool mot er Makrilltrade-DB (bara SELECT-rättigheter!).

## Struktur

```
sql/
  scomber_commerce_schema.sql      ← vår egen databas
  makrilltrade_mock_schema.sql     ← referens för Tim/Joakim
src/
  types/              ← domänmodell
  adapters/           ← Makrilltrade-adapter (den enda fil som ändras)
  pricing/            ← prismotor + FIFO-allokerare (ren logik)
  db/                 ← seed-data
  server.ts           ← Fastify-appen
tests/
  pricing.test.ts     ← 15 tester, alla gröna
```

## Viktiga designval

- **Allt i öre (integer).** Aldrig floating-point på pengar.
- **Commerce API:et skriver aldrig till Makrilltrade.** Read-only-användare från början.
- **Prismotor är ren logik.** Samma funktion testas i isolation och används av servern.
- **Halvautomatisk prissättning.** Systemet räknar fram förslag. Chefen godkänner. Ingen auto-publish.
- **FIFO-allokering är deterministisk.** Äldsta batch först, reservationer respekteras.

## Nästa steg

- Lägg till CleanCash Cloud-integration för kontrollkoder
- Bygg ut B2B-endpoints (`/api/b2b/customers`, `/api/b2b/orders`)
- Skriv journal-XML-export för Skatteverkets 2027-krav
- Koppla POS (Lovable) till API:et via `VITE_API_URL=http://localhost:3030`
