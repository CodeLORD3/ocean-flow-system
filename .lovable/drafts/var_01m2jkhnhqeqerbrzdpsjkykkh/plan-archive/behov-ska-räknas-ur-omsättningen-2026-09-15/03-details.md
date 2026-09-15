## Teknisk genomgång

**`src/hooks/useWeekdayStaffNeed.ts`** skrivs om till en omsättningsdriven beräkning:

- Behållen input: `storeId`, `weekStart`, `weeksBack = 8`.
- Returnerar per veckodag: `hours`, `people`, `source` (`"omsättning"` / `"omsättning+historik"` / `"saknas"`), `samples`, `avgShiftHours`, samt använd `budget`.
- Grund: `useWeekdayRevenue` (redan finns, `pos_transactions` med `daily_reports` som reserv) × `LABOR_COST_LIMIT_PCT / 100` ÷ timkostnad inkl. påslag.
- Timkostnad: samma härledning som planerarens kostnadsberäkning (timlön eller månadslön omräknad, annars fallback-sats) × påslag för arbetsgivaravgift, så behov och kostnadsprocent bygger på samma tal.
- Historikjustering: faktiskt arbetade timmar per veckodag ur `time_entries` (in/ut-par per `arbetsdag`, `store_id`), snittas per veckodag. Ramen viktas mot historiken med en begränsad faktor (klamrad till ±25 %), så historiken nyanserar men aldrig styr.
- Snittpasslängd: samma `time_entries`-underlag, snitt-timmar per person och dag för veckodagen; saknas underlag används 8 timmar.
- Krävs för att ge en siffra: `averageRevenue > 0` och timkostnad `> 0`. Annars `source: "saknas"`.
- `estimateNeedFromRevenue` blir intern och ersätts av den nya, timbaserade funktionen; anropet i `SchedulePlanner.tsx` uppdateras.

**`src/pages/SchedulePlanner.tsx`**

- `needPerDay` läser den nya returen direkt, ingen tvågrensfallback.
- Behovsraden visar `planerade timmar / behovstimmar` med personer som sekundär text, samt tooltip med källa, antal underlagsdagar och budget i kronor.
- Underbemanning/överbemanning jämförs mot timmar, i linje med raden för personalkostnad, så färgerna på de två raderna inte kan säga emot varandra.

**Verifiering:** typecheck, plus en inloggad genomgång av `/schedule-planner` för minst två butiker med olika omsättningsnivå, med skärmbild av behovsraden och kontroll mot faktiska försäljningssnitt i databasen.
