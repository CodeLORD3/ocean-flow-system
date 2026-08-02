# Buggfix: svenska tecken i bulk-uppladdning av produktbilder

## Vad som händer idag (verifierat i koden)

- **Matchning av filnamn mot SKU fungerar redan** för Å/Ä/Ö. `ProductImageBulkUpload.tsx` normaliserar både filnamn och SKU med samma funktion som för produktnamn (å/ä → a, ö → o, övriga tecken bort), så `RO-013.png` matchar redan produkten `RÖ-013`. Ingen ändring behövs här — den delen bekräftas som redan på plats.
- **Uppladdningen är den faktiska buggen.** Lagringsnyckeln byggs av SKU:n och behåller `ÅÄÖåäö` explicit, vilket ger felet "Invalid key" från lagringen för `RÖ-013` och `RÅ-001`.
- **Produktimporten matchar SKU exakt** (bara gemener, ingen translitterering). En importfil med `RO-013` hittar därför inte den befintliga produkten `RÖ-013` utan skapar/behandlar den som ny.

## Vad som ska byggas

### 1. Gemensam translittereringshjälp
En liten delad funktion som gör om svenska tecken till ASCII (Å/Ä → A, Ö → O, å/ä → a, ö → o) och en normaliseringsvariant för jämförelser. Placeras så att både bulk-uppladdningen och importen använder samma logik.

### 2. Uppladdning alltid med ASCII-nyckel
Lagringsnyckeln translittereras innan uppladdning: `RÖ-013.png` sparas som `RO-013.png`. Produktens bildlänk (`image_url`) pekar på den translittererade filen. Inga filer avvisas längre på grund av svenska tecken. Övriga tecken utanför A–Z, 0–9, bindestreck, understreck och punkt ersätts fortsatt med `_`.

### 3. Tolerant SKU-matchning vid import
Uppslaget av befintliga produkter vid import görs på translittererad, gemen SKU, så att `RO-013` i filen matchar produkten `RÖ-013`. Samma sak för dubblettkontrollen inom filen och för `parent_sku`-uppslaget, så att en förälder med svenska tecken kan refereras i ASCII-form. Befintliga SKU-värden i databasen ändras inte — bara jämförelsen blir tolerant.

### 4. Uppdaterad hjälptext
Texten i bulk-uppladdningsdialogen kompletteras med att svenska tecken hanteras automatiskt: filen får heta `RO-013.png` även om SKU:n är `RÖ-013`.

## Teknisk sammanfattning

- Ny hjälpfunktion (`asciiFold` / `skuKey`) i en delad modul under `src/lib/`.
- `src/components/products/ProductImageBulkUpload.tsx`: nyckelbygget i uppladdningssteget använder `asciiFold` före tecken-saneringen; `norm` byter till den delade implementationen (samma beteende).
- `src/lib/productImport.ts`: `bySku`, dubbletträknaren och `parent_sku`-uppslaget använder `skuKey` i stället för `toLowerCase()`.
- Inga databasändringar, inga ändringar i validering av `image_url`-format.
