# Göm flikar i butiksportalens sidebar

Gör det möjligt att per butik gömma menyflikar (t.ex. Mötesprotokoll) utan att ta bort funktionen — den kan alltid slås på igen senare.

## Så fungerar det för användaren

- I butiksportalens sidebar läggs en knapp "Anpassa meny" längst ned (vid Inställningar).
- Knappen öppnar en dialog som listar alla flikar grupperade per sektion, var och en med en på/av-brytare.
- Att stänga av en flik gömmer den direkt i sidebaren för den butiken. Inget tas bort — brytaren kan slås på igen när som helst.
- Om alla flikar i en sektion är gömda försvinner även sektionsrubriken.
- "Översikt", "Inställningar" och "Anpassa meny" kan inte gömmas, så man aldrig låser ut sig.
- Inställningen gäller per butik och delas av alla som jobbar i den butiken (samma meny för hela butiken).
- Om användaren navigerar direkt till en gömd sida fungerar sidan fortfarande — bara menylänken är borta.

## Teknisk plan

**Databas**
- Ny tabell `public.store_sidebar_prefs`: `id`, `store_id` (FK `stores`, on delete cascade), `nav_url` (text), `hidden` (boolean, default true), `updated_at`, unik på (`store_id`, `nav_url`).
- GRANT SELECT/INSERT/UPDATE/DELETE till `authenticated`, GRANT ALL till `service_role`, ingen `anon`-åtkomst.
- RLS på: policys som tillåter inloggade användare att läsa och skriva rader (samma nivå som befintliga butiksinställningar).

**Kod**
- Ny hook `src/hooks/useStoreSidebarPrefs.ts`: hämtar gömda `nav_url` för aktiv butik (`useSite().activeStoreId`), plus mutation för att sätta/ta bort dolt läge med invalidering av query-nyckeln.
- `src/components/ShopSidebar.tsx`: filtrera `sections`-items mot listan av gömda URL:er, hoppa över tomma sektioner, samt lägg till knappen "Anpassa meny" i `SidebarFooter`.
- Ny komponent `src/components/SidebarVisibilityDialog.tsx`: dialog med sektionslista och `Switch` per flik, låsta flikar visas inaktiverade.
- Ingen ändring av routing eller sidlogik.
