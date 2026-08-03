# Tre rättningar i Filé/Tillverkning

## 1. Ta bort dubbelviktningen

Idag används `margin_weight` två gånger: både när partiets råvarukostnad fördelas
(`allocateRawCost` viktar med kg × marginalvikt) och när det effektiva
marginalmålet räknas ut (`weightedTarget`). Ryggen bär därför marginalen två
gånger och partiet landar för högt.

Rättning:

- `allocateRawCost` fördelar råvarukostnaden **jämnt per kilo** över de
  inkluderade detaljerna: total råvarukostnad / summan av färdiga kilo. Alla
  detaljer får samma kr/kg (6 000 kr / 47 kg = 127,66 kr/kg).
- `margin_weight` påverkar därefter **enbart** det effektiva marginalmålet, dvs.
  hur priset sätts per detalj (rygg dyrare, slag billigare).

Marginalvikterna är redan balanserade runt 1 viktat mot kilo, så partiets
samlade marginal hamnar nära regionens mål (55 % Stockholm, 45 % Göteborg) i
stället för dagens 69,6 %. Räkneexemplet (torsk 100 kg) räknas om och
uppdateras i spec-dokumentet med de nya siffrorna.

## 2. Två marginaltal

Både i detaljtabellen och i partisammanfattningen visas:

- **Marginal på råvara** – (pris exkl moms − råvarukostnad) / pris exkl moms
- **Marginal ink. arbete** – (pris exkl moms − råvarukostnad − påslag) / pris exkl moms

Färgmarkeringen mot målet (grön/gul/röd) utgår från marginal ink. arbete,
eftersom den är jämförbar med bokföringen. Partiets marginal beräknas på samma
sätt: förädlingspåslaget dras av som kostnad, inte räknas som intäkt.

## 3. Utbyten och artgrupp på produkt

Kontroll mot databasen: 30 av de 31 artgrupperna i din lista finns redan i
`yields`. Endast **stillahavslax** saknas helt.

Åtgärder enligt ditt svar (”sätt mina värden överallt”):

- Lägg till `stillahavslax` 55 % (hel → sida med skinn, `is_estimate = true`).
- Uppdatera de procentsatser som avviker från din lista, t.ex. `sjötunga` och
  `slätvar` till 45, `rödtunga`/`sillflundra`/`långa`/`gös` till 42,
  `gädda` 40, `fjärsing` 35, `havskräfta` 90, samt behåll/sätt 100 % för
  kräftor, räkor, musslor och snäckor.
- Komplettera extraraderna: `räka-nordhav` hel → handskalad 40 %,
  `snökrabba` hel → kött 25 %, `blåmussla` hel → kött 25 %.
- Uppdateringen körs som `INSERT ... ON CONFLICT` så inga dubbletter uppstår.

Artgrupp på produkt:

- Ny kolumn `species_group` på `products` (text, nullable).
- Fält i produktformuläret (fritext med förslag från befintliga artgrupper i
  `yields`) och ny valfri kolumn `species_group` i produktimporten, normaliserad
  till gemener.
- Filé/Tillverkning kan då föreslå artgrupp direkt från valt råvaruprodukt.

## Tester

- Partitest: för en torsk-batch (100 kg, 60 kr/kg) får partiets samlade marginal
  ink. arbete aldrig avvika mer än 5 procentenheter från regionens mål – körs för
  både 55 % och 45 %.
- Täckningstest: varje `species_group` som förekommer på en aktiv produkt måste
  ha minst en rad i `yields`. Testet körs mot artgruppslistan i seeden så det
  fungerar utan databaskoppling, och listan hålls i `src/lib/speciesGroups.ts`
  som både formulär, import och test läser.

## Teknisk sammanfattning

- `src/lib/filletMath.ts`: `allocateRawCost` blir kostnad/kg jämnt fördelad;
  `calcDetailPrice` returnerar `marginOnRawPct` och `marginInclWorkPct`;
  `batchMargin` drar av påslag och returnerar båda talen.
- `src/components/production/ProductionOrderForm.tsx`: två marginalkolumner,
  färglogik mot marginal ink. arbete.
- Ny migration: `yields`-upsert + `products.species_group`.
- `src/lib/productImport.ts` och produktformuläret: stöd för `species_group`.
- `src/test/fillet.test.ts`: nya tester ovan.
- `/mnt/documents/file-tillverkning-spec.md`: uppdaterat räkneexempel och
  beskrivning av de två marginaltalen.
