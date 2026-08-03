# Åtgärdsplan efter systemfelsökning (reviderad)

## Blockerare innan steg 1

`produkter_import_KLAR.xlsx` finns inte i sandlådan — jag har sökt i både uppladdningarna och dokumentmappen. Ladda upp filen, annars kan steg 1 inte köras. Jag härleder inga värden.

## Ny diagnos av kraschen — orsaken är inte en räknare

Jag läste `postPurchaseReport` i `src/lib/purchaseReportPosting.ts` (rad 240-317). Det finns **ingen** nummerräknare i koden. `lot_number` sätts rakt av till `lot.lotNumber`, som kommer från allokeringsnycklarna i `buildPostingPlan` (rad 172-188) — alltså direkt ur radens `lot_numbers`.

Eftersom `lot_numbers` idag innehåller **kollital** (`"1"`, `"2"`, `"3"`, `"4"`) och `lots.lot_number` har ett globalt UNIQUE-index, kolliderar partierna med varandra så snart två rader har samma kollital. Kraschen är alltså en direkt följd av fel 2 i planen, inte ett separat räknarfel.

### Databasen är smutsig — men inte som väntat

Två partier skapades 17:54 innan kraschen, och **båda har en kopplad rörelse**:

| lot_number | kg | rörelser |
|---|---|---|
| `3` | 30,000 | 1 |
| `2` | 30,000 | 1 |

`stock_movements` har nu 2 rader av typ `inleverans` (60 kg) utöver de 9 justeringarna. `purchase_reports.posted_at` är fortfarande NULL — kraschen inträffade före den sista uppdateringen.

"Ta bort partier utan rörelser" träffar därför noll rader. I stället backas de två partierna ut via den befintliga `unpostPurchaseReport`-vägen, så saldot motbokas i stället för att raderas.

## Ordning

### 1. Importera om produktfilen

`species_group` är NULL på 762/762 produkter eftersom kolumnen lades till på `products` efter importen och värdet ignorerades tyst.

Importera om `produkter_import_KLAR.xlsx` med `sku` som nyckel (uppdaterar befintliga rader, skapar inga dubbletter). Kontrollera först att importläsaren faktiskt plockar upp `species_group`, `latin_name`, `fao_code` och `image_url` — annars tappas de igen.

**Inget härledningsskript.** 189 aktiva produkter ska ha tomt `species_group` (sillar, såser, konserver, varmkök, råvaror, frukt och grönt, emballage). Tomt är rätt svar för dem.

Rapport efter importen: antal med `species_group`, antal med `latin_name`, och antal aktiva produkter i Färsk Fisk eller Skaldjur som saknar `species_group`.

### 2. Rätta partinummerläsningen

GFA:s partinummer (`10012.NNNNNNN`) hamnar i `supplier_article_no` medan `lot_numbers` fylls med kollital. Skärp prompten i `parse-foljesedel` så fälten hålls åtskilda, och lägg till en efterkontroll som flyttar värden i formatet `NNNNN.NNNNNNN` till `lot_numbers` när AI:n missar. FS_2026-07-28 rättas med samma regel.

### 3. Rätta lot_number och gör bokföringen atomisk

- **Nummer i databasen, inte i klienten.** En `security definer`-funktion tilldelar `lot_number` från en sekvens när leverantörens partinummer saknas, och namnrymdar leverantörens nummer per leverantör och dokument så två leverantörer aldrig kan kollidera. Säker vid samtidiga anrop.
- **En transaktion.** Hela bokföringen — alla partier, alla rörelser, radkopplingarna och `posted_at` — flyttas till en databasfunktion som körs i ett anrop. Kraschar något rullas allt tillbaka, så databasen aldrig lämnas halvfärdig.
- **Svenska fel.** Databasens råtext (`duplicate key value violates unique constraint …`) översätts till vad man gör åt saken, t.ex. "Partinummer 3 finns redan på ett annat parti — kontrollera partinumren på följesedeln".
- **Dubbelbokföring stoppas** av `posted_at`-kontrollen med "Rapporten är redan bokförd" i stället för en krasch.
- **Städning först:** de två partierna från 17:54 backas ut innan nästa försök.
- **Test:** bokför samma rapport två gånger i följd — andra gången ska ge det svenska meddelandet, inte ett undantag.

Sammanslagningen av rader med samma partinummer fungerar redan ("2 rader, 109 kg à 150 kr") och rörs inte.

### 4. Bind rapporter till leverantör

`supplier_id` är NULL på 55 av 55 rapporter, vilket gör båda dubblettindexen verkningslösa och `supplier_article_map` omöjlig att fylla. `total_ex_vat` extraheras aldrig. Matcha `supplier_name_raw` mot `suppliers` vid inläsning, spara `supplier_id`, läs ut nettosumman, och kräv manuellt val när matchningen är osäker.

### 5. Bokför FS_2026-07-28 skarpt

Verifiera att `lots` får riktiga partinummer, att `stock_movements` får typ `inleverans`, att raderna får `lot_id`/`movement_id` och att `avg_cost` i `product_stock_locations` blir skilt från noll. Först då är partispårbarheten och NRV-motorn bevisade i drift.

### 6. Lagervärde från avg_cost

Fem sidor räknar lagervärde på `products.cost_price` i stället för lagerplatsernas `avg_cost`: Dashboard, OrganisationOverview, Wholesale, Products, Barcodes. Byt källa till `product_stock_locations.stock_value`/`avg_cost`. Kvantiteterna är redan rätt via triggern och rörs inte.

### 7. Ta bort useUpdateStock

`src/hooks/useProducts.ts:97-115` skriver `products.stock` direkt, vilket databasspärren kastar undantag på. Den har inga anropare.
