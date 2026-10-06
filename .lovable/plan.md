# CaballaFlow – ägarnas kontrollrum (/flow)

## Åtkomst
I dag har fyra personer rollen platform_admin: Tim Hvarfvenius, Baldvin Ahlander, Joakim Hvarfvenius och Caisa Carning. Caisa fick rollen för schemaimporten, så platform_admin räcker inte som spärr.

- Ny roll `owner` i rollistan (app_role), tilldelas bara Tim, Baldvin och Joakim. Rollen ger ingen annan behörighet i Makrill.
- Rollen kan bara läggas till eller tas bort via databasen (av oss på begäran). Vi bygger inget formulär för att ge sig själv rollen.
- Behörighetsregel: `is_flow_owner()` = har rollen owner. Alla nya tabeller använder den för läsning och skrivning.
- Menypunkten "CaballaFlow" och sidan /flow visas bara för ägare. Andra som går till adressen ser "Ingen åtkomst".

## Tabeller
1. **flow_prompts** – rubrik, mål (lovable/n8n/claude), risk (normal/read_only), varför, prompt, skapad av/när, status (forslag/godkand/kors/klar/avvisad/fel), godkänd av/när, resultat, körd när.
   - Databasregel: den som godkänner eller avvisar får aldrig vara den som skapade prompten.
   - Bara status forslag kan godkännas eller avvisas. Ägare kan inte själva sätta kors/klar/fel; det gör bara flow-runner.
   - Rader kan inte raderas (spårbarhet).
2. **flow_tasks** – rubrik, ägare (tim/baldvin/joakim), fas (kopplingar/idag/vecka/senare), ordning, status (att_gora/pagar/klar), varför, steg, prompt, klar när/av (sätts automatiskt vid avbockning).
3. **flow_messages** – författare (sätts från inloggat konto), text, tid. Live-uppdatering.
4. **flow_agent_log** – agent, tid, text. Bara flow-runner får skriva, ägarna läser.

## Sidan /flow (flikar)
- **Översikt**: progressstaplar per ägare och totalt, de tre nästa uppgifterna per person, de fem senaste raderna i agentloggen.
- **Promptkö**: formulär (rubrik, mål, risk, varför, prompt). En lista med statusmärken. Godkänn och Avvisa visas bara på andras promptar med status förslag. Resultatet syns när prompten är klar eller har fått fel.
- **Uppgifter**: filter per person och fas, kryssruta för att bocka av, enkel ny uppgift/redigering.
- **Samtal**: chatt i realtid med namn och svensk tid.
- **Agentlogg**: de senaste 200 händelserna, nyast först.

Sidan följer Makrills ljusa stil och komponenter. Den är byggd för mobil med kort i stället för tabeller och har ingen sidledsskroll.

## flow-runner (förberedd, ingen körning i Makrill)
En separat funktion som skyddas av nyckeln `FLOW_RUNNER_KEY` i headern `x-flow-key`. En människa lägger in nyckeln senare. Tills dess svarar funktionen 503.
- `POST /claim`: tar äldsta godkända prompt, sätter den till kors och lämnar ut den. Låset gör att två körare aldrig får samma prompt.
- `POST /result`: skickar id, status (klar/fel) och resultat. Det fungerar bara på prompter med status kors. Sätter körd-tid.
- `POST /log`: valfritt. Skriver en rad i agentloggen.

## Utanför ramen
Ingen bokföring och inga ändringar i andra sidor, tabeller eller funktioner, utom en menypost. Inga MCP-verktyg.

## Teknik
- Migration: `ALTER TYPE app_role ADD VALUE 'owner'` (egen migration), därefter tabeller med GRANT, RLS, `is_flow_owner()` som security definer, triggers för godkännande-/statusregler, raderingsskydd och `done_at`, samt realtime för flow_messages.
- Rolltilldelning till tre user_id via datafråga efter migrationen.
- Frontend: `src/pages/Flow.tsx` med flikkomponenter i `src/components/flow/`, `useFlow`-hooks, rutt i KeepAliveTabs, `/flow` i pageAccess och menypost villkorad på rollen.
- Edge function `supabase/functions/flow-runner` (verify_jwt=false, nyckelkontroll i konstant tid, service role, atomisk claim via RPC med `FOR UPDATE SKIP LOCKED`).
- Regel i AGENTS.md: CaballaFlow styrs av rollen owner och körs bara externt via flow-runner.
