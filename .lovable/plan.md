# Systemåterställning: import, partinummer, atomisk bokföring, utbyten per sortering, NRV

Körs i din ordning. Varje steg avslutas med ett verifieringsutdrag ur databasen innan nästa steg börjar. Inga tal skrivs om för att matcha en förväntan — utfallet redovisas som det blir.

## Utgångsläge (verifierat)

- `produkter_import_KLAR-2.xlsx`: 762 rader, 21 kolumner. `species_group` och `fao_code` ifyllda på samma 511 rader.
- Importeraren läser `latin_name`, `species_group`, `image_url` men saknar `fao_code`.
- Smutsigt läge: två partier med `lot_number` `2` och `3` skapade 17:54 med lagerrörelser, medan rapportens `posted_at` är NULL. Orsak: radernas kollital användes som unik nyckel i `lots.lot_number`.
- `species_cut_models` styr styckning på **vikt**, inte sortering: torsk och övriga rundfiskar har `cut_model = loin_four` med `min_piece_weight_kg = 3`. Ingen gradkolumn finns.
- `yields` har `is_estimate` och `calibrated_count`, men **ingen kolumn för sortering**.
- `detail_prices` torsk `butik_goteborg`: rygg 698, benfri filé 249, slag 129, kontrarygg 398. **Ingen rad för hel filé.**
- `marulk` saknar `hel`-rad; endast `rensad stjärt` 65 procent, uppmätt.

## Steg 1 — Importera om produktfilen

- `fao_code` läggs till i kolumnmappningen.
- Torrkörningen varnar när en förväntad kolumn saknas i filen, så en tystnad som förra gången inte kan upprepas.
- Import med `sku` som nyckel, uppdaterande.
- Verifiering: 511 produkter med `species_group`, 511 med `fao_code`.

## Steg 2 — Rätta partinummerläsningen

- GFA:s format `10012.NNNNNNN` läses som partinummer, rena kollital gör det inte.
- Leverantörens nummer sparas i `lots.supplier_lot_id`, aldrig i `lots.lot_number`.
- Verifiering: läs om FS_2026-07-28 och visa partinumren per rad.

## Steg 3 — Atomisk bokföring och egna partinummer

- `lot_number` genereras av en databassekvens, inte i klienten.
- Bokföringen flyttas till en databasfunktion: partier, rörelser och `posted_at` i samma transaktion. Avbryts något sparas ingenting.
- Felmeddelanden på svenska.
- De två partierna från 17:54 städas bort med tillhörande rörelser innan något nytt bokförs.
- Test: bokför samma rapport två gånger. Andra försöket nekas och lämnar inga spår.

## Steg 4 — Bind rapporterna till leverantör

- `supplier_id` och `document_date` sätts på rapporter som saknar dem, utifrån dokumentets uppgifter.
- Verifiering: antal rapporter utan leverantörskoppling före och efter.

## Steg 5 — Bokför FS-2026-07-28

- Verifiering: skapade partier med både internt `lot_number` och `supplier_lot_id`, antal lagerrörelser, `posted_at` satt.

## Steg 6 — Utbyten för rensad råvara, per sortering

`yields` utökas med en sorteringskolumn. NULL betyder artens grundvärde och är fallbacken när sorteringsraden saknas — tillverkningsordern markerar då att grundvärdet användes.

Befintliga `hel`-rader lämnas orörda. Alla nya rader får `is_estimate = true` och kalibreras mot `yield_actuals` när tre partier vägts.

Rensad till filé utan skinn, per sortering:

```text
torsk   grad 1  50   grad 2  49   grad 3  47   grad 4  45   grad 5  43
kolja   grad 1  48   grad 2  46   grad 3  44   grad 4  42
sej     grad 1  47   grad 2  45   grad 3  43   grad 4  41
```

Artgrundvärden för rensad, utan sortering: torsk 48, kolja 46, sej 45.

Övriga arter får en rensad-rad satt till hel-värdet delat med 0,85, avrundat till heltal: kummel, langa, rodtunga, piggvar, slatvar, sjotunga, rodspatta. **Marulk utesluts** — arten har ingen hel-rad att räkna från, bara en uppmätt `rensad stjärt` på 65 procent som inte ska skrivas över. Jag redovisar de framräknade procenten per art innan de skrivs.

### Sortering till styckningsmodell

`species_cut_models` avgör idag på vikt, inte grad. Din regel — grad 1 och 2 ger `loin_four`, grad 3 och högre ger `single` — måste därför byggas in som en uttalad gradgräns istället för att härledas ur viktgränsen. Jag lägger en gradgräns i modellen och behåller viktgränsen som fallback när sortering saknas på partiet.

## Steg 7 — Prissättning vid single och hel filé

- `cut_form = 'hel filé'` läggs in i `detail_prices` för arter med `cut_model = single`, markerade som pris saknas till värdet är satt.
- När modellen är `single` visar gränssnittet inte en tabell med en rad och 100 procents intäktsandel, utan kostnad per kg, pris och marginal direkt. Formeln är oförändrad.

## Steg 8 — Lagervärde från avg_cost och verifieringsfall

Lagervärdet räknas från partiernas `avg_cost`, inte från fasta kostpriser.

**Fall A, loin_four:** torsk 29 kg à 146 kr, utbyte 48 procent, uppdelning 55/20/15/10, påslag 35 kr/kg, moms 6 procent.

Här behövs ett beslut. Dina förväntade tal bygger på priserna 798/249/198/398, men databasen har rygg 698 och slag 129. Intäktsandelarna och därmed NRV-fördelningen blir andra med databasens priser, och partimarginalen lägre än de 35 procent du räknar med. Jag kör inte förbi det tysta valet:

1. Kör mot databasens priser (698/249/129/398) och redovisa utfallet som det blir.
2. Uppdatera `detail_prices` till 798 och 198 först, eftersom det är den prislista som gäller, och kör därefter.

**Fall B, single:** torsk 4 rensad, 35 kg à 89 kr/kg, GFA 2026-07-23, parti 10012.6121679, utbyte 45 procent, påslag 35 kr/kg, moms 6 procent. Förväntat: filé 15,750 kg, kostnad 197,78 kr/kg, med påslag 232,78 kr, butikspris 449 kr inkl moms, grossist 298,44 kr ex moms.

Båda fallen redovisas sida vid sida så att skillnaden mellan grad 1 och grad 4 för samma art syns.

## Steg 9 — Ta bort useUpdateStock

- Skriver direkt mot `products.stock`, blockeras redan av spärren, alltså död kod. Tas bort med anropsställen.
- Verifiering: noll återstående träffar, testsviten går igenom.

## Tekniska detaljer

- `src/lib/productImport.ts`: `fao_code` i mappningen, varning för saknade kolumner i torrkörning.
- Migrationer: sekvens för `lot_number`; databasfunktion för bokföring; städning av de två felaktiga partierna; sorteringskolumn på `yields` plus de nya raderna; gradgräns i `species_cut_models`; `hel filé` i `detail_prices`.
- `src/lib/purchaseReportPosting.ts`: anropar databasfunktionen istället för radvisa skrivningar.
- `src/pages/PurchaseReporting.tsx`: knappen mot det nya anropet, partinummer per rad.
- Utbytesuppslag: sortering först, artgrundvärde som fallback med markering i tillverkningsordern.
- `src/hooks/useProducts.ts`: `useUpdateStock` bort.
