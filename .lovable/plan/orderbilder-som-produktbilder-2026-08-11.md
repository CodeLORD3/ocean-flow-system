# Orderbilder som produktbilder

## Vad jag hittade

Databasen har just nu exakt en egentagen orderbild (uppladdad idag 19:29). Den ligger som orderradsbild (`entity_type = 'shop_order_line'`) — och det finns **noll** bilder med `entity_type = 'product'`. Orderraden har rätt produkt kopplad, men produktkopplingen skapades aldrig (bilden lades in innan den automatiska kopplingen fanns i den byggda versionen). Produktgalleriet läser bara `entity_type = 'product'`, därför är det tomt.

## Vad jag bygger

1. **"Gör till produktbild"** på varje egentagen orderbild i orderns bilddialog (visas bara när orderraden har en kopplad produkt). Vid klick kopieras bilden till produkten — samma bildadress, ny rad kopplad till produkten. Orderradsbilden ligger kvar. Dubbletter på (produkt, bildadress) skapas inte; är bilden redan produktbild visas knappen som redan gjord.
2. **Tydlig återkoppling:** toast "Bilden är nu tillagd som produktbild", och ett synligt felmeddelande om det misslyckas — inga tysta fel.
3. **Produktgalleriet visar allt:** bilder direkt på produkten *och* orderradsbilder som hör till produktens orderrader, deduplicerat på bildadress. Nya produktbilder syns direkt utan omladdning (cachen uppdateras).
4. **Bläddra/zooma:** lightbox med föregående/nästa och bildräknare, så man kan se produkten från flera vinklar/tillfällen innan man bekräftar en order.
5. **Ta bort produktbild:** tar bara bort produktkopplingen — originalet på orderraden påverkas inte.
6. **Antal i produktlistan:** kameraikonen räknar alla produktbilder, inklusive de som kommit in via den nya knappen.
7. **Bakåtfyllnad (engångs):** befintliga orderradsbilder som har en produkt kopplas till produkten, så räkbilden dyker upp direkt.

Manuell uppladdning av vanliga produktbilder ändras inte — detta är ett komplement.

## Teknisk detalj

- Data (engångs): kopiera rader i `entity_images` från `shop_order_line` till `entity_type = 'product'` via `shop_order_lines.product_id`, med skydd mot dubblett på (produkt, url).
- `src/hooks/useEntityImages.ts`: ny `useProductPhotos(productId)` som slår ihop `entity_type = 'product'` med orderradsbilder för produktens orderrader (två frågor, dedup på `url`, `source` markeras). `useLinkImageToProduct` invaliderar både produkt- och orderradsnycklar.
- `src/components/orders/OrderPhotos.tsx`: knapp "Gör till produktbild" per bild med felhantering och tillstånd för redan kopplad.
- `src/components/products/ProductPhotos.tsx`: använd `useProductPhotos`, lightbox med bläddring, borttagning som bara tar bort produktraden.
- Antalet i produktlistan (`src/pages/Products.tsx`) läser samma sammanslagna antal.
