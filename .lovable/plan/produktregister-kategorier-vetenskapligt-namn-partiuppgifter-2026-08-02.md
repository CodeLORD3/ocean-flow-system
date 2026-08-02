# Produktregister: kategorier, vetenskapligt namn, partiuppgifter, bildbank

## Nuläge (verifierat)
- Kategoritabellen innehåller 9 namn: Delikatesser, Färsk Fisk, Frukt & Grönt, Frys, Rökta Produkter, Såser & Röror, Sillar, Skaldjur, Varmkök. Saknas: Löjrom & Kaviar, Emballage & Förbrukning, Råvaror & Storhushåll.
- Produkter använder dessutom de gamla värdena Fisk, Is, kolonial, Emballage (finns kvar på befintliga rader). "Svenska Produkter" finns inte i datat.
- `products` har inget `latin_name`. `image_url` finns redan och importen stöder den.
- Inleveransraderna (`incoming_delivery_lines`) har batch_number/best_before men inga redskaps-, upptinad- eller fångstområdesfält.
- Autogenererat SKU byggs idag som två första bokstäverna i kategorinamnet + tidsstämpel (Produkter-sidan och Produktbank), dvs inget explicit prefixregister finns.
- Det finns ingen separat "skyltunderlag"-modul; etiketter/skyltar skrivs ut från Produkter-sidan och Streckkoder-sidan.

## 1. Kategorier och SKU-prefix
- Lägg till de tre saknade kategorierna så listan blir exakt de 12 angivna.
- Nya produkter kan bara välja bland de 12; de gamla värdena (Fisk, Is, kolonial, Emballage, Svenska Produkter) visas bara som läsvärde på rader som redan har dem, och listas som "utgången kategori" i formuläret utan att kunna väljas för nya produkter.
- Inför ett prefixregister för autogenererat SKU: FS Färsk Fisk, SK Skaldjur, SI Sillar, RÖ Rökta Produkter, SÅ/KK enligt befintlig användning (befintliga FS, SK, RÖ, VK, SI, KK, DE oförändrade) plus nya LK Löjrom & Kaviar, FG Frukt & Grönt, FR Frys, EM Emballage & Förbrukning, RÅ Råvaror & Storhushåll. Prefixet slås upp i registret istället för att klippas ur kategorinamnet. Befintliga SKU:er ändras aldrig.

## 2. Nytt fält: latin_name
- Ny nullable textkolumn `latin_name` på `products`.
- Produktformuläret får fältet "Vetenskapligt namn" med hjälptexten om EU 1379/2013 och exemplet Gadus morhua.
- Fältet läggs till som frivillig kolumn i export och i importens kolumnlista (med svenska alias). Tom cell = värdet lämnas orört, precis som övriga frivilliga fält.
- Etikett-/skyltutskrifter visar "<name> (<latin_name>)" när latinskt namn finns, annars bara namnet.

## 3. Partiuppgifter vid inleverans
Tre nya kolumner på inleveransraden (inte på produkten):
- `redskapskategori` (nullable text, väljare med exakt: Not/vad, Trål, Garn, Ringnot, Krok och lina, Skrapredskap, Bur och fälla) — visas endast för vildfångade produkter.
- `upptinad` (boolean, default false).
- `faktiskt_fangstomrade` (nullable text) som förifylls från produktens `origin` men kan skrivas över per parti.
Inleveransdialogen får dessa tre fält per rad. Etikett-/skyltunderlag läser värdena från senaste partiet för produkten, med produktens `origin` som fallback.

## 4. Origin
Ingen schemaändring och ingen ny validering. Fritext behålls, så värden som "Fångad i Skagerrak" eller "Odlad i Norge" accepteras oförändrat.

## 5. Produktbilder
- Skapa publik storage-bucket `produktbilder`.
- Ny adminvy under Produkter: bulk-uppladdning av bildfiler där filnamnet utan ändelse tolkas som SKU och matchas mot produkten, som får `image_url` uppdaterad. Filer utan matchande SKU listas som ohanterade.
- Bilden visas i produktlistan och på produktkortet (befintlig thumbnail-komponent återanvänds).
- Vyn ligger bakom inloggning; inga publika vyer eller API:er utanför inloggat läge exponerar bilderna. Den publika bas-URL:en till bucketen redovisas när den är skapad.

## 6. Import
Ingen förändring av importlogiken: befintlig sku uppdateras, ny skapas, saknade rader rörs inte, active=FALSE inaktiverar, stock ignoreras, kategorivarningar blockerar inte. Verifieras att `latin_name` och `image_url` tas emot och att alla 12 kategorinamn matchar, inklusive Å i "Råvaror & Storhushåll" (rubriknormaliseringen mappar å/ä/ö men kategorijämförelsen sker på fulla namnet).

## Teknisk sammanfattning
- Migration: `products.latin_name text`, tre kolumner på `incoming_delivery_lines`, tre nya rader i `categories`.
- Storage: bucket `produktbilder` (publik) via storage-verktyget, RLS-policy för uppladdning från inloggad personal.
- Kod: `src/lib/productCategories.ts` (ny: kanoniska kategorier + prefixkarta + utgångna kategorier), `src/pages/Products.tsx`, `src/components/wholesale/ProductBankTab.tsx`, `src/lib/productImport.ts`, ny `src/components/products/ProductImageBulkUpload.tsx`, `src/hooks/useIncomingDeliveries.ts` och inleveransdialogen i `src/pages/Wholesale.tsx`, etikettutskrift i `src/pages/Products.tsx` och `src/pages/Barcodes.tsx`.
