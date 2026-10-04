# Fliken Historik på Beställningar

## Vad som byggs
1. **Två flikar**: "Ordrar" och "Historik", högst upp i orderlistan på Beställningar.
   - **Ordrar** visar bara aktuella beställningar (Öppen, Ny, Pågående, Packad, Skickad), alltså samma som i dag.
   - **Historik** visar alla beställningar butiken har skickat oavsett status (även Levererad, Arkiverad och Avbruten), med den senaste först.
2. **Samma kolumner och samma kort på mobil** som i Ordrar: vecka, datum, butik, önskad leverans, rader, produkter, anteckning, följesedel och status.
3. **Filter i Historik**:
   - Datum från–till (gäller beställningsdatum)
   - Vecka (leveransvecka, samma veckonummer som visas i listan)
   - Status (en eller flera)
   - Sökfält för produktnamn och anteckning
   - Knappen "Rensa filter" och en räknare med antal träffar
4. **Klicka på en order** för att fälla ut alla rader, precis som i Ordrar. Följesedeln går att öppna där den finns. I Historik går ordrarna bara att läsa: inga knappar för att ändra, radera eller skicka.
5. **Butiksvalet i toppen gäller**: historiken visar bara vald butik. Om en administratör väljer "Alla butiker" visas alla butikers ordrar och butiksnamnet syns i varje rad.

## Det här ändras inte
- Ingen data raderas eller ändras. Historiken läser bara de ordrar som redan finns.
- Formuläret för ny beställning och fliken Ordrar fungerar som i dag.

## Tekniskt
- Bara `src/pages/ShopOrders.tsx` ändras (eventuellt också en ny läskomponent `src/components/orders/ShopOrderHistory.tsx`).
- `OrderTable` får en `readOnly`-flagga som döljer redigering, radering och kopiering men behåller utfällning och följesedel.
- Historiken använder samma hämtning som i dag (`shop_orders` med rader, utom statusen Öppen som är butikens utkast och visas i Ordrar). Hämtningen filtreras på `activeStoreId`, eller på alla butiker när en administratör inte har valt någon butik. Sortering: `created_at desc`.
- Filtren körs i webbläsaren. Veckan räknas med `orderWeekOrdinal` från `src/lib/orderWeek.ts`.
- Ingen ändring i databasen, behörigheter eller funktionerna på servern.
