# Kundbeställningar: renare lista och "Visa mer"

Målet är att listan på Kundbeställningar känns lika ren som Shopify: varje rad visar omfattning och om det finns en kommentar, och när man öppnar en order ser man först vad som är beställt — resten ligger bakom "Visa mer".

## 1. Raden i listan

- Kolumnen "Antal" byter till **Artiklar** och visar `3 artiklar` (`1 artikel` i singular) i stället för `3 st`. Samma på mobilraden.
- Ny liten **kommentarsnotis** i raden vid kundnamnet: en pratbubbleikon när ordern har en kommentar (orderns egen not, eller not på någon orderrad). Ikonen har tooltip med kommentarens början, så personalen ser direkt att det finns något att läsa.
- Allergivarning, Webb/Tel-märkning och statusetikett behålls som idag.
- Tätare typografi: radhöjden och textstorlekarna kortas ett steg (rad ca 13 → 12 px, statusetikett och märkningar något mindre), så fler ordrar syns per skärm utan att det blir svårläst. Kolumnrubriken följer samma storlek.

## 2. Utfälld order — innehåll först, "Visa mer" sen

När man klickar upp en order visas i denna ordning:

1. **Beställda varor** direkt högst upp (produkt, mängd, enhet, packstatus) — samma packningsvy som idag, men flyttad överst.
2. **Kommentar** från kunden/ordern direkt under varorna, tydligt markerad (i stället för längst ned som idag).
3. **Uppskattat/verkligt pris**.
4. En länk **"Visa mer"** som fäller ut resten: statusbadgar, ordernummer, förbokningsmärkning, webbetalning, telefonnummer, adress, gästantal, allergisektion, datum-/tidsredigering samt knappraden (Redigera order, Skriv ut, PDF, Uteblev, Arkivera). Länken byter till "Visa mindre" när den är öppen.
5. Allergivarning visas alltid överst i den utfällda vyn även när "Visa mer" är stängd, eftersom den är säkerhetskritisk.

"Visa mer"-läget kommer ihåg sig per order så länge man är kvar på sidan.

## Teknisk omfattning

- `src/components/orders/CustomerOrderRow.tsx`: artikeltext, kommentarsikon, tätare klasser, ny ordning i den utfällda delen samt lokalt `showMore`-state.
- `src/components/orders/CustomerOrderRow.tsx` (`CustomerOrderRowHeader`): rubriken "Antal" → "Artiklar" och samma textstorlek.
- Endast presentation — ingen ändring i datamodell, hooks eller behörigheter.
