# Bilden på räkor syns inte i produkten

## Vad jag hittade

Databasen har just nu exakt en egentagen orderbild (uppladdad 19:29 i dag). Den är sparad som orderradsbild (`shop_order_line`) — men det finns **noll** bilder sparade med typen `product`. Orderraden har rätt produkt kopplad, så kopplingen till produkten skapades aldrig när bilden laddades upp (bilden lades sannolikt in innan den automatiska kopplingen fanns i den byggda versionen).

Produktgalleriet visar bara bilder som är sparade direkt på produkten, därför blir det tomt.

## Vad jag gör

1. **Bakåtfyllnad (engångs):** koppla alla befintliga orderbilder som har en produkt på sin orderrad till motsvarande produkt, så räkbilden dyker upp direkt.
2. **Gör galleriet robust:** produktgalleriet hämtar bilder både från produkten och från orderrader som pekar på samma produkt, så en bild aldrig "försvinner" om kopplingen missas. Dubbletter (samma bildadress) visas bara en gång.
3. **Tydligare fel:** om den automatiska kopplingen vid uppladdning misslyckas visas ett felmeddelande istället för att tystna, så vi ser det direkt nästa gång.
4. **Lättare att hitta:** i produktlistan visas en liten kameraikon med antal egentagna bilder, och galleriet ligger kvar i produktkortet/redigeringen samt i lagret.

## Teknisk detalj

- Migration: `INSERT` i `entity_images` med `entity_type = 'product'` för varje befintlig `shop_order_line`-bild via `shop_order_lines.product_id`, med skydd mot dubbletter på (produkt, url).
- `src/hooks/useEntityImages.ts`: ny hook `useProductPhotos(productId)` som slår ihop `entity_type = 'product'` med orderradsbilder för produktens orderrader (två frågor, dedupliceras på `url`).
- `src/components/products/ProductPhotos.tsx`: använd nya hooken; borttagning tar bort produktkopplingen (och orderradsbilden om den bara finns där).
- `src/components/orders/OrderPhotos.tsx`: fånga och visa fel från produktkopplingen.
