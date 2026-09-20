# Auktionsinköp: begränsad åtkomst + rätt uppdateringstid

## 1. Bara grossist och inköp ser auktionsinköpen

Idag kan vem som helst som är inloggad läsa, lägga in och ändra auktionsinköpen — säkerhetsgranskningen flaggar det. Det stramas åt så att bara personer med grossist-/inköpsbehörighet eller administration kommer åt dem.

- Läsa, lägga in, ändra och makulera auktionsinköp kräver grossist-/inköpsbehörighet eller administration.
- Butikspersonal får inget svar alls på auktionsinköpen — listan är tom för dem, och sidan "Auktionsinköp" ligger redan utanför butikens meny.
- Ingen befintlig rad ändras eller tas bort; bara vilka som får se dem.

## 2. Klockslaget i versionsraden

Raden visar "uppdaterad 20 sep. 20:19" trots att uppdateringen gjordes senare. Tiden kommer just nu från när förhandsvisningen startades, inte från när versionen faktiskt publicerades.

- Tiden sätts i stället uttryckligen i samma steg som versionsnumret höjs, alltså vid varje publicering.
- Då visar raden alltid den tidpunkt då den publicerade versionen skapades, både i förhandsvisningen och i den skarpa appen.
- Efter ändringen står det "Wanderson do Carmo 3 · uppdaterad 20 sep. 20:56" (tiden för den publicering som körs).

## Tekniskt

- Ny hjälpfunktion i databasen, `is_auction_user()` (security definer): sant för `is_platform_admin(auth.uid())`, `has_role(auth.uid(),'admin')` eller portalbehörighet `production`/`wholesale` i `user_scopes`.
- Ersätt de tre nuvarande `true`-policyerna på `auction_purchases` (SELECT/INSERT/UPDATE) med policyer som använder `is_auction_user()`, plus DELETE lämnas utan policy (makulering sker som motrörelse, aldrig radering). Grants behålls för `authenticated`/`service_role`.
- `lots`-raderna är redan skyddade av befintliga policyer och rörs inte.
- `src/lib/appVersion.ts`: byt ut `__BUILD_TIME__` mot en konstant `VERSION_UPDATED_AT` (ISO-tid i Europe/Stockholm-kontext) som höjs tillsammans med `VERSION_NUMBER`; `versionLabel()` formaterar den. `vite.config.ts`-definitionen kan ligga kvar oanvänd eller tas bort.
- Efter ändringen: körs säkerhetsgranskningen om för att bekräfta att fyndet `auction_purchases_permissive_true` är åtgärdat, och en kontroll att grossistkontot fortfarande kan skapa och se inköp.
