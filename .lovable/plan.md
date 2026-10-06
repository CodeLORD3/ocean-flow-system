# Partietiketter och skanning – plan

## Det som redan finns och återanvänds
- Tabellerna `lots` (bl.a. `lot_number`, `catch_area`, `best_before`, `supplier_id`, `quantity_kg`, `parent_lot_id`, `origin_lot_id`), `lot_transformations` (från-parti, till-parti, kg in och kg ut), `stock_transformations` (`yield_pct`, `waste_quantity`), `stock_movements` (typerna `svinn`, `overforing_ut/in`, `tillverkning_in/ut`, `forsaljning`, `kundorder`), `storage_locations` och `transfer_orders`.
- Omvandlingslogiken i `src/lib/stockTransform.ts`, `src/lib/lotTransformation.ts` och `useStockTransformations` skapar redan nytt parti och lagerrörelser.
- Funktioner i databasen: `next_internal_lot_number`, `lot_remaining`, `pick_lot_fefo` och spärrarna för obehandlade partier (`block_untreated_lot_*`).
- Spårbarhetsvyn `/traceability` med `LotTraceabilityView` och `trace_lot_to_invoices`.
- Etikettmallen `customerOrderLabelPdf.ts` är redan gjord för Brother QL-800 på 62 × 29 mm med jsPDF.
- Kameraskannern `BarcodeScanner` (html5-qrcode).
- Biblioteken finns redan installerade: `qrcode`, `jspdf`, `html5-qrcode` och `jsbarcode`. Inga nya behövs.

## Det som behöver byggas
1. **Partisida** `/lot/:id`, som QR-koden länkar till och som fungerar i mobilen. Den visar uppgifter, kvar i kg och plats, samt knapparna Flytta, Omvandla, Svinn, Räkna och Skriv ut etikett. Behörigheten följer bolag och butik via RLS.
2. **`src/lib/lotLabelPdf.ts`**: en etikett på 62 × 29 mm (alternativt 62 × 50 mm). Den innehåller QR-kod med länk till partisidan, partinummer, art (handelsnamn och latinskt namn), fångstområde, vikt med en decimal, bäst före med svenskt datum och leverantörens fullständiga namn. Den öppnas i webbläsarens utskriftsdialog.
3. **Knappen Skriv ut etikett** på partisidan, i spårbarhetsvyn, i partilistan och direkt efter en omvandling.
4. **Skanningsknapp i mobilvyn**. Den återanvänder `BarcodeScanner` med QR-läge. En läst länk eller ett partinummer öppnar `/lot/:id`.
5. **Omvandla från parti**: ett formulär med ingående parti (skannat eller förvalt), vikt in, vikt ut och ny produkt. Det anropar den befintliga omvandlingslogiken, räknar fram utbytet i procent och erbjuder sedan utskrift av ny etikett.
6. **Svinn från parti**: vikt och orsak. Det skriver en `stock_movements` av typen `svinn` på partiet och platsen, på samma sätt som i dag.
7. **Flytta**: väljer plats och skapar en `transfer_order` eller rörelsepar som i dag.
8. **Räkna**: anger räknad vikt och skapar en inventeringsrörelse via befintligt inventeringsflöde.
9. **Spårbarhetskedjan på partisidan**:
   - Bakåt: leverantör, auktion (`auction_purchases`) och inleverans. Kedjan följer `parent_lot_id` och `lot_transformations`.
   - Framåt: omvandlingar, flyttar, försäljning, kundorder och svinn.
   - Den återanvänder `LotTraceabilityView`, eventuellt delad i mindre delar.

## Databas
- Ingen ny tabell. Eventuellt en läsfunktion, `lot_chain(_lot_id)`, som ger hela kedjan i ett anrop med rekursiv sökning.
- Inga nya kolumner, om etiketten inte ska visa något som saknas.

## Risker
- **Skrivaren:** Webbläsarens utskrift till Brother QL kräver att rätt pappersstorlek (62 mm) är vald i skrivardrivrutinen och att marginalerna är 0. Varje enhet måste ställas in en gång.
- **Kameran:** Kameran kräver https och tillstånd i mobilen. På äldre iPhones kan läsningen bli långsam.
- **QR-länken:** QR-koden länkar till den publicerade adressen. Den som skannar måste vara inloggad, annars öppnas inloggningssidan först.
- **Delvis sparade omvandlingar:** Omvandlingen måste sparas i ett enda steg i databasen, så att inte bara ena halvan sparas om nätet bryts. Kontrollera att dagens flöde gör det. Annars behövs en databasfunktion.
- **Spärrarna:** Spärrarna för obehandlade partier och parasitkontroll måste gälla även från skanningen. De ligger i databasen och gäller därför automatiskt.
- **Vikt:** Kg avrundas till en decimal i visning och inmatning.
- **Långa kedjor:** Långa kedjor kan bli långsamma och kan behöva begränsas i djup.

## Ungefärlig storlek
- Medelstor: en ny sida, en etikettfil och fyra små formulär (Flytta, Omvandla, Svinn, Räkna).
- Ändringar på två eller tre ställen för att lägga in knappar.
- Eventuellt en ny läsfunktion i databasen.
- Uppskattning: cirka 1 200–1 600 rader kod.
