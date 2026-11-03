# Skyddsnät för mailkorgen: inget mejl försvinner tyst

## Varför det inte går att lova 100 %
- Leverantörer skickar mejl i format vi inte sett än (konstiga PDF:er, skannade bilder, lösenordsskyddade filer, trasiga bilagor).
- Mejlservern hos Loopia kan vara nere eller långsam en stund.
- Funktionen har en fast gräns för datorkraft och tid per körning; ett extremt stort mejl (t.ex. 20–30 MB) kan fortfarande gå över den.
- AI-tolkningen kan läsa fel på en otydlig följesedel.

Det jag kan lova i stället: **inget mejl försvinner tyst**. Antingen läses det in, eller så syns det tydligt att det behöver hanteras för hand.

## Vad jag bygger
1. **Lista "Behöver åtgärd"** i mailkorgen: varje mejl som inte kunde läsas in visas med avsändare, ämne, datum, storlek och orsak i klartext (för stor, okänt format, tolkningen misslyckades, servern svarade inte).
2. **Automatiska omförsök**: misslyckade mejl försöks igen vid nästa körningar, upp till tre gånger, innan de hamnar i listan.
3. **Knapp "Ladda upp manuellt"** direkt på raden, så att bilagan kan läggas in för hand och kopplas till samma mejl.
4. **Daglig varning** till kontoret om något ligger i listan eller om hämtningen inte har gått på över en timme dagtid.

Inget bokförs, inga mejl raderas och befintliga dokument ändras inte.

## Tekniskt
- Status per mejl (`lyckad`, `forsok_igen`, `behover_atgard`) med försöksräknare och orsakskod, nycklad på meddelande-ID så att inget dubbelläses.
- Varningen dedupliceras per dag; bevakning av senaste lyckade körning.
- Tester för stor bilaga, okänt format och servertimeout.
