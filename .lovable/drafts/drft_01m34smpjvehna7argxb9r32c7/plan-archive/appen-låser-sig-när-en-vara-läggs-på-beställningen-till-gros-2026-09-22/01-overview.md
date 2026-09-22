# Appen låser sig när en vara läggs på beställningen till grossisten

Du lägger beställningen på sidan **Ordrar** i butiken, på telefon. När varan hamnar i listan går inget längre att trycka på, och laddar du om sidan är varan borta — den hann aldrig sparas, eftersom raderna ligger kvar i telefonen ända till du trycker "Skicka beställningen".

## Vad jag har provat

Jag testade två närliggande vägar i telefonstorlek och de fungerade: att lägga en vara från räkningen, och sidan Dagens beställning. På sidan Ordrar kom testinloggningen bort innan jag hann klicka, så **orsaken är ännu inte bekräftad**. Därför börjar arbetet med att återskapa låsningen, inte med en gissning.

Obs: i testet lade jag 1 kg Aioli på Zollikons pågående beställning. Säg till om du vill att jag tar bort den raden.

## Så gör jag

1. **Återskapa och mäta.** Kör igenom exakt din väg i telefonstorlek: Ordrar → ny beställning → sök vara → tryck på varan. Samtidigt loggar jag hur många gånger sidan ritas om, om sidan blir "låst för tryck" av en kvarliggande ruta, och om något fel kastas. Det visar om skärmen ligger still eller om telefonen jobbar ihjäl sig.
2. **Åtgärda det mätningen pekar på.** Tre kända riskpunkter i just detta steg står först i kön, se nedan.
3. **Skydda mot att arbetet försvinner.** Beställningen du håller på med sparas lokalt medan du skriver, så att en omladdning inte tömmer listan. Det gör felet ofarligt även om något annat skulle låsa sig i framtiden.
4. **Kontrollera i telefonstorlek** att man kan lägga flera varor, ändra antal, ta bort en rad och skicka beställningen utan att något låser sig.

## Vad du kommer märka

Du lägger vara efter vara på beställningen utan att appen stannar, och det du redan lagt in ligger kvar även om du laddar om eller byter sida.
