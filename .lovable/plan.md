# Butiksresultat: inköp på beställt värde + Ålsten och Kungsholmen som en enhet

## Var inköp och butiksresultat räknas idag

| Ställe | Inköp räknas från | Använder levererat? |
|---|---|---|
| Sidan **Resultat** (`src/pages/Resultat.tsx`), databasfunktionen `resultat_per_butik` | Inköpsrapporter (`purchase_report_lines`, fakturor/följesedlar) per butik + koncerninterna fakturor (`intercompany_invoices`) | Nej |
| Sidan **Resultat**, flik Bokfört (`resultat_bokfort`) | Fortnox-saldon konto 4xxx | Nej |
| **Organisationsöversikt** (`src/pages/OrganisationOverview.tsx`) | Butiksordrar: `quantity_delivered × products.cost_price` (varukostnad) och `quantity_delivered × wholesale_price` (försäljning per butik) | **Ja** |
| **Dashboard** (`src/pages/Dashboard.tsx`) | Försäljning per butik: `quantity_delivered × wholesale_price`; "Totala inköp" från `incoming_deliveries` | **Ja** (försäljningsdelen) |
| **Veckorapporter** (`weekly_store_reports` via `recompute_weekly_store_report`, vyn `weekly_region_reports`, komponent `WeeklyStoreReports.tsx`) | Inga inköp alls – bara försäljning (dagsrapporter) och timmar | – |
| **Rapportmejl** (`supabase/functions/report-email/blocks.ts`) | Göteborg: Fortnox konto 4010/4011 per leveransdag. Stockholm: grossistens fakturor till DE No.1 (regionnivå, inte per butik) | Nej (fakturerat) |
| Inköpslista (`PurchaseWeekCard.tsx`) | `quantity_ordered`, men bara kvantitet, inget värde | – |

Kontroll vecka 46 (9–15 nov): Amhult 35 rader, 0 levererat, beställt värde ca 69 200 kr. Ålsten 25 rader, 180 levererat, beställt värde ca 90 300 kr. Kungsholmen 0 rader. Vissa rader saknar både `cost_at_order` och `cost_price` – de blir 0 kr och ska flaggas.

Det är alltså bara Organisationsöversikten (och Dashboardens försäljningssiffra) som räknar på levererat. Resultatsidan räknar i dag på inköpsrapporter, inte på butiksordrar.

## Frågor att bekräfta innan bygget

1. Ska resultatsidans inköp **ersättas** av beställt värde, eller visas som en egen kolumn ("Beställt från grossist") bredvid inköpsrapporterna? Förslag: en egen kolumn, och beställt värde räknas som butikens råvaruinköp när det finns. Inköpsrapporter till samma butik från andra leverantörer läggs till. Så räknas grossistleveranser inte två gånger.
2. Ska rapportmejlets Stockholmsdel fortsätta använda grossistens faktura (regionnivå)? Förslag: ja, men en rad "Ålsten + Kungsholmen" visar beställt värde som kontroll.

## Ändring 1 – inköp på beställt värde

- Ny databasfunktion `shop_order_purchase_value(_from, _to)`: per butik och leveransdag `sum(quantity_ordered × coalesce(cost_at_order, products.cost_price))`. Leveransdag = `coalesce(shop_order_lines.delivery_date, shop_orders.desired_delivery_date)`. Rader med status "Ej tillgänglig" och makulerade ordrar räknas inte. Antal rader utan kostnad returneras, så att sidan kan visa "X rader saknar inköpspris".
- `resultat_per_butik`: nytt fält `ordered_purchase_sek` från funktionen ovan, enligt svaret på fråga 1.
- `OrganisationOverview.tsx`: varukostnaden byter `quantity_delivered` mot `quantity_ordered × coalesce(cost_at_order, cost_price)`, per leveransdag. Försäljningen till butik (grossistens intäkt) behåller levererat, eftersom den motsvarar fakturan.
- `Dashboard.tsx` ändras bara om du vill. Siffran är grossistens försäljning, inte butikens inköp.

## Ändring 2 – Ålsten + Kungsholmen som en resultatenhet

- Ny tabell `result_units` (namn, t.ex. "Ålsten + Kungsholmen") och ny kolumn `stores.result_unit_id`, som är tom för alla andra butiker. Admin ställer in det. Ingen butik slås ihop, så schema, stämpling, dagsrapporter, kassor, Personalkollen-koppling och veckorapporter per butik fortsätter som i dag.
- `resultat_per_butik` grupperar på `coalesce(result_unit_id, store_id)`. Försäljning, inköp, timmar, personalkostnad, fasta kostnader och budget summeras för de två butikerna. Raden heter "Ålsten + Kungsholmen" och kan fällas ut per butik.
- Resultatsidan och Organisationsöversikten visar enheten som en rad. Båda butikerna hör till DE No.1, så bolagsskiljningen påverkas inte. Gruppering tillåts bara mellan butiker i samma bolag, och det kontrolleras i databasen.
- Rapportmejlet: Stockholmsdelen visar redan butikerna. Där läggs en summarad "Ålsten + Kungsholmen" till. Butiksraderna behålls.

## Vad som INTE påverkas

- **Lagersaldo**: inga ändringar. Ingen ny `stock_movements` och inga saldon skrivs. Det här är bara rapportberäkning.
- **Leveransavvikelser** (`usePurchaseReconciliation`, Mottagning): räknar fortfarande beställt mot levererat. Inget ändras.
- **Fortnox-fakturering** (`fortnox_build_shop_invoice_input`): fortsätter skicka levererad mängd. Fakturor går bara för packade/godkända rader, som i dag.
- **Veckorapporter per butik** (`weekly_store_reports`, låsning/omlåsning): oförändrade, eftersom de inte innehåller inköp.
- Inköpslistor, packning, produktion och FEFO: oförändrade.

## Följdeffekt att känna till

Beställt värde blir högre än verkligt inköp när varor inte levereras ("Ej tillgänglig" räknas bort, men minskade leveranser gör det inte). Det kan också skilja sig från Fortnox-fakturan. Resultatet ska därför märkas "Inköp = beställt värde".

## Tekniskt

- En migration: `result_units` (+ GRANT och RLS: läsa för admin/platform_admin, skriva för admin), `stores.result_unit_id`, `shop_order_purchase_value`, ny version av `resultat_per_butik` med nya kolumner längst bak (bakåtkompatibelt).
- Datasteg (efter ditt OK): skapa enheten och koppla Ålsten och Kungsholmen.
- Tester: beställt värde använder `cost_at_order` före `cost_price` och leveransdagen före önskat datum. Gruppen summerar båda butikerna.
- Ingen sidledsskroll: den utfällbara enhetsraden byggs som radbrytning eller kort på mobil.
