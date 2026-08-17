# Valutahantering för Componia AG (Zollikon & Morges)

Componia AG (CH) får CHF som standardvaluta i hela systemet. Undantaget är inköp från SEK-flaggade leverantörer (i första hand internköp från Fisk & Skaldjursspecialisten), där SEK visas som primär valuta och CHF-motvärdet sparas historiskt på transaktionen.

## Så fungerar det

- Alla vyer för Componia AG (lager, försäljning, kundordrar, löner, rapporter, dashboards) visar CHF.
- Leverantörer får ett valutafält. Grossisten sätts till SEK; övriga kan sättas till SEK/EUR/CHF vid behov.
- Vid inleverans/inköpsrapport från en SEK-leverantör:
  - Beloppen matas in och visas i SEK (primärt).
  - Kursen SEK→CHF hämtas automatiskt (ECB via Frankfurter, med reservkälla) och fylls i förvalt — men kan justeras manuellt per inköp innan bokföring.
  - Både originalbelopp (SEK), kurs och konverterat belopp (CHF) sparas på inköpet, raden och partiet.
- Lagervärdering och kostpris för Componia AG räknas alltid i CHF, baserat på den kurs som gällde vid inköpstillfället. Ändras kursen senare påverkas inte gamla inköp.
- Inköpsvyer för SEK-leverantören visar "1 234,00 kr ≈ 118,50 CHF" — SEK stort, CHF som referens.

## Teknisk plan

### Databas (migration)
- `suppliers`: nya kolumner `currency text not null default 'SEK'` och `is_intercompany boolean default false`.
- `incoming_deliveries`: `source_currency text`, `fx_rate_to_entity numeric`, `fx_rate_date date`, `fx_source text`, `total_cost_source numeric` (belopp i originalvaluta; `total_cost` förblir bokfört värde i bolagets valuta).
- `incoming_delivery_lines`: `unit_cost_source numeric`, `source_currency text`, `fx_rate numeric`.
- `lots`: `unit_cost_source numeric`, `source_currency text`, `fx_rate numeric` (kostpriset `unit_cost` fortsätter vara i bolagets valuta).
- `purchase_reports` / `purchase_report_lines`: `source_currency`, `fx_rate`, samt `unit_price_source` / `line_total_source` respektive `total_amount_source`.
- `stock_movements`: `source_currency text`, `fx_rate numeric`, `unit_cost_source numeric` så att rörelsen bär spårbar ursprungsvaluta.
- Sätt grossistleverantören till `currency='SEK'`, `is_intercompany=true`; alla nya kolumner är nullbara/defaultade så befintlig data är oförändrad.

### Valuta- och kurslager (frontend)
- `src/lib/currency.ts`: ny hjälpfunktion `entityCurrency(legal_entity_id)` som läser `legal_entities.currency` (fsab-ch → CHF), plus `fmtDual(amountSource, currencySource, amountTarget, currencyTarget)` för "SEK ≈ CHF"-visning.
- Återanvänd `useFxRate` (redan finns, ECB/Frankfurter med reserv) men i inköpsflödet: hämta kursen en gång vid registrering, visa den i ett redigerbart fält, och skriv det slutliga värdet till databasen. Ingen löpande omräkning av sparade poster.
- Ny hook `useEntityCurrency()` som ger aktuellt bolags valuta för alla vyer.

### UI
- `src/pages/Suppliers.tsx` + leverantörsdialog: valutaväljare (SEK/CHF/EUR) och kryssruta "Internköp (grossist)".
- `src/pages/Receiving.tsx` och `src/pages/PurchaseReporting.tsx`: när valt leverantörs valuta ≠ bolagets valuta visas ett kursfält (förifyllt automatiskt, redigerbart, med källa och tidsstämpel) och radbeloppen i SEK med CHF-motvärde per rad och summa.
- `src/pages/Inventory.tsx`, `StockMovementsPage.tsx`, `TraceabilityPage.tsx`, `ShopReports.tsx`, `Payouts.tsx`, kundorder- och dashboardvyer: byt hårdkodad SEK-formattering mot bolagsvalutan, så Componia AG visar CHF genomgående.
- Ersätt den nuvarande `currency_settings`-baserade fasta kursen + transporttillägg i inleveransen med den nya kurslogiken (transporttillägget behålls som separat påslag i CHF).

### Notering
Bokförda historiska belopp konverteras inte i efterhand; äldre poster utan `source_currency` tolkas som bolagets valuta.
