# Eget språk per person (Tigrinja först)

## Nuläge
- Appen är skriven på svenska. Det finns en liten ordlista (svenska, engelska, arabiska), men den används bara i en vy (produktionsbeställning).
- Det finns inget språkval kopplat till en person eller inloggning.

## Förslag
Att översätta hela appen på en gång är mycket stort och riskabelt. Vi gör det i steg och börjar med det personalen faktiskt använder.

1. **Språkval på personen**
   - Nytt fält "Språk" på personalkortet: Svenska (standard), Tigrinja, Engelska, Arabiska.
   - Admin sätter Tigrinja på Maebel Hassen och Mensur Omerovic.
   - När de loggar in byts språket automatiskt, på vilken enhet som helst. Andra som loggar in på samma enhet får sitt eget språk.
   - Personen kan själv byta språk under profilen.

2. **Översätt personalens vyer (steg 1)**
   - Menyn och sidhuvudet
   - Min tid (timmar, löneperiod, stämplingar)
   - Mobilstämpling (stämpla in/ut, rast, felmeddelanden)
   - Mitt schema och frånvaroansökan
   - Inloggning och byt lösenord
   - Vanliga knappar och meddelanden (Spara, Avbryt, Klart, fel)

3. **Senare steg (inte nu)**
   - Butikens dagliga vyer: checklistor, dagsrapport, beställning, städning
   - Övriga sidor efter behov

## Viktigt
- Tigrinjatexterna skrivs av mig med AI-hjälp. De bör läsas igenom av någon som kan tigrinja, t.ex. Maebel eller Mensur själva, innan vi litar helt på dem.
- Siffror, datum och belopp visas som idag. Produktnamn, butiksnamn och personnamn översätts inte.
- Stämpelklockan på surfplattan visar det valda språket för den som stämplar, efter att personen valts.
- Inget i lön, stämplingar eller lager ändras.

## Teknik
- Ny kolumn `staff.preferred_lang` (text, standard `sv`), RLS: personen själv och admin får ändra.
- Utöka `src/lib/i18n.ts` med `ti` och en React-kontext som läser inloggad persons språk via `StaffAuthContext`; faller tillbaka till svenska när en nyckel saknas.
- Sätt `dir="rtl"` bara för arabiska; tigrinja är vänster-till-höger (Ge'ez-skrift, systemtypsnitt med Noto Sans Ethiopic som reserv).
- Ersätt hårdkodade texter i de listade vyerna med `t()`-nycklar; inga ändrade flöden.
- Test: språkval per person ger rätt språk, saknad nyckel ger svenska.
