# Funktionstest av lager och inventering — avvikelser och förbättringar

Jag har gått igenom lagret och inventeringen mot planerna och kontrollerat verkliga siffror i databasen. Nedan står vad som stämmer, vad som avviker och vad jag föreslår att vi förbättrar.

## Det som fungerar som planerat

- Allt lager skrivs bara via lagerrörelser. Ett automatiskt test stoppar varje ny kodväg som försöker skriva saldot direkt — listan över undantag är tom.
- Lagerplatser slås upp på nivå (inköp, grossist, produktion, transport, butik), inte på namn. Inaktiverade platser ger fel i stället för tyst felbokning.
- Uppstartsläget "obegränsat lager" är avstängt i inställningarna.
- Marstrand har nu både transportlager och butikslager.
- Mobilräkningen fungerar enligt planen: en vara per skärm, blindräkning, partier, egen knappsats, återupptagning, parallella platser och chefsgodkännande innan något bokförs.
- Ankomstregistrering, överföringsordrar, svinnrapporter och namn på alla rörelsetyper finns.

## Avvikelser jag hittade

1. **Kassaköpen minskar inte lagret.** 128 kvitton finns i systemet, men bara 4 försäljningsrörelser totalt och noll de senaste 14 dagarna. Kassan skriver bara partifördelning, aldrig en lagerrörelse. Det är den enskilt största orsaken till att saldon inte stämmer.
2. **58 negativa saldorader, −305,7 kg**, samtliga i butikernas försäljningslager. Effekt av punkt 1 plus gamla uttag utan inleverans.
3. **Återstående "obegränsat lager" i koden.** Inställningen är avstängd, men om raden saknas tolkas läget som påslaget, och utleveransen kan då skapa vara ur tomma luften. Ska tolkas som avstängt när inget är satt.
4. **Kundbeställningar bokförs på butikens "första" lagerplats** i stället för uttalat butikslagret. Ändras ordningen hamnar saldot fel.
5. **Räkningen tappar rader om nätet försvinner.** Varje inmatning skickas direkt till databasen utan lokal kö; bara var man var i listan sparas lokalt. Planen kräver lokal kö med återsändning.
6. **15 halvöppna räkningar sedan 13 september** ligger kvar utan en enda rad och skräpar i platsvalet ("Fortsätt där du slutade" på tomma pass).
7. **Mobilräkningen kräver inte att överhoppade varor hanteras.** Datorvyn tvingar fram beslut vid låsning (räkna, nolla eller hoppa över med orsak); mobilen gör det inte.
8. **Hyllorna är borta.** Varje butik har bara en aktiv plats, "Försäljningslager". Disk, kyl och frys är inaktiverade, så räkningen kan inte delas upp fysiskt och två personer kan i praktiken inte räkna parallellt.
9. **273 rader med saldo saknar bäst före-datum** och 4 rader har passerat datum utan att någon varnas i butiksvyn.

## Egna förbättringsförslag

- **Hyllor tillbaka som riktig struktur:** Disk, Kyl, Frys och Lager per butik som underplatser till butikslagret. Räkning per hylla, parallella räknare, och saldo per hylla i butiksvyn.
- **Färgkoder genomgående i lagervyn:** grön = normalt, bärnsten = under miniminivå eller bäst före inom 2 dagar, tegel = negativt saldo eller passerat datum, grå = inget saldo. Samma färgspråk i mobilräkningens sammanfattning.
- **Varningsrad i butikens lagervy på mobil** (finns idag bara på dator): antal negativa, under min och passerade datum, med knapp direkt till raden.
- **Kort "Senast räknad" per hylla** så butiken ser vad som inte räknats på över en vecka.
- **Rimlighetskontroll vid inmatning:** varning när en siffra avviker mer än 5× från förväntat, så 100 kg i stället för 10 kg fångas medan personen står vid hyllan.

## Genomförande i ordning

1. Kassaköp bokförs som försäljningsrörelse på butikslagret, per parti och en gång per kvitto. Historiska kvitton efterbokförs som en spårbar justering med not.
2. Negativa saldon nollas med orsak inventering och not "Nollställning efter kassakoppling", efter en lista för godkännande.
3. "Obegränsat lager" tolkas som avstängt när inget är satt; kundbeställningar och returer bokförs mot butikslagret via nivåuppslag.
4. Lokal kö i mobilräkningen: varje rad sparas i telefonen och skickas när nätet finns, med synlig "sparas…"-status.
5. Tomma räkningar äldre än ett dygn städas bort automatiskt; överhoppade varor måste hanteras vid inskick.
6. Hyllor, färgkoder, varningsrad, "senast räknad" och rimlighetskontroll.
7. Automatiska tester för varje punkt ovan.

## Tekniska noteringar

- `supabase/functions/scomber-pos-checkout/index.ts` skriver idag bara `batch_allocations` — ska även anropa lagerbokföringen (`forsaljning` mot `butikslagerId(store)`), idempotent per `pos_transactions.id`.
- `src/lib/infiniteStock.ts:21` default ändras från `true` till `false`; fallbacken i `src/lib/stockTransfer.ts` tas bort.
- `src/lib/customerOrders.ts`: `primaryStoreLocationId` byts mot `butikslagerId()` i uttag, packning och `reverseLine`.
- Mobil kö i `src/lib/mobileCount.ts` + `useSaveCountLine` i `src/hooks/useMobileStockCount.ts`; städning av tomma pass som schemalagd fråga eller vid platsval.
- Hyllor: `storage_locations` med `parent_location_id` = butikslagret, `location_type='butik'`; saldo summeras uppåt i vyerna. Rörelser bokförs på hyllan.
- Färgkoder som semantiska tokens i `src/index.css` (befintligt Verktygstema), inga hårdkodade färger.
- Oförändrat: `stock_movements` som enda skrivväg, FEFO, godkännande före inventeringsjusteringar.

## Bevis som körs och redovisas

1. Ett testkvitto i kassan ger exakt en försäljningsrörelse per rad med rätt parti; dubbelkörning ger ingen extra rörelse.
2. Saldofrågor före/efter nollställning: noll negativa rader kvar, varje ändring spårbar.
3. Räkning med brutet nät: alla rader finns kvar och skickas när nätet återkommer.
4. Två personer räknar två hyllor samtidigt i samma butik utan att låsa ut varandra.
5. Skärmbilder vid 390 px av färgkoder och varningsrad.
