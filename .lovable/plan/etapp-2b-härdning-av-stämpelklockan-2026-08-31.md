# Etapp 2b — Härdning av stämpelklockan

Målet är en stämpelklocka som håller vid revision: rätt tid året runt, ingen tyst dataförlust, personalliggare enligt SKVFS 2015:6 och ett attestunderlag som räknar OB och mertid rätt per person.

## A. Kritiska buggar

1. **Tidszon.** Ny delad modul `supabase/functions/_shared/setime.ts` med `svenskDatum(iso)`, `svenskTid(iso)`, `svenskDagStart/Slut(datum)` och `svenskZonOffset(datum)` — alltid via IANA-zonen `Europe/Stockholm`, aldrig fast offset. Ersätter de hårdkodade `+02:00` i `attest-compute` (`shiftBounds`, `fromIso`/`toIso`) och alla `toISOString().slice(0,10)` i klock-/attest-/lönefunktioner samt motsvarande klientfunktioner i `src/lib/schedule.ts`.
2. **Offlineposter.** Ny tabell `clock_sync_failures` (station, maskerad identifierare, krypterad identifierare kvar tills hanterad, occurred_at, felorsak, status, hanterad av/när). `src/lib/clockQueue.ts`: 72-timmarsgallringen gäller endast poster som synkats OK; misslyckade poster skickas till avvikelsekön via ny edge function `clock-sync-failure`. Chefsvy med "Registrera manuellt" (skapar riktig rad) och "Avfärda med skäl".
3. **Rate limit.** `checkRateLimit` byts mot räkning av endast misslyckade uppslag per station: fem i rad → 60 s spärr med tydligt meddelande; lyckade uppslag nollställer räknaren och är obegränsade.
4. **Stationssession.** `clock_station_sessions` får `absolute_expires_at` (24 h från aktivering). `requireStation` förnyar rullande TTL men aldrig utöver den absoluta gränsen; därefter krävs aktiveringskod. Sessionens utgång visas i `ClockStations.tsx`.

## B. Journal & personalliggare

5. **Pending-flödet skrivs om.** Okänt personnummer skapar provisorisk `employees`-rad (status `provisional`, endast pnr_hash/masked + förnamn) och en riktig in-rad i `time_entries`. Godkännande kopplar provisorisk → riktig anställd genom en `correction`-rad med referens (`corrects_entry_id`); ursprungsraden ändras aldrig. Avslag lämnar raden kvar med tilläggsnot "avvisad registrering".
6. **Inspektörsläge med fullständigt personnummer.** Serverfunktion `clock-inspector-pnr` dekrypterar endast i aktivt inspektörsläge och loggar varje uppslag i ny tabell `pnr_access_log` (vem, när, enhet, period). Övriga vyer förblir maskerade.
7. **Format och filter i kontrollvyn** (`TimeEntriesPage.tsx`): tidpunkter som `ÅÅÅÅ:MM:DD` och `TT:MM:SS`, filter på både `occurred_at` och `registered_at`, tillägg visas med vem/när.
8. **Svenska etiketter** för typ och källa i visningen; databasvärden oförändrade.
9. **Avrundning.** Standardsteg 0. Aktiverad avrundning sparar både `occurred_at` (faktisk) och ny kolumn `rounded_at` (löneunderlag). Journal och inspektörsläge visar alltid faktisk tid; `payroll-compute` använder `rounded_at` när den finns.
10. **auto-clock-out** skriver alltid explicit ut-rad med `source = 'system'` och not "automatisk utstämpling [regel]", som flaggas i attestkön. Inga härledda pass.

## C. Funktioner

11. **Kostnadsställebyte i kiosken.** Knapp "Byt kostnadsställe" (ny edge function `clock-switch-allocation`) stänger pågående `time_allocations`-intervall och öppnar nästa utan UT/IN. Allokeringen följer till attest och lönens `cost_center`.
12. **"Min tid"** (ny mobilsida `src/pages/MyTime.tsx`): dagar, timmar, OB-minuter per nivå, rast, samt "Flagga dag" som skapar post i chefens avvikelsekö med kommentar.
13. **Dygns- och veckovila på faktisk stämplad tid.** Regelmotorn körs på `time_entries`; brott blockerar inte stämpling men listas i avvikelsekön med namn, timmar under gränsen (11 h/36 h) och länk till passet.
14. **Städa död konfiguration.** `break.mode = "auto"` och `profile.geofence` tas bort ur typer, kod och befintliga profiler (migrering).

## D. Attest-compute

15. **OB-delning på fönstergränser** — exakt minutdelning mot `ob_windows` i stället för 15-minutersteg.
16. **Mertid per sysselsättningsgrad** — veckogräns = 40 h × `employments.employment_rate`; över egen grad = MER, över 40 h = ÖT. Deltidsmertidsregeln (35 %/70 %, från 2026-04-01) läses ur `payroll_policies`. Den fasta 160-timmarslogiken tas bort.

## E. Robusthet

17. Rebuild-kanter hanteras och testas: dubbel in (flaggas, ingen ny period), dubbel ut (ignoreras med not), `rast_slut` utan `rast_start` (flaggas, rast = 0), in utan ut vid dygnsskifte (auto-clock-out).
18. CORS för klockfunktionerna begränsas till Makrilltrades domäner + inbäddningssidor som listas i stationsadmin; wildcard-fallbacken tas bort.

## Tekniskt

- Migrationer: `clock_sync_failures`, `pnr_access_log`, `time_entries.rounded_at`, `clock_station_sessions.absolute_expires_at`, `employees.status = provisional`, profilmigrering, GRANT + RLS på alla nya tabeller.
- Nya/ändrade edge functions: `_shared/setime.ts`, `_shared/clock.ts`, `clock-punch`, `clock-activate`, `clock-status`, `clock-sync-failure`, `clock-switch-allocation`, `clock-inspector-pnr`, `attest-compute`, `payroll-compute`, `auto-clock-out-shifts`.
- UI (Industry-primitiver, inga hexfärger): `Clock.tsx`, `ClockStations.tsx`, `TimeEntriesPage.tsx`, `Attestations.tsx`, ny `MyTime.tsx` och avvikelsekö.
- Append-only-triggern på `time_entries` lämnas orörd; alla rättelser sker som tilläggsrader.

## Körbevis (sektion G)

Körs och redovisas efter implementationen: tidszon i juli/december (480 min båda, `rg` utan träffar på fasta offsets), sex instämplingar på en minut, sex felaktiga pnr, offline-fel i avvikelsekön, 24-timmarssession, pending-flöde, inspektörsläge med logg, avrundning, auto-clock-out, kostnadsställebyte, Min tid + RLS, dygnsvila, OB-delning och mertid, fyra rebuild-kanter samt konfigurations- och CORS-redovisning. Testdata städas efteråt.
