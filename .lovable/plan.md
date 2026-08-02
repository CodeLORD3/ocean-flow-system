# Produktimport (CSV / Excel)

## Bakgrund

Produktfilen kan exporteras och redigeras externt (t.ex. med Claude), men systemet
har idag ingen väg tillbaka in: Produkter-sidan har ingen filuppladdning och
projektet saknar bibliotek för att läsa CSV/Excel. Ändringar måste därför matas in
manuellt, produkt för produkt.

Den här planen bygger en import som tar emot exakt samma kolumnuppsättning som
exporten, visar en förhandsgranskning och skriver in ändringarna först när du
godkänner dem.

Filformat som stöds: **.csv** och **.xlsx** (samma parser läser båda). XML tas inte
med — säg till om du behöver det, då lägger jag till en XML-läsare med samma
kolumnnamn som taggar.

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

## Kolumnspecifikation (kopiera in i prompten)

Filen ska ha en rubrikrad med exakt dessa kolumnnamn (ordningen är fri, extra
kolumner ignoreras):

| Kolumn | Krav | Format / tillåtna värden |
| --- | --- | --- |
| `sku` | Obligatorisk, unik | Text. Systemnyckel — ändras ALDRIG för befintlig produkt. Nya: `<PREFIX>-###`, t.ex. `FS-045`. Varianter: `<parent-sku>-<VARIANTKOD>`, t.ex. `FS-045-FIL` |
| `name` | Obligatorisk | Text, svenskt produktnamn |
| `category` | Obligatorisk | Måste matcha en befintlig kategori exakt (annars varning om ny kategori) |
| `unit` | Obligatorisk | `kg`, `st`, `låda`, `förp` |
| `cost_price` | Obligatorisk | Tal, punkt eller komma som decimaltecken, max 2 decimaler, inga valutatecken, tomt = 0 |
| `wholesale_price` | Obligatorisk | Som ovan |
| `retail_suggested` | Frivillig | Som ovan |
| `origin` | Frivillig | Land/område, text |
| `producer` | Frivillig | Text |
| `supplier` | Frivillig | Leverantörsnamn som finns i systemet, annars lämnas tomt |
| `barcode` | Frivillig, unik | Endast siffror (EAN-8/13), tomt tillåtet |
| `hs_code` | Frivillig | Text/siffror |
| `weight_per_piece` | Frivillig | Tal i kg, används när `unit` = `st` |
| `shelf_life_days` | Frivillig | Heltal dagar, tomt = okänt |
| `parent_sku` | Frivillig | `sku` för huvudprodukten. Tomt = huvudprodukt. Får inte peka på sig själv eller på en variant |
| `active` | Frivillig | `TRUE` / `FALSE`, tomt = `TRUE` |
| `stock` | Ignoreras | Lagersaldo importeras aldrig |

## Importregler

- `sku` är nyckeln. Rad med befintlig `sku` uppdateras, ny `sku` skapas.
- Produkter som saknas i filen rörs inte (ingen radering).
- `active = FALSE` inaktiverar en produkt i stället för att ta bort den.
- `parent_sku` kopplar varianten till sin förälder; hierarkin är max två nivåer.
- Endast en variantnivå: en produkt med `parent_sku` får inte själv vara förälder.
- Tomma prisceller tolkas som 0, tomt `shelf_life_days` som okänt.
- Dubbletter av `sku` eller `barcode` i filen blockerar båda raderna.
- Import loggas i aktivitetsloggen med användare, tidpunkt och antal rader.

## Teknisk beskrivning

- Nytt beroende: `xlsx` (läser både .xlsx och .csv).
- Ny komponent `src/components/products/ProductImportDialog.tsx`:
  filval, parsning, validering, diff-tabell, bekräftelse.
- Ny modul `src/lib/productImport.ts`: kolumnmappning, normalisering av tal och
  booleaner, validering, uppslag av `parent_sku` -> `parent_product_id` och
  `supplier` -> `supplier_id`, diff-beräkning mot nuvarande produkter.
- Skrivning sker i batchar via `upsert` på `products` med `sku` som konfliktnyckel,
  i två steg: först huvudprodukter, sedan varianter (så att `parent_product_id`
  kan sättas).
- Exportknappen flyttas in i samma UI så att export/import ligger tillsammans, med
  identisk kolumnordning i båda riktningarna.
- Inga schemaändringar behövs.

## Utanför planen

- Ingen automatisk SKU-generering eller omdöpning av befintliga `NEW-...`/`-SUB-...`.
- Ingen import av lagersaldon per lagerplats.
