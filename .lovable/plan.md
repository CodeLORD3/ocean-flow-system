# Bildflödet: senaste bilder syns inte

## Vad som faktiskt händer

Sorteringen i flödet är korrekt (nyast först). Problemet är innehållet:

- Flödet visar bara bilder markerade som **utvalda** (stjärna).
- Senaste stjärnmärkningen i databasen är från **13 augusti**. 14–18 augusti har 134 uppladdade bilder men noll utvalda.
- Dessutom: när en butik sätter nya utvalda bilder nollas **alla** tidigare utvalda för den enheten, även gamla dagar. Historiken i flödet raderas alltså varje gång någon uppdaterar dagens urval.

Vi behåller principen "bara utvalda syns i flödet", men gör markeringen tydlig och slutar radera historiken.

## Vad som byggs

1. **Sluta radera historik**
   Urvalet nollas bara för bilder från samma dag som de nya utvalda — äldre dagars utvalda bilder ligger kvar i flödet.

2. **Automatiskt urval om ingen väljer själv**
   Har en dag uppladdade bilder men noll utvalda, markeras automatiskt 4 av dagens bilder (de 4 senast uppladdade) som utvalda. Butiken/enheten och admin kan alltid ändra urvalet efteråt — av- och markera valfria bilder som vanligt. Väljer personalen aktivt bort alla respekteras det (autourvalet körs inte igen samma dag). Målet: varje dag med uppladdade bilder har alltid några bilder i Bildflödet.

3. **Tydlig uppmaning i "Bilder från butiken"**


3. **Tydligare stjärna**
   Stjärnknappen på varje bild får starkare kontrast och en kort text/tooltip "Visa i Bildflödet" så personalen förstår vad den gör, plus en räknare "X utvalda idag".

4. **Bildflödet visar när något saknas**
   Överst i flödet: en liten rad som visar senaste datum med utvalda bilder och, för de enheter användaren har behörighet till, en påminnelse om att stjärnmärka dagens bilder om det saknas.

5. **Datumrubriker**
   Behåll gruppering per dag med nyaste dagen först (redan korrekt) och lägg till "Idag"/"Igår"-etiketter för de två senaste dagarna.

## Tekniskt

- `useSetFeaturedImages` i `src/hooks/useEntityImages.ts`: begränsa nollställningen till bilder vars `created_at` ligger inom valt datum (svensk tid) istället för hela enheten.
- `src/components/images/EntityImageGallery.tsx`: uppmaningsrad, räknare, förstärkt stjärnknapp med tooltip.
- `src/pages/ImageFeed.tsx`: statusrad med senaste utvalda datum + "Idag"/"Igår"-etiketter i dagsrubrikerna.
- Ingen migration behövs.
