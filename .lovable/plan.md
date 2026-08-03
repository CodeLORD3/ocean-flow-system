# Systemåterställning: import, partinummer, atomisk bokföring, lagervärde

Körs i din ordning. Varje steg avslutas med ett verifieringsutdrag ur databasen innan nästa steg börjar.

## Utgångsläge (verifierat nu)

- Ny fil `produkter_import_KLAR-2.xlsx`: 762 rader, 21 kolumner. `species_group` och `fao_code` ifyllda på samma 511 rader. `fao_code` ligger direkt efter `species_group`.
- Importeraren läser redan `latin_name`, `species_group` och `image_url`, men saknar `fao_code`.
- Smutsigt läge i databasen: två partier med `lot_number` `2` och `3` skapade 17:54 med tillhörande lagerrörelser, medan rapportens `posted_at` fortfarande är NULL.
- Kraschen kommer av att radernas `lot_numbers` (kollital som "2" och "3") användes som unik nyckel i `lots.lot_number`.

## Steg 1 — Importera om produktfilen

- Lägg till `fao_code` i importerarens kolumnmappning.
- Lägg till varning i torrkörningen när en förväntad kolumn saknas i filen, så att en tystnad som förra gången inte kan upprepas.
- Kör importen med `sku` som nyckel, uppdaterande.
- Verifiering: antal produkter med ifylld `species_group` ska bli 511, med `fao_code` 511, och antal aktiva utan artgrupp ska stämma mot filen.

## Steg 2 — Rätta partinummerläsningen

- Skärp tolkningen av följesedeln så att GFA:s format `10012.NNNNNNN` läses som partinummer och rena kollital inte gör det.
- Partinummer från leverantören sparas i `lots.supplier_lot_id`, aldrig i `lots.lot_number`.
- Verifiering: läs om FS_2026-07-28 och visa partinumren per rad.

## Steg 3 — Atomisk bokföring och egna partinummer

- `lot_number` genereras i databasen via en sekvens, inte i klienten.
- Hela bokföringen flyttas till en databasfunktion så att partier, rörelser och `posted_at` sätts i samma transaktion. Avbryts något sparas ingenting.
- Felmeddelanden på svenska.
- Städa bort de två partierna från 17:54 med tillhörande rörelser innan något nytt bokförs.
- Test: bokför samma rapport två gånger. Andra försöket ska nekas med tydligt svenskt meddelande och inte lämna spår.

## Steg 4 — Bind rapporterna till leverantör

- Sätt `supplier_id` och `document_date` på rapporter som saknar dem, utifrån dokumentets uppgifter.
- Verifiering: antal rapporter utan leverantörskoppling före och efter.

## Steg 5 — Bokför FS-2026-07-28

- Kör bokföringen skarpt.
- Verifiering: skapade partier med både internt `lot_number` och `supplier_lot_id`, antal lagerrörelser, samt att `posted_at` är satt.

## Steg 6 — Lagervärde från avg_cost

- Lagervärdet ska räknas från partiernas `avg_cost`, inte från fasta kostpriser.
- Därefter valideringsfallet: tillverkningsorder på torsk, 29 kg à 146 kr.

### Beslut som behövs innan steg 6

Utbytestabellen har idag för torsk endast två rader, båda från hel råvara: filé med skinn 47 procent, filé utan skinn 40 procent. Det finns ingen rad för rensad råvara, vilket är den form torsken kom in i. Ditt testfall räknar med 55 procent. NRV-utfallet kan alltså inte träffa de förväntade talen förrän utbytet är bestämt. Jag rättar inte utbytesdata på eget bevåg — säg vilket som gäller:

1. Ny rad rensad till filé utan skinn 55 procent, och 40 procent från hel lämnas orörd.
2. Befintlig rad hel till filé utan skinn rättas från 40 till 55 procent.
3. 40 procent är rätt, och jag redovisar de tal som faktiskt kommer ut.

## Steg 7 — Ta bort useUpdateStock

- Den skriver direkt mot `products.stock` och blockeras redan av spärren, alltså död kod. Tas bort tillsammans med anropsställen.
- Verifiering: sökning som visar noll återstående träffar, plus att testsviten fortsatt går igenom.

## Tekniska detaljer

- `src/lib/productImport.ts`: `fao_code` i mappningen, varning för saknade kolumner i torrkörning.
- Migration: sekvens för `lot_number`, databasfunktion för bokföring, städning av de två felaktiga partierna.
- `src/lib/purchaseReportPosting.ts`: anropar databasfunktionen istället för att bygga skrivningar radvis.
- `src/pages/PurchaseReporting.tsx`: knappen kopplas till det nya anropet, partinumren visas per rad.
- `src/hooks/useProducts.ts`: `useUpdateStock` bort.
