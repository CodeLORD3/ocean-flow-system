# Senaste versionen vid varje inloggning

Idag letar appen efter en ny version var femte minut. Loggar någon in strax efter en publicering kan de därför få den gamla versionen kvar en stund — det är det Tim ser.

## Så här ska det fungera

- Vid varje inloggning kontrolleras om det finns en nyare version. Finns det en laddas appen om direkt innan personen kommer in, så det första de ser alltid är det senaste.
- Samma kontroll görs när appen öppnas igen från hemskärmen eller när fliken tas fram efter att ha legat i bakgrunden.
- Den regelbundna kontrollen var femte minut ligger kvar för den som står inne i appen hela dagen.
- Omladdningen sker direkt, utan fråga.

## Viktigt att veta

Telefoner och kassor som fortfarande kör en äldre installerad version saknar den här koden. De behöver en gång till: stäng appen helt, öppna igen (eller ladda om sidan). Därefter sköter enheten sig själv i fortsättningen.

Ändringen måste publiceras för att nå enheterna.

## Teknisk lösning

- Ny modul `src/lib/appUpdate.ts` som enda registreringsplats: `registerAppUpdates()` (flyttar dagens logik från `src/main.tsx`) och `checkForUpdateNow()` som anropar `registration.update()` och laddar om när en ny service worker väntar.
- `src/main.tsx` anropar bara `registerAppUpdates()`. Förhandsvisnings- och utvecklingsspärren behålls oförändrad (ingen service worker där).
- `checkForUpdateNow()` anropas
  - på `SIGNED_IN` i `src/contexts/StaffAuthContext.tsx` och i `src/portal/PortalLayout.tsx`,
  - på `visibilitychange` när fliken blir synlig igen och på `focus`, med en spärr som gör att kontrollen inte körs oftare än var 30:e sekund.
- Omladdning sker via befintlig `controllerchange`-hantering med `reloadingForUpdate`-flaggan, så sidan laddas om en gång och inte i loop.
- `vite.config.ts` lämnas som den är (`registerType: "autoUpdate"`, `injectRegister: false`, `skipWaiting`, `clientsClaim`, `cleanupOutdatedCaches`).
