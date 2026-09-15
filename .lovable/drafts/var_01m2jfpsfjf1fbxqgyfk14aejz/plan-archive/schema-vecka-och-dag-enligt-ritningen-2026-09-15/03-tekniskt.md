## Teknisk plan

Presentation och avledda beräkningar. Ingen ändring i databasen, i löneberäkning eller i behörigheter.

**Filer som ändras**
- `src/pages/StaffSchedule.tsx` — flytta nyckeltalen upp i sidhuvudet (schemalagda timmar, lönekostnad, kräver åtgärd) med publiceringsknapp, lägg till driftställerad med monokoder och statusförklaring, ta bort KPI-korten som separat rutnät, och håll ett `selectedShiftId`-tillstånd för inspektionspanelen.
- `src/components/schedule/WeekGridView.tsx` — kolumnmall `[176px_repeat(7,1fr)_132px]`, "Mot avtal"-kolumn som `40,0 / 40`, passblock med 3 px vänsterkant per status, hel röd ram vid regelbrott, tonade lör/sön, samt en summerande täckningsrad längst ner.
- `src/components/schedule/DayLaneView.tsx` — behåll timaxeln, lägg till rast/enhetsbyte-text i blocket, en bemanningsrad per timme med markerad lucka, och rikare kommer-och-går-poster (byter till, konsekvenstext).
- Ny `src/components/schedule/ShiftInspector.tsx` — panelen till höger: valt pass, enheter och avtal, konsekvens (kronor via befintliga `useEffectiveRates` och påslag, veckotimmar mot avtal), regler samt Spara/Ta bort som öppnar befintlig `PlannedShiftDialog`.
- Ny `src/lib/scheduleRules.ts` — dygnsvila (11 h, 13 § ATL) och veckovila (36 h) räknade ur planerade pass, plus täckning per dag och lucka per timme.
- `src/styles/staff-light.css` — tokens för monokod, statusprick, passkant och streckat öppet pass.

**Vad som finns och vad som saknas i data**
- Finns: `staff_planned_shifts` (person, enhet, datum, start, slut, note), stämplingar, frånvaro, lönesatser och påslag, `agreement_area` på anställning.
- Saknas i dag: bemanningsbehov per enhet och timme, samt delat pass som två rader med enhet. Tills behovet finns räknas täckning som antal bemannade personer per dag/timme och rubriken visar "behov ej satt" i stället för `4/4`. Ett delat pass visas som två pass på samma person och dag, vilket redan är möjligt.
- Avtalet läses från anställningen, inte från enheten, så panelen visar ett avtal per person även vid delat pass.

**Kontroll**
Typkontroll, samt körning i förhandsvisningen med skärmdumpar av veckovyn, panelen och dagvyn.
