# Rätta AI-teamets agentverktyg

Sidorna Attestera och Tavlan och tabellerna är klara. Det som återstår är att de sex nya agentverktygen (lista/skapa/uppdatera uppgifter och utkast) har typfel i svarsformatet, så de kan inte användas.

## Vad som görs
1. Rätta svarsformatet i de sex AI-verktygen så att det följer samma mönster som de befintliga verktygen (till exempel partispårbarhet). Inget ändras i verktygens beteende, filter eller behörighet.
2. Kontrollera att hela koden är felfri.
3. Öppna Attestera och Tavlan i webbläsaren som inloggad administratör och se att de laddar och att en uppgift kan skapas och ändras.

Inga tabeller, befintliga sidor, befintliga verktyg eller edge functions ändras.

## Tekniskt
- `src/lib/mcp/tools/ai-team.ts`: `structuredContent` typas som `Record<string, unknown>`, vilket inte godtas som `JsonValueInput`. Hjälpfunktionen `ok()` skrivs om så att data serialiseras via `JSON.parse(JSON.stringify(v))` och typas som JSON-värde, och `deny`/`fail` får `as const`-typning. Alternativt returneras objektet direkt i varje handler som i `get-lot.ts`.
- Verifiering: `bunx tsgo --noEmit -p tsconfig.app.json`, därefter Playwright mot `/attestera` och `/tavlan`.
- Agentkopplingen blir nåbar först efter publicering.
