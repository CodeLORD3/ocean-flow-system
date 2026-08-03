# Åtgärdsplan efter systemfelsökning (reviderad 2)

## Kontroller redan gjorda mot filen och koden

`produkter_import_KLAR.xlsx`: 762 rader, 20 kolumner. `species_group` ifyllt på **511** rader, `latin_name` på **511**, `image_url` på **378**.

**Filen har ingen `fao_code`-kolumn** (den har `hs_code`). `products.fao_code` blir därför tom även efter importen — det är en separat fråga, inte något importen kan lösa.

Importläsaren `src/lib/productImport.ts` **läser redan** `species_group` (rad 125, 245), `latin_name` (rad 244) och `image_url` (rad 243), med aliasstöd för svenska rubriker. Alla 20 kolumner i filen har en mottagare utom `fao_code`, som inte finns i filen. Att värdena tappades förra gången berodde på att databaskolumnen inte fanns då — läsaren är rätt idag.

`lots.supplier_lot_id` finns redan i tabellen.

## Kraschen — bekräftad orsak

`postPurchaseReport` sätter `lot_number` rakt av till `lot.lotNumber`, som kommer ur radens `lot_numbers`. Eftersom `lot_numbers` idag innehåller kollital (`"1"`, `"2"`, `"3"`, `"4"`) och `lots.lot_number` har globalt UNIQUE-index, kolliderar partierna. Ingen räknare är inblandad.

Två partier hann skapas 17:54, båda **med** kopplad rörelse (`lot_number` `2` och `3`, 30 kg vardera, 60 kg `inleverans`). `posted_at` är fortfarande NULL. De backas ut via `unpostPurchaseReport` så saldot motbokas.

## Ordning

### 1. Importera om produktfilen

Kör igenom importens torrkörning först och **varna** för varje filkolumn som saknar mottagare i stället för att hoppa över den tyst. Importera sedan med `sku` som nyckel.

Inget härledningsskript: 189 aktiva produkter ska ha tomt `species_group` (sillar, såser, konserver, varmkök, råvaror, frukt och grönt, emballage).

Rapport efter importen: antal med `species_group`, antal med `latin_name`, samt antal aktiva produkter i Färsk Fisk eller Skaldjur som saknar `species_group`.

### 2. Rätta partinummerläsningen

GFA:s partinummer (`10012.NNNNNNN`) hamnar i `supplier_article_no` medan `lot_numbers` fylls med kollital. Skärp prompten i `parse-foljesedel` så fälten hålls åtskilda, och lägg till en efterkontroll som flyttar värden i formatet `NNNNN.NNNNNNN` till `lot_numbers` när AI:n missar. FS_2026-07-28 rättas med samma regel.

### 3. Rätta lot_number och gör bokföringen atomisk

- **Två fält, två syften.** Leverantörens partinummer sparas oförändrat i `lots.supplier_lot_id` (`10012.6125240`), och `lot_number` blir vårt eget namnrymdade nummer, tilldelat i databasen från en sekvens — säkert vid samtidiga anrop. Sökningen i spårbarhetsvyn träffar **båda** fälten.
- **En transaktion.** Hela bokföringen — partier, rörelser, radkopplingar och `posted_at` — flyttas till en databasfunktion som körs i ett anrop. Kraschar något rullas allt tillbaka.
- **Svenska fel.** Databasens råtext översätts till vad man gör åt saken.
- **Dubbelbokföring** stoppas av `posted_at`-kontrollen med "Rapporten är redan bokförd".
- **Städning först:** de två partierna från 17:54 backas ut.
- **Test:** bokför samma rapport två gånger — andra gången ska ge det svenska meddelandet, inte ett undantag.

Sammanslagningen av rader med samma partinummer fungerar redan ("2 rader, 109 kg à 150 kr") och rörs inte.

### 4. Bind rapporter till leverantör

`supplier_id` är NULL på 55 av 55 rapporter, vilket gör båda dubblettindexen verkningslösa och `supplier_article_map` omöjlig att fylla. `total_ex_vat` extraheras aldrig. Matcha `supplier_name_raw` mot `suppliers` vid inläsning, spara `supplier_id`, läs ut nettosumman, kräv manuellt val när matchningen är osäker.

### 5. Bokför FS_2026-07-28 skarpt

Verifiera att `lots` får både eget och leverantörens partinummer, att rörelserna får typ `inleverans`, att raderna får `lot_id`/`movement_id` och att `avg_cost` blir skilt från noll.

### 6. Kör hela kedjan på torsken

Skapa en tillverkningsorder i Filé/Tillverkning på torsken (29 kg à 146 kr) och stäm av NRV-utfallet mot de tidigare framräknade talen:

| kontroll | förväntat |
|---|---|
| rygg, kvantitet | 8,773 kg |
| rygg, kostnad | 379,49 kr/kg |
| rygg, marginal | 44,9 % |
| partiets marginal | 42,9 % |
| V per kg filé | 526,60 kr |

Avviker något redovisas siffran som den blev, inte som den borde bli.

### 7. Lagervärde från avg_cost

Fem sidor räknar lagervärde på `products.cost_price` i stället för lagerplatsernas `avg_cost`: Dashboard, OrganisationOverview, Wholesale, Products, Barcodes. Byt källa till `product_stock_locations.stock_value`/`avg_cost`. Kvantiteterna är redan rätt via triggern.

### 8. Ta bort useUpdateStock

`src/hooks/useProducts.ts:97-115` skriver `products.stock` direkt, vilket databasspärren kastar undantag på. Inga anropare.
