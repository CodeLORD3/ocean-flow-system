# Produktimport från CSV/Excel

## Bakgrund

Produktfilen kan exporteras och redigeras externt (t.ex. med Claude), men systemet
har idag ingen väg tillbaka in: Produkter-sidan har ingen filuppladdning och
projektet saknar bibliotek för att läsa CSV/Excel. Ändringar måste därför matas in
manuellt, produkt för produkt.

Den här planen bygger en import som tar emot exakt samma kolumnuppsättning som
exporten, visar en förhandsgranskning och skriver in ändringarna först när du
godkänner dem.

## Så fungerar det för användaren

1. På Produkter-sidan finns knapparna **Exportera** och **Importera**.
2. Exportera ger en fil med dagens sortiment (samma kolumner som tidigare export).
3. Du redigerar filen externt och laddar upp den igen.
4. Systemet läser filen och visar en granskningsvy innan något sparas:
   - Nya produkter (grönt)
   - Ändrade produkter, med gammalt värde -> nytt värde per fält (gult)
   - Oförändrade rader (döljs som standard)
   - Rader med fel (rött) — dessa importeras aldrig
5. Fel som blockerar en rad: okänd `parent_sku`, dubblett på `sku` eller `barcode`,
   pris som inte är ett tal, saknat namn eller kategori.
6. Varningar som inte blockerar: ny kategori eller enhet som inte finns i systemet
   sedan tidigare (visas så att stavfel upptäcks).
7. Du klickar **Importera** och får en sammanfattning: X nya, Y uppdaterade,
   Z hoppade över.

## Regler vid import

- `sku` är nyckeln. Rad med befintlig `sku` uppdateras, ny `sku` skapas.
- Produkter som saknas i filen rörs inte (ingen radering).
- `active = FALSE` inaktiverar en produkt i stället för att ta bort den.
- `parent_sku` kopplar varianten till sin förälder; tom = huvudprodukt.
- Tomma prisceller tolkas som 0, tomt `shelf_life_days` som okänt.
- Import loggas i aktivitetsloggen med användare, tidpunkt och antal rader.

## Teknisk beskrivning

- Nytt beroende: `xlsx` (läser både .xlsx och .csv).
- Ny komponent `src/components/products/ProductImportDialog.tsx`:
  filval, parsning, validering, diff-tabell, bekräftelse.
- Ny modul `src/lib/productImport.ts`: kolumnmappning, normalisering av tal och
  booleaner, validering, uppslag av `parent_sku` -> `parent_id`, diff-beräkning
  mot nuvarande produkter.
- Skrivning sker i batchar via `upsert` på `products` med `sku` som konfliktnyckel,
  i två steg: först huvudprodukter, sedan varianter (så att `parent_id` kan sättas).
- Exportknappen flyttas in i samma UI så att export/import ligger tillsammans, med
  identisk kolumnordning i båda riktningarna.
- Inga schemaändringar behövs.

## Utanför planen

- Ingen automatisk SKU-generering eller omdöpning av befintliga `NEW-...`/`-SUB-...`
  (du valde att lämna det som det är).
- Ingen import av lagersaldon per lagerplats — `stock`-kolumnen läses inte in.
