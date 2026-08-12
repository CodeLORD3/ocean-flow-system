# Hållbarhet för kokta skaldjur: 9 dagar sluten, 3 dagar öppnad

## Faktakontroll mot externa källor
- Feldt's "Havskräftor i lake, kokt" (Dabas, artnr 71177 och 71285): total hållbarhet **14 dagar** vid 0–4 °C i sluten förpackning.
- Forskning på hel havskräfta (Nephrops norvegicus) i skyddande atmosfär visar tydligt förlängd hållbarhet jämfört med luftpackat.

Med säkerhetsmarginal drar vi ner **5 dagar** från leverantörernas 14 → **9 dagar** i sluten/skyddande atmosfär, och **3 dagar** efter öppnad förpackning. Dagens värde i registret är 4 dagar, vilket är för kort.

Nuvarande värden i registret (kontrollerat): kokta havskräftor, signalkräftor, krabbklor och hummer står på 4 dagar; hummerkött 3 dagar och kamtjatkakrabbaben 5 dagar (fel — de är frysvaror); frysta/kokta räkor 365 dagar.

## Vad som byggs

1. **Nytt fält "hållbarhet öppnad förpackning"** på produkter, vid sidan av befintlig hållbarhet (som nu tydligt betyder sluten förpackning).
2. **Uppdaterade värden** för kokta färska skaldjur: 9 dagar sluten, 3 dagar öppnad. Gäller kokta havskräftor (alla storlekar), kokta signalkräftor, kokta krabbklor och kokt hummer.
   **Frysvaror sätts till 365 dagar sluten**: Hummerkött kokt (FS-010-KOT) och Kamtjatkakrabbaben kokta (SK-024-BEN-K), i linje med övriga frysta kokta räkor. Öppnad/tinad förpackning sätts till 3 dagar.
3. **Produktvyn**: båda fälten redigerbara, hållbarhetsbadgen visar "9 d sluten / 3 d öppnad".
4. **Kokningsflödet** i Filé/Tillverkning räknar bäst-före på det nya partiet från den slutna hållbarheten (blir 9 dagar i stället för 4).
5. **Etiketter och kundorder**: bäst-före baseras fortsatt på sluten hållbarhet, med texten "Efter öppnad förpackning: 3 dagar" på etiketten och i produktkortet.

## Teknik
- Migration: `ALTER TABLE public.products ADD COLUMN shelf_life_open_days integer`.
- Datauppdatering: kokta färska skaldjur → `shelf_life_days = 9`, `shelf_life_open_days = 3`; FS-010-KOT och SK-024-BEN-K → `shelf_life_days = 365`, `shelf_life_open_days = 3`.
- Frontend: `src/pages/Products.tsx` (formulär + `ShelfLifeBadge`), `src/components/production/CookingOrderForm.tsx` (bäst-före-beräkning), etikett-PDF och `CustomerOrderWizard`/`shelfLifeWarning` läser samma fält.
- Inleverans (`src/pages/Receiving.tsx`) fortsätter använda sluten hållbarhet vid autoifyllning av utgångsdatum.
