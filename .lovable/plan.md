# Åtgärdsplan efter systemfelsökning

Fem fel, i den ordning de blockerar varandra. Inget byggs förrän du godkänner.

## 1. Fyll species_group på produktregistret

Alla 762 produkter har `species_group = NULL`. Det kapar kedjan produkt → art → styckningsmodell → utbyte → pris, och gör tillverkningsorder och NRV-beräkning omöjliga trots att `species_cut_models` (52), `cut_splits` (16) och `yields` (98) är på plats.

Fyll `species_group` från `latin_name` via `species_key()` och den befintliga aliaslistan, med SKU-prefix som reserv. Rapportera hur många produkter som inte kunde härledas i stället för att gissa på dem.

## 2. Läs partinummer från rätt fält

GFA:s partinummer (`10012.NNNNNNN`) hamnar i `supplier_article_no` medan `lot_numbers` fylls med kollital (`"1"`, `"2"`, `"4"`).

Skärp prompten i `parse-foljesedel` så partinummer och kollital hålls åtskilda, och lägg till en efterkontroll som flyttar värden i formatet `NNNNN.NNNNNNN` till `lot_numbers` när AI:n missar. Befintlig rapport FS_2026-07-28 rättas med samma regel.

## 3. Bind rapporter till leverantör och nettosumma

`supplier_id` är NULL på 55 av 55 rapporter, vilket gör båda dubblettindexen verkningslösa och `supplier_article_map` omöjlig att fylla. `total_ex_vat` extraheras aldrig.

Matcha `supplier_name_raw` mot `suppliers` vid inläsning, spara `supplier_id`, och läs ut nettosumman. Kräv manuellt val i granskningsvyn när matchningen är osäker.

## 4. Bokför den första inleveransen skarpt

Efter steg 2 och 3: bokför FS_2026-07-28 och verifiera att `lots`, `stock_movements` av typ `inleverans`, `lot_id`/`movement_id` på raderna och `avg_cost` i `product_stock_locations` faktiskt får värden. Det är först då partispårbarheten och NRV-motorn är bevisade i drift.

## 5. Låt lagervärdet komma från partierna

Fem sidor räknar lagervärde på `products.cost_price` i stället för lagerplatsernas `avg_cost`, och visar därför noll eller felaktigt värde: Dashboard, OrganisationOverview, Wholesale, Products, Barcodes.

Byt källa till `product_stock_locations.stock_value`/`avg_cost`. Kvantiteterna är redan rätt via triggern och rörs inte.

## Städning i samma svep

Ta bort `useUpdateStock` i `src/hooks/useProducts.ts` — den skriver `products.stock` direkt, vilket databasspärren kastar undantag på, och den har inga anropare.

## Teknisk not

Inget av detta kräver nya tabeller eller kolumner; schemat är komplett och alla 25 senaste migrationerna är körda. Steg 1 och 2 är dataåtgärder plus en promptändring, steg 3 rör `parse-foljesedel` och granskningsvyn, steg 5 är rena presentationsändringar.
