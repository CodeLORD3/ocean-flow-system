# Visa systemets version: "Wanderson do Carmo 1"

Idag står det bara "API: v2.4" nere i kanten, och det säger inget om när systemet senast uppdaterades. Nu får varje utgåva ett namn med löpnummer — "Wanderson do Carmo 1", nästa "Wanderson do Carmo 2" och så vidare — plus datum och klockslag för när versionen byggdes.

## Så visas det

- **Datorn:** nere i kanten där "API: v2.4" står idag, ersatt av "Wanderson do Carmo 1 · 19 sep 10:22".
- **Telefonen:** längst ner i menyn som öppnas med **Mer**, samma text, så personalen kan läsa upp den vid problem.
- Datum och tid visas i svensk tid och är byggtiden, alltså när den publicerade versionen skapades.

## Så räknas numret upp

Löpnumret ligger på ett ställe i koden och höjs ett steg varje gång en ny version publiceras — det ingår i varje framtida ändring jag gör. Numret börjar på 1.

## Teknisk lösning

- Ny fil `src/lib/appVersion.ts`: `export const VERSION_NAME = "Wanderson do Carmo"; export const VERSION_NUMBER = 1;` samt `BUILD_TIME` från en Vite-define, och en hjälpare `versionLabel()` som formaterar `"Wanderson do Carmo 1 · 19 sep 10:22"` med `toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" })`.
- `vite.config.ts`: `define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) }` och typdeklaration i `src/vite-env.d.ts`.
- `src/components/AppLayout.tsx:369`: byt `<span>API: v2.4</span>` mot `<span>{versionLabel()}</span>` (behåll "Databas: Ansluten").
- Sidomenyns fot i `src/components/ShopSidebar.tsx` (SidebarFooter, rad 233–250), `src/components/AppSidebar.tsx` (312–325) och `src/components/ProductionSidebar.tsx` (173–192): en rad med `versionLabel()` i `text-[10px] text-muted-foreground`, så den syns när "Mer" öppnas på telefonen.
- Inga nya beroenden; typecheck efter ändringen.
