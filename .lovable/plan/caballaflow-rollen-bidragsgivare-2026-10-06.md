# CaballaFlow: rollen Bidragsgivare

## Vad som ändras för användarna
- Fler personer, till exempel Caisa och Fredrik, kan öppna CaballaFlow och följa bygget. De kan föreslå promptar, skriva i Samtal och skapa och bocka av sina egna uppgifter.
- Bara ägarna (Tim, Baldvin och Joakim) kan godkänna eller avvisa promptar, och aldrig sina egna.
- Ägarna får en ny flik, **Medlemmar**. Där söker de bland de anställda, ger rollen Bidragsgivare och tar bort den igen. Rollen Ägare kan inte delas ut därifrån.
- Namn visas överallt: vem som skrev och vem som godkände en prompt, och vem som bockade av en uppgift. Varje namn märks med "Ägare" eller "Bidragsgivare".
- Översikten visar progress för varje medlem som har uppgifter, inte bara för de tre ägarna.
- Menypunkten CaballaFlow syns för både ägare och bidragsgivare.

## Behörighet
| | Ägare | Bidragsgivare |
|---|---|---|
| Läsa allt i /flow | ja | ja |
| Skapa promptar | ja | ja |
| Godkänna eller avvisa (inte sina egna) | ja | nej |
| Samtal | ja | ja |
| Skapa och bocka av egna uppgifter | ja | ja |
| Ändra andras uppgifter och tilldela vem som helst | ja | nej |
| Fliken Medlemmar | ja | nej |

## Uppgifternas ägare
Uppgifter knyts nu till ett konto i stället för till namnen tim, baldvin och joakim. De befintliga uppgifterna kopplas till rätt ägares konto, och ingen uppgift byter person. Det gamla namnfältet ligger kvar men används inte längre.

## Det här ändras inte
Inget annat i Makrill ändras och inget bokförs. Rollen Bidragsgivare ger ingen behörighet utanför CaballaFlow. flow-runner ändras inte.

## Teknik
- Migration 1: `ALTER TYPE app_role ADD VALUE 'contributor'`.
- Migration 2:
  - Ny funktion `is_flow_member()` som är security definer och kollar rollen owner eller contributor. `is_flow_owner()` lämnas orörd.
  - `flow_tasks.owner_user_id uuid` läggs till och backfillas från namnen via `staff`. Det gamla fältet `owner` kommenteras som DEPRECATED och dess check släpps inte.
  - Policyer:
    - Läsning på alla fyra tabellerna kräver `is_flow_member()`.
    - Medlemmar får skapa promptar och skriva i chatten.
    - Promptar får bara uppdateras av den som är `is_flow_owner()`. Befintlig trigger stoppar fortfarande självgodkännande.
    - Uppgifter kan skapas, ändras och raderas av ägare, eller av en medlem när `owner_user_id = auth.uid()`. Bidragsgivaren kan inte flytta uppgiften till någon annan.
  - RPC:er, alla security definer:
    - `flow_members()` ger varje medlems user_id, fullständiga namn och roll till medlemmar. Den behövs eftersom bidragsgivare inte får läsa personaltabellen.
    - `flow_set_contributor(_user_id, _on)` får bara köras av ägare, rör bara rollen contributor och ger ägare inte rollen.
    - `flow_staff_candidates(_search)` får bara köras av ägare och ger anställdas namn och user_id.
  - EXECUTE återkallas från anon.
- Frontend:
  - `useFlow` får `useIsFlowMember`, `useFlowMembers` och mutationer för medlemmar.
  - `Flow.tsx`: åtkomst via medlem, fliken Medlemmar bara för ägare och Godkänn/Avvisa bara för ägare. Namn och rollmärken kommer från `flow_members()`, och ägarvalet i uppgifter listar medlemmarna. Bidragsgivaren låses till sig själv.
  - `AppSidebar` visar `/flow` för medlemmar.
- Regeln i AGENTS.md uppdateras: läsning och bidrag kräver `is_flow_member()`, beslut kräver `is_flow_owner()`.

## Antagande
Menypunkten finns i Admin-portalens meny som i dag. En bidragsgivare som bara har butiksportalen når sidan via adressen /flow men ser ingen menypunkt. Säg till om den också ska läggas i butiksmenyn.
