# Portalbyte bara vid profilen

## Vad som gäller idag
Portalbyte finns på två ställen:

1. Statusraden/headern vid kontomenyn (`AppLayout`) — portalmenyn med Admin, Grossist och butikslistan.
2. Butiksväxlaren längst ner i butiksportalens sidomeny (`StoreSwitcher`) — där ligger även raden "Byt portal" som nollställer portalvalet och skickar till `/choose-portal`.

Butikslistan i sidomenyn filtreras bara på tilldelade butiker, inte på om kontot alls har butiksbehörighet (`portal_access`).

## Ändringar

1. **Ta bort "Byt portal" ur sidomenyn.** Raden och separatorn i `StoreSwitcher` tas bort, så portalbyte sker uteslutande via menyn vid profilen. Butiksväxlingen i sidomenyn behålls (den byter butik, inte portal).
2. **Behörighetsstyrd butikslista.** `useAllowedStores` returnerar inga butiker när kontot saknar `shop` i `portal_access` (admin räknas fortsatt som full åtkomst), så växlaren visar bara ställen man får öppna.
3. **Samma regel i portalmenyn vid profilen.** Portalmenyn i `AppLayout` visar redan bara portaler kontot har, men butikslistan där byggs separat — den läggs på samma hjälpfunktion så meny och sidomeny alltid matchar.
4. **"Byt portal" i kontomenyn** visas fortsatt bara när kontot har mer än en portal, och navigerar till portalvalet.

## Tekniskt
- `src/components/StoreSwitcher.tsx`: ta bort `onPortals`-propen, `LayoutGrid`-raden och separatorn; utöka `useAllowedStores` med `portal_access`-kontroll (`admin` eller `shop`).
- `src/components/AppLayout.tsx`: låt butiksdelen av `portalMenuContent` använda `useAllowedStores` istället för egen filtrering.
- `src/pages/ImageFeed.tsx` använder `useAllowedStores` och `useSwitchStore` — båda finns kvar oförändrade i signatur.
- Ingen ändring i databas, RLS eller `pageAccess.ts`.
