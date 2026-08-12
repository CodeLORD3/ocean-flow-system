# Live personal (Admin)

En ny Admin-sida som i realtid visar hur personalen arbetar på samtliga butiker, jämfört med planerat schema, byggd på befintlig data.

## Förstudiens resultat

- **Butiker**: `stores` har `hours` som fritext — och den är tom för samtliga 9 butiker. `city` finns och används som grupperingsfält. `store_special_days` har redan strukturerade `open_time`/`close_time` per datum (avvikande dagar).
- **Personal**: `staff` (namn, roll/workplace, kontakt, bild, `store_id`) plus butiksmedlemskap via `user_scopes` (`set_store_membership`). En person kan tillhöra flera butiker.
- **Stämplingar**: `staff_shifts` (`staff_id`, `store_id`, `clocked_in_at`, `clocked_out_at`). Pågående pass = `clocked_out_at IS NULL`. 28 rader idag. Ingen rastrepresentation.
- **Planerade pass**: finns inte alls.
- **Behörighet**: `src/lib/pageAccess.ts` styr rutt → portal, där `wholesale` = Admin. Ingen ny rollmodell behövs.
- **Realtid**: `postgres_changes` används redan (notiser, chatt, orderrader). `staff_shifts` ligger inte i realtidspublikationen — läggs till.

## Beslut (bekräftade)

1. Strukturerade öppettider per veckodag införs, fritexten behålls orörd.
2. Minimal schematabell för planerade pass byggs nu.
3. Raster härleds ur stämplingspar (ut → in samma dag och butik).

## Databas (minimala tillägg)

- **`store_opening_hours`**: butik + veckodag (0–6) + `open_time`/`close_time` + `closed`. Redigeras i en enkel veckotabell på Butiker-sidan. Öppettid för ett datum löses i denna ordning: `store_special_days` → `store_opening_hours` → okänt (visas som "Öppettid saknas").
- **`staff_planned_shifts`**: personal + butik + datum + `start_time`/`end_time` + valfri anteckning. Redigeras direkt i Live personal-detaljvyn och på personalens profil.
- Båda får GRANT + RLS: all personal får läsa, admin och butikens egen personal får skriva.
- `staff_shifts` och `staff_planned_shifts` läggs till i realtidspublikationen.

## Sidan

**Rutt** `/live-staff`, menypost "Live personal" i Organisation-sektionen bredvid Personal och Butiker, endast Admin via `ROUTE_ACCESS`. Samma layout, breadcrumbs, kort, badge- och ikonspråk som Personal/Butiker.

### Översikt (alla ställen)

KPI-kort, alla räknade ur riktig data: personal i arbete nu, öppna butiker nu, totalt antal butiker, personal planerad idag, avvikelser nu, schemaföljsamhet idag.

Under korten en gemensam live-timeline: en rad per butik, butiksnamn + öppettid i en sticky vänsterkolumn, sticky tidshuvud, tidsspann satt av dagens öppettider (union över butiker). Segment per anställd: planerat pass (blå kontur) med faktiskt pass (grön fyllning) ovanpå, härledd rast i gult, avvikelse i rött, avslutat pass i grått. En "NU"-linje flyttar sig varje minut. Hover-tooltip visar planerad tid, instämplad tid, status och arbetad tid hittills.

### Statusmodell

Grön = arbetar nu enligt plan, blå = planerat men ej börjat, gul = rast, röd = avvikelse/saknas, grå = avslutat/stängt. Alltid färg + text + ikon, aldrig färg ensamt — samma chip-komponent som "Instämplad"/"Ej instämplad" på Personal-sidan.

### Detaljvy per butik

Klick på en butiksrad öppnar butiksvyn: KPI-kort (personal på plats, planerad arbetstid, faktiskt registrerad tid, antal avvikelser), en timeline per anställd med planerat mot faktiskt inklusive härledda raster, samt en händelselogg byggd på verkliga stämplingshändelser (in, ut, rast in/ut) — ingen exempeltext.

### Avvikelser

Ej påbörjat pass trots passerad starttid, sen instämpling, tidig utstämpling, arbete efter planerad sluttid, arbete utan planerat pass, öppen butik utan bemanning. Tröskel för "sen/tidig" sätts till 10 minuter.

### Filter och historik

Datum (default idag, bläddra bakåt/framåt), butik (default alla), status (alla/öppna/stängda/avvikelse), gruppering på `city`. Historiska datum visar faktiska tider mot planerat schema för den dagen.

### Live, prestanda, responsivitet

"● LIVE — Senast uppdaterad HH:MM:SS" i sidhuvudet. Fyra queries per datum totalt (butiker + öppettider, personal, faktiska pass, planerade pass) — ingen fråga per anställd. Realtidsprenumeration på `staff_shifts` uppdaterar bara berörd butiksrad. Desktop först; timelinen scrollar horisontellt med sticky butiks-/personkolumn och tidshuvud på tablet och mobil. Loading-skeletons och tydliga empty states ("Inga planerade pass för dagen", "Öppettid saknas — ange på Butiker").

## Tekniska filer

- Migration: `store_opening_hours`, `staff_planned_shifts`, GRANT/RLS, realtidspublikation.
- `src/hooks/useStoreOpeningHours.ts`, `src/hooks/usePlannedShifts.ts`, `src/hooks/useLiveStaff.ts` (aggregerar dagen per butik).
- `src/lib/liveStaff.ts`: öppettidsupplösning, härledning av raster ur stämplingspar, avvikelseregler, tidsaxelmatematik.
- `src/pages/LiveStaff.tsx` + `src/components/livestaff/` (KPI-kort, StoreTimeline, StaffTimeline, EventLog, Filters, StatusChip).
- Öppettidsredigering i `src/pages/Stores.tsx`.
- Rutt i `src/App.tsx`, menypost i `src/components/AppSidebar.tsx`, `"/live-staff": ADMIN` i `src/lib/pageAccess.ts`.
