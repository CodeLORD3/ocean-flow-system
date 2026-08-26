# Teknisk rapport: Fortnox-integration för Makrilltrade (ERP → Fortnox)

Status: **beslutsunderlag, inget byggt**. Arkiverad 2026-08-26.
Beslut vid arkivering: nycklar till Fortnox-app finns, första bolag = **FSAB**.

Källor: Fortnox developer-dokumentation (fortnox.se/developer, apps.fortnox.se/apidocs),
Skatteverket, Tullverket, Livsmedelsverket, Havs- och vattenmyndigheten, BAZG/ESTV,
Supabase-dokumentation samt etablerade integratörer (tracezilla, Ongoing WMS,
WooCommerce-konnektorer, Apideck). Aktuell per 26 augusti 2026.

## TL;DR
- Bygg integrationen som en Authorization Code-app per Fortnox-bolag (DE No.1 AB och FSAB).
  Makrilltrade skapar färdiga kundfakturor via `POST /3/invoices`, matchar på befintligt
  `CustomerNumber`, bokför/distribuerar via Fortnox och drar lager **enbart** i Makrilltrades
  stock movement-logg. Nyckeln till att Fortnox aldrig blir ett andra lagersystem:
  **aktivera inte Fortnox Lager/Lager Plus** och lägg upp artiklar som `Type: "SERVICE"`
  med `StockGoods: false`.
- Export till Componia AG (Schweiz, utanför EU): kund-`VATType: "EXPORT"`, 0 % moms,
  försäljning på konto 3105 (ruta 36), HS/tulltaxenummer (kap. 03/16) på fakturaraderna.
  Fortnox standard-faktura-PDF renderar **inte** varukod, vikt eller ursprung — Makrilltrade
  måste generera handelsfaktura/packlista med tullkoder själv.
- Tekniskt: refresh tokens i Supabase Vault (eller nya **Client Credentials-flödet** för
  service accounts, som tar bort refresh-token-hanteringen), tokenförnyelse och utgående kö
  med `pg_cron` + `pg_net`, och en **idempotent jobbtabell** mot dubbelfakturor — Fortnox
  saknar idempotency-nyckel.

## Key findings
1. **OAuth2 token-livslängder:** Authorization-Code 10 min, Access-Token 1 h, Refresh-Token
   45 dagar. Ny refresh token skapas vid varje förnyelse; den gamla blir ogiltig (rotation).
2. **Client Credentials-flödet** är utrullat för service accounts (`account_type=service`) —
   access token hämtas med clientId + clientSecret + tenantId, ingen refresh-token-hantering.
3. **Legacy fasta access tokens är borttagna** (JWT krävs sedan 30 april 2025).
4. **Rate limit:** 300 requests/min per client-id och tenant, glidande fönster om 5 sekunder →
   i praktiken 25 requests/5 s. HTTP 429 vid överskridande.
5. **Scopes** ger både läs och skriv (ingen read-only). Scope-ändringar påverkar inte redan
   aktiverade kunder förrän de om-aktiverar.
6. **Lagerstyrning:** `StockGoods` (Lagervara) på artikeln avgör om artikeln lagerförs. Med
   SERVICE-artiklar och utan Lager-modul rör Fortnox aldrig något lagersaldo.
7. **Export-moms (Skatteverket):** export utanför EU är momsfri; konto 3105 för varor,
   redovisas i ruta 36. Köparens adress, land, valuta och hänvisning till exportundantaget ska
   framgå, och utförsel ur EU måste kunna styrkas.
8. **Schweiz importmoms (ESTV/BAZG):** 2,6 % reducerat på livsmedel (standard 8,1 %), i kraft
   sedan 1 januari 2024 och oförändrat 2026. Tull beräknas på vikt; under CHF 5 i moms/tull
   tas inget ut.

## 1. Fortnox API v3

### 1.1 OAuth2 och autentisering

| Item | Expiration |
|------|-----------|
| Authorization-Code | 10 minuter |
| Access-Token | 1 timme |
| Refresh-Token | 45 dagar |

Ogiltig refresh token ⇒ integrationen måste om-aktiveras av en användare på Fortnox-kontot.

Authorization-URL (exempel):
```
GET https://apps.fortnox.se/oauth-v1/auth
  ?client_id={CLIENT_ID}
  &redirect_uri=https://mysite.org/activation
  &scope=invoice customer article companyinformation price settings bookkeeping
  &state=RANDOM_CSRF_TOKEN
  &access_type=offline
  &response_type=code
  &account_type=service
```
- `access_type=offline` krävs för refresh token.
- `account_type=service` ger service-account-anslutning (rekommenderat för headless ERP).
- `redirect_uri` måste matcha Developer Portal exakt.

Token-request:
```
POST https://apps.fortnox.se/oauth-v1/token
Authorization: Basic base64(clientId:clientSecret)
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code={AUTH_CODE}&redirect_uri=https://mysite.org/activation
```

**Client Credentials (2025–2026):** kunden ger först consent via authorization-flödet med
`account_type=service`; därefter hämtas access token med clientId + clientSecret + tenantId,
utan refresh token. `tenantId` (DatabaseNumber) fås via `/3/companyinformation` eller
`/3/settings/company`, via webhook-events "consent created"/"consent revoked", eller som claim
i JWT för befintliga kunder. Client Credentials (service) och Authorization Code (user) kan
kombineras för samma clientId + tenant.

**Sandbox:** finns inte publikt — utveckla mot en riktig (test-)företagsdatabas. Developer
Portal-registrering kräver svenskt person-/organisationsnummer. Appen kan hållas privat/dold.

**Redirect URI i vår setup:** peka mot en Edge Function-endpoint som tar emot `code` + `state`.

### 1.2 Scopes, licenser och konsekvenser

| Resurs | Scope | Krävd licens |
|--------|-------|--------------|
| Customers | `customer` | Kundfaktura eller Order |
| Articles | `article` | Order eller Kundfaktura |
| Invoices | `invoice` | Order eller Kundfaktura |
| Invoice Payments | `payment` | Bokföring/Order/Kundfaktura |
| Prices / Price Lists | `price` | Order eller Kundfaktura |
| Company Information | `companyinformation` | Any |
| Company Settings, Units, Terms, Way/Terms of delivery | `settings` | Any |
| Vouchers, Accounts, SIE, Financial Years | `bookkeeping` | Bokföring eller Kundfaktura |
| Cost Centers | `costcenter` | Bokföring/Order/Kundfaktura |
| Currencies | `currency` | Bokföring/Order/Kundfaktura |
| Print templates | `print` | Order eller Kundfaktura |
| Warehouse | `warehouse` | Lager eller Lager Plus |

Ändrade scopes gäller inte för redan aktiverade anslutningar — ny Authorization-Code krävs.
Sätt därför rätt uppsättning **före go-live**:
`customer article invoice price payment companyinformation settings bookkeeping`
(`bookkeeping` bara om verifikationer för lagervärde ska skapas).
Lägg **inte** till `warehouse`.

### 1.3 Rate limits, paginering, webhooks, fel
- **Rate limit:** 25 req/5 s (300/min) per access-token, glidande fönster, 429 vid burst.
- **Paginering:** `page`, `limit` (max 500). Svar innehåller `@CurrentPage`, `@TotalPages`,
  `@TotalResources`.
- **Two-call pattern:** list-endpoints returnerar sammanfattningar; full data kräver ett
  detaljanrop per post (full sync av 2 500 fakturor ≈ 2 505 anrop ≈ 8–9 min vid maxtakt).
- **Webhooks:** finns för kunder och fakturor (created/updated) samt consent created/revoked.
  För leverantörsfakturor, verifikationer och betalningar krävs polling.
- **Websockets:** begränsad täckning — komplement, inte huvudkanal.
- **Felformat:**
```json
{ "ErrorInformation": { "Error": 2000552, "Message": "Customer not found", "Code": 404 } }
```
  Vanliga koder: 400, 401, 403, 404, 429. Fel 2001200 = ogiltig kundtyp.

### 1.4 Customer-resursen
Matcha primärt på **`CustomerNumber`** (sätt samma ID som i Makrilltrade). Alternativt
`OrganisationNumber` eller `VATNumber` via list-filter. Eftersom kunderna redan finns i
Fortnox: hämta och cacha mappning `Makrilltrade-kund → Fortnox CustomerNumber` i databasen.

VATType-logik: SE → `SEVAT`; EU med VAT-nummer → `EUREVERSEDVAT`; EU utan VAT-nummer →
`EUVAT`; utanför EU → `EXPORT`.

Componia AG (Zollikon, CH): `VATType: "EXPORT"`, `CountryCode: "CH"`, `Currency` enligt avtal
(CHF/EUR/SEK), fullständig `DeliveryAddress`.

Inkrementell sync via `GET /3/customers?filter=...` och `lastmodified`-parametrar.

### 1.5 Article-resursen och lagerstyrning (kritiskt)
Fält: `ArticleNumber`, `Description`, `Unit`, `VAT`, `SalesAccount`, `EUAccount`,
`EUVATAccount`, `ExportAccount`, `PurchaseAccount`, `StockGoods`, `Type` (`STOCK`/`SERVICE`),
`EAN`, `Note`. Generell `CommodityCode`/`CountryOfOrigin` finns **inte**.

Kontostyrning per VATType: `SEVAT` → `SalesAccount`; `EUREVERSEDVAT` → `EUAccount`;
`EUVAT` → `EUVATAccount`; `EXPORT` → `ExportAccount`. Sätt `ExportAccount = 3105` på artiklar
som exporteras till Componia.

Så hålls Fortnox Lager borta:
- Aktivera **inte** Lager/Lager Plus (görs av systemadmin, ej via API; aktivering flyttar
  saldon till lagermodulen och Fortnox börjar spåra FIFO).
- Artiklar som `Type: "SERVICE"` med `StockGoods: false` → plockas/lagerförs inte.
- Utan Lager-modul skrivs saldo bara på artikeln om den är lagervara.
- Med Lager aktivt blir fakturor "outbound deliveries" som minskar saldo vid
  `WarehouseReady` — undvik. Lägg inte till `warehouse`-scope.

### 1.6 Invoice-resursen
Huvudfält för `POST /3/invoices`: `CustomerNumber`, `InvoiceDate`, `DueDate`, `VATType`,
`Currency`, `CurrencyRate`, `Language`, `TermsOfPayment`, `TermsOfDelivery`, `WayOfDelivery`,
`CostCenter`, `Project`, `Remarks`, `YourReference`, `OurReference`, `Freight`,
`ExternalInvoiceReference1/2`, `VATIncluded`, `InvoiceRows[]`.

Radnivå: `ArticleNumber`, `Description`, `DeliveredQuantity`, `Price`, `Unit`, `VAT`,
`AccountNumber`, `Discount`, `DiscountType` (`PERCENT`/`AMOUNT`), `CostCenter`, `Project`.

Exempel (export till Componia AG):
```json
{
  "Invoice": {
    "CustomerNumber": "CH1001",
    "InvoiceDate": "2026-08-26",
    "DueDate": "2026-09-25",
    "VATType": "EXPORT",
    "Currency": "SEK",
    "Language": "EN",
    "YourReference": "Componia PO 5567",
    "ExternalInvoiceReference1": "MKR-ORDER-88231",
    "Remarks": "Export outside EU, VAT exempt (0%). Momsfri export.",
    "VATIncluded": false,
    "InvoiceRows": [
      {
        "ArticleNumber": "LAX-FILE-01",
        "Description": "Färsk laxfilé (Salmo salar) – HS 0304.41",
        "DeliveredQuantity": "120.00",
        "Unit": "kg",
        "Price": 95,
        "VAT": 0,
        "AccountNumber": 3105
      }
    ]
  }
}
```

Åtgärder: `PUT .../bookkeep`, `GET .../email`, `GET .../einvoice`, `GET .../print`,
`PUT .../externalprint`, `PUT .../credit`, `PUT .../cancel`,
`PUT .../warehouseready` (ska inte användas här).

Efter `bookkeep` är ekonomiska fält låsta och verifikationer oföränderliga — korrigera med
kreditfaktura eller motverifikation. Kreditfaktura måste skapas mot en bokförd debetfaktura med
öppen balans ≥ kreditbeloppet. Betalstatus läses via `Balance`, `FinalPayDate` och Invoice
Payments (`payment`-scope).

### 1.7 Idempotens
Fortnox har **ingen** idempotency-nyckel:
- Egen jobbtabell: en rad per Makrilltrade-order, unik `order_id`, status
  (`pending/sent/failed`), `fortnox_document_number`.
- `ExternalInvoiceReference1 = MKR-ORDER-{id}`; sök
  `GET /3/invoices?externalinvoicereference1=...` innan skapande.
- Unik constraint + state machine så att en order bara kan skickas en gång.

## 2. Export Sverige → Schweiz (fisk/skaldjur)

### 2.1 Svensk momshantering
Export till land utanför EU:s momsområde (Schweiz ingår ej) är momsfri, oavsett om köparen är
företag eller privatperson. Konto **3105** (varor) / 3305 (tjänster), momsdeklarationens
**ruta 36**. Ingen periodisk sammanställning. Fakturan ska visa köparens namn/adress, land,
valuta och hänvisning till momsfri export. Utförselbevis sparas i bokföringen.

### 2.2 Tulldokumentation SE→CH
- Exportdeklaration till Tullverket krävs alltid; handelsfaktura eller proformafaktura är
  underlag (obligatorisk kod + referensnummer i deklarationen).
- **EORI-nummer** krävs för exportören/deklaranten.
- Varukoder: 4 siffror = HS, 6 = HS-undernummer, 8 = KN, 10 = TARIC.

| Kod | Beskrivning |
|-----|-------------|
| 0301 | Live fish |
| 0302 | Fish, fresh or chilled (excl. fillets) — t.ex. 0302 14 atlantlax |
| 0303 | Frozen fish (excl. fillets) |
| 0304 | Fish fillets and other fish meat, fresh/chilled/frozen (t.ex. 0304 20) |
| 0305 | Dried, salted, brined or smoked fish (t.ex. rökt lax) |
| 0306 | Crustaceans — räkor (0306 17), hummer, krabba |
| 0307 | Molluscs — musslor (0307 32), ostron, bläckfisk |
| 1604 | Prepared or preserved fish; caviar |
| 1605 | Crustaceans/molluscs prepared or preserved (t.ex. 1605 21 räkor) |

Exakta 8-siffriga KN-suffix slutverifieras i Tullverkets live-Tulltaxa (uppdateras årligen).
- Ursprung, netto-/bruttovikt och Incoterms ska framgå av handelsfakturan; ursprungsintyg kan
  krävas (handelskammaren).
- Fiskeriprodukter: exportintyg/hälsointyg (Livsmedelsverket eller kommunen) samt **fångstintyg**
  som beställs av Havs- och vattenmyndigheten. Kraven varierar per land och produkt — kontrollera
  Livsmedelsverkets landsida för Schweiz.
- Schweizisk importsida: importmoms 8,1 % standard, **2,6 % på livsmedel**; tull på vikt
  (CHF/100 kg brutto), 8-siffrig Tares-kod, momsbas = CIF. Under CHF 5 tas inget ut. Sedan 2025
  måste stora utländska postorderförsäljare momsregistrera sig i CH (ej relevant för B2B till
  Componia).

### 2.3 Kan Fortnox skriva ut tullrelevanta fält på faktura-PDF?
**Nej.** Standard-PDF renderar inte varukod, vikt eller ursprung per rad, och artikelresursen
saknar fälten. Fortnox support anger att tullkoder måste anges manuellt på benämningsraderna.
Warehouse-modulen tillför inte commodity code eller ursprung.
**Rekommendation:** generera handelsfaktura/packlista i Makrilltrade (HS-koder, netto/bruttovikt,
ursprung, Incoterms) och använd Fortnox-fakturan enbart för bokföring/momsredovisning.

### 2.4 Peppol/e-faktura till schweizisk mottagare
Schweiz saknar obligatoriskt B2B-krav; Peppol främst B2G (>CHF 5 000 sedan 2016). Componia AG
måste vara Peppol-ansluten med Peppol-ID för att e-faktura ska fungera. Realistisk väg: PDF via
`/email` eller handelsfaktura direkt från Makrilltrade. Verifiera Peppol-status innan e-faktura
byggs.

## 3. Lagermönster i ERP→Fortnox-integrationer
- **tracezilla** (svenska livsmedelsföretag) är exakt målmönstret: master-data + fakturor synkas
  till Fortnox och bokförs, och **lagervärdet överförs månadsvis** för att justera Fortnox
  lagerkonton — periodisk värdejustering, inte transaktionellt lager.
- **Ongoing WMS:** `Lagervara`-flaggan styr om Fortnox lagerför; satt till Nej ⇒ lagerförs inte.
- WooCommerce-konnektorer använder SERVICE/STOCK-artikeltyper och kontostyrning per VATType.

**För Makrilltrade:** SERVICE-artiklar, `StockGoods:false`, ingen Lager-modul. Om revisorn
behöver lagervärde i huvudboken: månatlig verifikation via Voucher-API (`bookkeeping`) som
justerar lagerkonto (1400-serien) mot lagerförändringskonto, baserat på Makrilltrades beräknade
lagervärde vid månadsslut. Verifikationer är oföränderliga — korrigera med ny verifikation.

## 4. Implementation i vår backend
- **Tokenlagring:** refresh tokens och Client Credentials-hemligheter i Vault
  (`vault.create_secret` / `vault.decrypted_secrets`), inte i klartextstabell. Med Client
  Credentials behövs bara clientId, clientSecret (Vault) och tenantId per bolag.
- **Schemaläggning:** `pg_cron` + `pg_net` för att anropa Edge Functions periodiskt; hämta
  service key/URL ur Vault och skicka som Bearer-header.
```sql
select cron.schedule(
  'refresh-fortnox-tokens', '*/30 * * * *',
  $$ select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='project_url')
             || '/functions/v1/fortnox-refresh',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_key'))
  ); $$
);
```
- `net.http_post` är fire-and-forget (ingen retry på 5xx, ingen alert på non-2xx, bara en rad i
  `net._http_response`) — bygg egen retry/observability.
- **Rate-limit-medveten kö:** `fortnox_outbound_jobs` (`order_id` unik, status, attempts,
  next_run_at, last_error). Edge Function processar batchar under 25 req/5 s med token-bucket och
  exponentiell backoff på 429/5xx.
- **Idempotens:** unik constraint på `order_id` + state machine (pending→sent→bookkept) plus
  `ExternalInvoiceReference1`-kontroll mot Fortnox innan skapande.
- **Secrets:** clientId/clientSecret/redirect_uri som Edge Function-secrets; Vault för
  runtime-hemligheter som cron läser i SQL.

## Rekommenderad etappindelning

**Etapp 0 – Förberedelser (börja med FSAB):**
1. Skapa app i Developer Portal, redirect URI mot Edge Function, scopes
   `customer article invoice price payment companyinformation settings` (+`bookkeeping` om
   lagervärde ska bokföras). Publicera dold/privat.
2. Bekräfta att Fortnox Lager/Lager Plus **inte** är aktivt i något bolag.
3. Artiklar som `Type:"SERVICE"` + `StockGoods:false`; `SalesAccount` (t.ex. 3001) och
   `ExportAccount=3105`.

**Etapp 1 – Auth & grunddata:** OAuth (helst Client Credentials), tokenlagring i Vault,
kundmappning (CustomerNumber-cache), artikelsync. *Benchmark:* companyinformation + kund-/
artikellistor för båda bolagen.

**Etapp 2 – Fakturaskapande (SEVAT):** `POST /3/invoices` från order, idempotent jobbtabell +
`ExternalInvoiceReference1`, sedan `bookkeep` + `email`. *Benchmark:* 20 testfakturor utan
dubbletter, korrekt momskonto.

**Etapp 3 – Export till Componia:** `VATType=EXPORT`, konto 3105, 0 % moms, egen handelsfaktura/
packlista med HS-koder + vikt + ursprung. *Benchmark:* momsfri bokförd faktura (ruta 36) +
korrekt handelsfaktura för tull.

**Etapp 4 – Lagervärde (om revisorn kräver):** månatlig Voucher via `bookkeeping`.
*Benchmark:* lagervärde i huvudbok stämmer mot stock movement-loggen.

**Etapp 5 – Robusthet:** rate-limit-kö, backoff, webhooks för kund/faktura, observability på
cron och Edge Functions.

**Trösklar som ändrar rekommendationen:**
- Componia visar sig Peppol-registrerad → bygg e-faktura via Fortnox/Qvalia i stället för PDF.
- Revisorn vill ha transaktionellt lager i Fortnox → avrådes (tappar single source of truth);
  använd Voucher-metoden.

## Caveats
- Inget publikt sandbox — testa i en riktig (test-)företagsdatabas.
- Ingen idempotency-nyckel i Fortnox — dubbelfakturaskydd byggs helt på vår sida.
- Exakta 8-siffriga KN-koder för fisk uppdateras årligen — slutverifiera i Tulltaxan.
- Exportintyg/veterinärkrav för fisk till Schweiz kan vara omfattande och landspecifika;
  fångstintyg beställs från Havs- och vattenmyndigheten.
- Client Credentials-flödet är nyligen utrullat — bekräfta tillgänglighet för vår app innan
  refresh-token-hanteringen byggs bort.
- `net.http_post` är fire-and-forget; bygg egen retry/alerting.
- Websockets-stödet är begränsat; förlita er på webhooks (kund/faktura) + polling.
- Fortnox standard-faktura-PDF duger inte som tullhandling.
