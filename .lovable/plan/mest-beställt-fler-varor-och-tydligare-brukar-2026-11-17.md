# Mest beställt: fler varor och tydligare "brukar"

## Ändringar
1. **Fler varor i Mest beställt**
   - Listan visar upp till 100 varor i stället för 30.
   - Listan är sorterad efter hur ofta företaget beställt varan de senaste 8 veckorna.
   - Man skrollar hela vägen ner, och längst ner står "Hittar du inte varan? Sök eller välj kategori".
2. **Tydligare "brukar"-text**
   - "brukar: 6 kg" ersätts med "Vanlig beställning: 6 kg".
   - Om varan har beställts flera gånger står det även hur många gånger, till exempel "beställd 12 ggr".
   - Siffran gäller hela företaget, eftersom ni valde det tidigare.
3. **Skrollningen kontrolleras ordentligt**
   - Hela sidan ska gå att skrolla ända ner till sista varan, även när kundvagnsraden ligger längst ner.
   - Sista raden får inte gömmas bakom kundvagnsraden.

## Att kontrollera
Jag kontrollerar att det fungerar med flera genomgångar:
- att listan för Mest beställt ger fler än 30 varor för butikens bolag
- att det byggs utan fel
- att jag i telefonbredden 393 px kan skrolla till sista kortet
- att det inte finns någon skroll i sidled
- att alla tryckytor är minst 44 px
- att inga priser visas

En hjälpagent granskar den färdiga vyn. Om jag inte kan logga in som en butik använder jag en testsida med samma vy och riktiga varor. Inget skickas.

## Tekniska detaljer
- Databasfunktionen `company_top_ordered_products` ändras så att `LIMIT 40` blir `LIMIT 100`. Den skrivs om med `CREATE OR REPLACE`, samma signatur och samma behörighetskontroll.
- I `StoreShopView.tsx`:
  - `.slice(0, 30)` tas bort.
  - Typen för `order_count` sparas i en map, och texten ändras.
  - Skrollytan får padding i botten (`pb-6`).
