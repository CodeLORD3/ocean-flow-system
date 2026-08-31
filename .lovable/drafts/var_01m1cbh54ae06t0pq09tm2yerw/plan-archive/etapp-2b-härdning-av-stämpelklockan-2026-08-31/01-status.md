# Etapp 2b — Härdning av stämpelklockan

**Status: inget av detta är byggt ännu.** Kontroll av projektet visar att `_shared/setime.ts` saknas, att hårdkodade `+02:00` finns kvar i `attest-compute` och `auto-clock-out-shifts`, att tabellerna `clock_sync_failures` och `pnr_access_log` inte finns, att `time_entries.rounded_at` och `clock_station_sessions.absolute_expires_at` saknas, och att `MyTime.tsx` samt de nya klockfunktionerna (`clock-sync-failure`, `clock-switch-allocation`, `clock-inspector-pnr`) inte finns.

Målet är en stämpelklocka som håller vid revision: rätt tid året runt, ingen tyst dataförlust, personalliggare enligt SKVFS 2015:6 och ett attestunderlag som räknar OB och mertid rätt per person.

## A. Kritiska buggar

1. **Tidszon.** Ny delad modul `supabase/functions/_shared/setime.ts` med `svenskDatum(iso)`, `svenskTid(iso)`, `svenskDagStart/Slut(datum)` och `svenskZonOffset(datum)` — alltid via IANA-zonen `Europe/Stockholm`, aldrig fast offset. Ersätter de hårdkodade `+02:00` i `attest-compute` (`shiftBounds`, `fromIso`/`toIso`) och alla `toISOString().slice(0,10)` i klock-/attest-/lönefunktioner samt motsvarande klientfunktioner i `src/lib/schedule.ts`.
2. **Offlineposter.** Ny tabell `clock_sync_failures` (station, maskerad identifierare, krypterad identifierare kvar tills hanterad, occurred_at, felorsak, status, hanterad av/när). `src/lib/clockQueue.ts`: 72-timmarsgallringen gäller endast poster som synkats OK; misslyckade poster skickas till avvikelsekön via ny edge function `clock-sync-failure`. Chefsvy med "Registrera manuellt" och "Avfärda med skäl".
3. **Rate limit.** `checkRateLimit` byts mot räkning av endast misslyckade uppslag per station: fem i rad → 60 s spärr med tydligt meddelande; lyckade uppslag nollställer räknaren och är obegränsade.
4. **Stationssession.** `clock_station_sessions` får `absolute_expires_at` (24 h från aktivering). `requireStation` förnyar rullande TTL men aldrig utöver den absoluta gränsen; därefter krävs aktiveringskod. Sessionens utgång visas i `ClockStations.tsx`.

## B. Journal & personalliggare

5. **Pending-flödet skrivs om.** Okänt personnummer skapar provisorisk `employees`-rad (status `provisional`, endast pnr_hash/masked + förnamn) och en riktig in-rad i `time_entries`. Godkännande kopplar provisorisk → riktig anställd genom en `correction`-rad med referens (`corrects_entry_id`); ursprungsraden ändras aldrig. Avslag lämnar raden kvar med tilläggsnot "avvisad registrering".
6. **Inspektörsläge med fullständigt personnummer.** Serverfunktion `clock-inspector-pnr` dekrypterar endast i aktivt inspektörsläge och loggar varje uppslag i ny tabell `pnr_access_log` (vem, när, enhet, period). Övriga vyer förblir maskerade.
7. **Format och filter i kontrollvyn** (`TimeEntriesPage.tsx`): tidpunkter som `ÅÅÅÅ:MM:DD` och `TT:MM:SS`, filter på både `occurred_at` och `registered_at`, tillägg visas med vem/när.
8. **Svenska etiketter** för typ och källa i visningen; databasvärden oförändrade.
9. **Avrundning.** Standardsteg 0. Aktiverad avrundning sparar både `occurred_at` (faktisk) och ny kolumn `rounded_at` (löneunderlag). Journal och inspektörsläge visar alltid faktisk tid; `payroll-compute` använder `rounded_at` när den finns.
10. **auto-clock-out** skriver alltid explicit ut-rad med `source = 'system'` och not "automatisk utstämpling [regel]", som flaggas i attestkön. Inga härledda pass.
