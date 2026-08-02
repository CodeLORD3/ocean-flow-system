# Produktbilder i inleverans, produktlista och import

Idag har `products` ingen bildkolumn (verifierat i schemat), och varken Produkter-sidan eller Inleverans visar bilder. Bildhanteringen som finns (`entity_images` + bucket `logos`) används bara för butiker och lagerplatser.

## Vad som byggs

1. **Bildfält på produkt**
   - Ny kolumn `image_url` (text, nullable) på `products`.
   - Bilder lagras i befintlig publik bucket `logos` under `product-images/<sku>/...` när man laddar upp manuellt.

2. **Bildstorlek (enligt referensbilden)**
   - Liggande thumbnail i 4:3-format, ca 80x56 px (`w-20 h-14`), `object-cover`, lätt rundade hörn och tunn ram.
   - Placeras direkt till vänster om produktnamnet, vertikalt centrerad; radhöjden ökas så bilden får plats utan att texten trängs.
   - Saknas bild visas en neutral platshållarruta i samma storlek (fiskikon på dämpad bakgrund) så kolumnbredden alltid är lika.

3. **Produkter-sidan (`src/pages/Products.tsx`)**
   - Thumbnail längst till vänster i den pinnade Produkt-kolumnen, både för huvudprodukter och varianter.
   - Klick på thumbnail öppnar bilden i större vy (lightbox).
   - I produktredigeringen: fält för bild-URL + uppladdningsknapp som lägger filen i `logos` och sparar URL:en.

4. **Produktinleverans (`src/pages/Receiving.tsx`)**
   - Samma thumbnail till vänster om produktnamnet på varje inleveransrad (både i listan och i mottagningsdetaljen), så man snabbt känner igen varan fysiskt.

5. **Import/export + regler**
   - `image_url` läggs till i `IMPORT_COLUMNS` i `src/lib/productImport.ts` med svenska alias (`bild`, `bild_url`, `bildlank`).
   - Kolumnen ingår i diff-motorn (visas som ändring) och i exportfilen.
   - Regeltexten i `src/components/products/ProductImportDialog.tsx` uppdateras med `image_url` och krav på formatet.

## Prompt att skicka till Claude (visas i importdialogen och här)

```text
Kolumnen image_url anger produktbild.
- Måste vara en fullständig, publikt nåbar https-URL till en bildfil (.jpg, .jpeg, .png eller .webp).
- Inga Google Drive-, Dropbox- eller delningslänkar, inga base64-strängar, inga lokala filnamn.
- Tomt fält = ingen bild; befintlig bild i systemet påverkas inte av tomt fält.
- Bilden ska visa produkten på neutral bakgrund, kvadratiskt format (minst 600x600 px) rekommenderas.
- Varianter ärver INTE förälderns bild automatiskt — sätt image_url per rad om varianten ska ha egen bild.
- sku är alltid nyckeln; ändra aldrig sku för att byta bild.
```

## Teknisk detalj

- Migration: `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url text;` (inga nya tabeller, befintliga RLS-policys och grants gäller).
- Delad liten komponent `src/components/products/ProductThumb.tsx` används av både Produkter och Inleverans för konsekvent utseende.
- Inleveransens queries utökas med `image_url` i `products(...)`-selecten.
