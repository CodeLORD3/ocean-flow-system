# Bildflödet: tydligare dagar och större bilder

## Vad som ändras

1. **Färgad dagsrubrik**
   Varje dag får en tydlig, färgad rubrikrad i stället för dagens tunna text:
   - Idag: grön
   - Igår: blå
   - Äldre dagar: växlande färger (bärnsten, violett, tegel, teal, grå) så man direkt ser när ett dygn byts när man skrollar.
   Rubriken blir större (ungefär dubbelt så stor text), visar veckodag och datum även för Idag/Igår ("Idag · lör 19 sep"), antal bilder och antal ställen i samma rad.

2. **Fastnålad dagsrubrik**
   När man skrollar inom en dag ligger dagens färgade rubrik kvar högst upp, så man alltid vet vilken dag man tittar på.

3. **Större bilder, mer synligt**
   Bildrutorna växer: 2 per rad på telefon, 3 på surfplatta, 4 på stor skärm (i dag 2/3/4 men mindre rutor) och formatet ändras från nästan kvadratiskt till 4:3 med mer höjd. Butiksrubriken inne i dagen får också färgmarkering i samma dagsfärg, med en tydlig färgad list till vänster.

4. **Mer information per bild**
   Under varje bild syns tid, vem som lagt upp den (med profilbild) och eventuell rubrik i läsbar storlek i stället för mikrotext.

## Tekniskt

- `src/lib/dayColor.ts` återanvänds och utökas med en variant för mjuka bakgrunder (rubrikband + vänsterlist) utöver dagens badge-klasser; "Idag" grön, "Igår" blå, därefter cykeln.
- `src/lib/imageMeta.ts`: `dayLabel` får en valfri lång form som lägger till veckodag och datum efter "Idag"/"Igår".
- `src/pages/ImageFeed.tsx`: dagsrubriken byggs om till ett färgat band (`sticky top-0 z-10`), rubrikstorlek upp till `text-lg`/`text-xl`, butiksgruppernas rubrik får dagsfärgad list, och `ImageGrid` får större rutor (`aspect-[4/3]`, färre kolumner på små skärmar, större `gap`) samt läsbar metadata-rad.
- Endast presentation ändras — ingen ändring i hur bilder hämtas, sorteras eller markeras som utvalda.
