# Leverantörsmatchning vid produktimport

## Problem
Importfilen skriver "Göteborgs Fiskauktion", men i registret heter leverantören "GFA (Göteborgs Fiskauktion)". Exakt namnmatchning missar, så raden varnas som "okänd leverantör … (lämnas tom)" och produkten får ingen leverantör.

## Lösning
1. **Smartare matchning** — jämför normaliserat (gemener, trimmat, Å/Ä/Ö-säkert) och matcha även:
   - namn inom parentes ("GFA (Göteborgs Fiskauktion)" → "Göteborgs Fiskauktion")
   - namnet före parentesen ("GFA")
   - namn utan parentesinnehåll alls
   Så kopplas "Göteborgs Fiskauktion" till befintlig GFA-leverantör utan varning.
2. **Nya leverantörer skapas automatiskt** — om ett namn i filen inte matchar någon befintlig leverantör skapas den vid bekräftad import och kopplas till produkten. Förhandsvisningen visar då informationstexten "ny leverantör skapas: <namn>" i stället för "lämnas tom".
3. Filens fältvärde vinner aldrig över en tom cell: tom leverantörscell lämnar befintlig koppling orörd (oförändrat beteende).

## Teknisk detalj
- `src/lib/productImport.ts`: bygg leverantörsindex med alias-nycklar (parentesvarianter) i `buildDiff`; ersätt varningen med "ny leverantör skapas" och exponera namnet på diff-raden så importsteget kan skapa den.
- `src/components/products/ProductImportDialog.tsx`: före upsert av produkter, `insert` av unika nya leverantörsnamn i `suppliers`, mappa tillbaka id och sätt `supplier_id` på berörda rader.
