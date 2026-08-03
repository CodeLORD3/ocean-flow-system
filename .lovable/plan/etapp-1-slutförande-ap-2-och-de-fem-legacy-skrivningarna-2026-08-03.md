# Etapp 1 slutförande: AP-2 och de fem legacy-skrivningarna

Två spår, i den ordning du satte. Spår A stänger de fem direktskrivningarna efter volym. Spår B enar `products.stock` med lagerplatssaldona. Spår B görs först, eftersom fyra av de fem filerna skriver båda saldobegreppen i samma funktion — då slipper vi röra dem två gånger.

## Spår B först: AP-2, ett enda saldobegrepp

Idag finns `products.stock` (ett globalt tal per produkt) parallellt med `product_stock_locations` (kvantitet per lagerplats). Fem ställen skriver det globala fältet: inleverans, veckorapport, följesedel, manuell justering och Receiving.

Ändringen: `products.stock` blir **härlett**, precis som lagerplatssaldot blev i förra etappen.

- En databastrigger på `product_stock_locations` summerar produktens rader och skriver `products.stock`. Fältet blir en summa av lagerplatserna, aldrig en egen sanning.
- Ingen appkod skriver `products.stock` längre. De fem skrivningarna tas bort — rörelsen som redan bokförs i loggen uppdaterar lagerplatssaldot, och triggern uppdaterar summan.
- Alla 24 läsningar av `.stock` (Översikt, Produkter, Grossist, Streckkoder, Dashboard) fungerar oförändrat, eftersom fältet finns kvar med rätt värde.
- Engångsberäkning som sätter `products.stock` till den faktiska summan för alla produkter, så det gamla fältet inte bär kvar felaktiga tal.
- Manuell justering (`useProducts.ts`) kan inte längre skriva ett globalt tal utan lagerplats. Den blir en rörelse mot en vald lagerplats, med orsak — samma väg som Bokför svinn.

Efter detta finns ett saldobegrepp: rörelseloggen. Lagerplatssaldot härleds ur loggen, produktsaldot härleds ur lagerplatssaldot.

## Spår A: de fem filerna, i volymordning

**1. Receiving (butikens mottagning)** — högst volym, körs dagligen i alla butiker.

Här ligger din poäng om partiet. Mottagningen skriver idag utgångsdatum och ankomstdatum rakt på lagerplatsraden. Omlagd:

- Följesedelsraden bär `lot_id` från grossistens inleverans. Mottagningen bokför en `overforing_in` mot butikens lagerplats **med samma `lot_id`** — inget nytt parti skapas i butiksledet.
- Utgångsdatum och fångstuppgifter läses från moderpartiet i stället för att skrivas om på lagerraden. Bäst före kan justeras på partiet, inte per lagerplats.
- Saknar följesedelsraden `lot_id` (rader skapade före partiskapandet) skapas ett parti med härkomst "okänd" och en tydlig markering, så gamla rader inte tystas ner.
- Kravet: `lot_id` följer hela vägen grossist → transport → butikshylla, och spårbarhetsvyn visar samma parti i båda ledden.

**2. Inventory** — daglig inventering, näst största avvikelsekällan.

Skapande och redigering av lagerplatsrader (`min_stock`, ingående kvantitet) går via loggen: kvantitet blir en `ingaende_balans`-rörelse, `min_stock` blir ett rent inställningsfält utan saldopåverkan.

**3. PurchaseReporting** och **4. ProductionReporting** — ligger nära det som redan är byggt. Båda bokför via `recordMovement` med rätt rörelsetyp (`inleverans` respektive `tillverkning_in`/`tillverkning_ut`), och tillverkningen kopplas till moderpartiet via `lot_transformations`.

**5. useStorageLocations** — skriver bara vid uppsättning av nya lagerplatser. Nya rader skapas med noll kvantitet; eventuellt startsaldo blir en `ingaende_balans`-rörelse.

## Constraint samma dag som femte filen stängs

När `useStorageLocations` är klar, i samma leverans:

- Databasregel som avvisar `INSERT`/`UPDATE`/`DELETE` på `product_stock_locations`-saldofälten från annat än triggern `apply_stock_movement`. Det stänger hålet du pekade på: en manuell körning eller en edge function kan inte gå runt loggen, vilket ett test aldrig kan skydda mot.
- `LEGACY_DIRECT_WRITERS` i spärrtestet blir tom, och testet failar om listan får en post igen.

## Teknisk sammanfattning

- Migration: trigger `sync_product_stock_total` på `product_stock_locations` som summerar till `products.stock`; engångsomräkning; senare `product_stock_locations`-constraint mot direktskrivning.
- Kod: `products.stock`-skrivningarna bort ur `useIncomingDeliveries.ts`, `useWeeklyReports.ts`, `useDeliveryNotes.ts`, `useProducts.ts`, `Receiving.tsx`.
- `src/lib/stockLedger.ts` utökas med `receiveDeliveryLine()` som bevarar `lot_id` från följesedeln.
- `incoming_delivery_lines`/följesedelsrader läses för `lot_id`; saknas det skapas parti med okänd härkomst.
- Test: utökade fall i `src/test/stockLedgerGuard.test.ts` (ingen fil skriver `products.stock`), plus fall som verifierar att partiet är oförändrat genom grossist → butik.
