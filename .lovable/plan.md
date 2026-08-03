# Luckor i inleverans, pris, lager och Filé/Tillverkning

Genomgång av koden mot hur branschsystem för fisk (Wisefish, inecta, Loop ERP, SeafSoft) bygger samma flöden. Nedan är verifierade luckor plus förslag i prioritetsordning.

## Verifierat i koden idag

- Leverantörsinleveransen (`useIncomingDeliveries`) skriver bara till `products.stock` (ett globalt tal) och till inleveransraderna. Den skapar ingen rad i `product_stock_locations`, så batchnummer och bäst-före från inleveransen hamnar aldrig på en lagerplats.
- Butiksmottagningen (`Receiving.tsx`) gör det motsatta: den skriver `expiry_date` och ankomstdatum direkt på `product_stock_locations`. Två parallella lagerspår som inte möts.
- Det finns ingen transaktionslogg för lager. I databasen finns bara `deleted_stock_log`; alla plus och minus skrivs som direkta uppdateringar av `quantity` (`productionStock.ts`, `stockTransfer.ts`, `StockCountDialog`). Går inte att svara på "varför ändrades saldot".
- Lagerinventeringen sätter nytt saldo rakt över det gamla utan att spara differensen som ett inventeringsresultat.
- Prissättningen (`Pricing.tsx`) räknar marginal produkt för produkt mot `cost_price`; den använder inte det viktade snittkostpriset som faktiskt ligger på lagerplatsen.

## Föreslagna åtgärder

### 1. Ett gemensamt lagerhuvudbokstabell (högst prioritet)
En tabell `stock_movements` med produkt, lagerplats, kvantitet med tecken, typ (inleverans, tillverkning, försäljning, flytt, inventering, svinn), kostpris, referens till källdokument och användare. Alla befintliga skrivvägar går via en hjälpfunktion som bokför raden och uppdaterar saldot. Ger spårbarhet, felsökning och underlag för svinnrapport.

### 2. Koppla leverantörsinleveransen till lagerplats och batch
Inleveransformuläret väljer mottagande lagerplats. Varje rad skapar saldo på den platsen med batchnummer, bäst-före och inköpspris som kostpris, i stället för att bara öka `products.stock`. Bäst-före räknas fram från produktens hållbarhetsdagar om det inte anges.

### 3. FEFO-plockning och svinn
När lager tas i anspråk (tillverkning, order, kassa) väljs partiet med tidigast bäst-före först. Utgångna partier flaggas och kan skrivas av som svinn med orsak, vilket bokförs i huvudboken.

### 4. Inventeringsdifferens som eget resultat
Inventeringen sparar räknat mot förväntat, differens i kilo och kronor per rad, och bokför justeringen som en rörelse. Ger en inventeringshistorik per butik och period.

### 5. Kostpris från lagret in i prissättningen
Prissättningen visar verkligt viktat snittkostpris per produkt från `product_stock_locations` sida vid sida med det manuellt satta `cost_price`, och varnar när marginalen räknas på ett kostpris som avviker mer än tio procent från lagrets. Marginalmålen per region (Sthlm 55 procent, Gbg 45 procent) som redan finns i Filé/Tillverkning används som färgmarkering även här.

### 6. Kopplingar i Filé/Tillverkning som saknas
Tillverkningsordern konsumerar råvara utan att låsa vilket parti som gick in. Med batch på inleveransen kan ordern referera partiet, så detaljerna ärver fångstområde, redskap och bäst-före. Det är den spårbarhet branschsystemen bygger hela sitt regelverk kring, och den behövs för märkning.

## Teknisk sammanfattning

- Ny tabell `stock_movements` i public med grants och RLS enligt mönstret för övriga tabeller, plus index på produkt, plats och datum.
- Ny modul `src/lib/stockLedger.ts` som ersätter direktskrivningarna i `productionStock.ts`, `stockTransfer.ts`, `StockCountDialog.tsx` och inleveranshooken.
- `useIncomingDeliveries` utökas med `location_id` och skriver via huvudboken; formuläret i mottagningsvyn får val av lagerplats.
- FEFO-hjälpfunktion som sorterar partier på `expiry_date` och används av tillverkning och orderplock.
- `Pricing.tsx` läser snittkostpris per produkt och visar avvikelse mot satt kostpris.

## Ordning

Punkt 1 och 2 först, eftersom resten bygger på dem. Därefter 4 och 5, som är små när huvudboken finns. Punkt 3 och 6 sist.
