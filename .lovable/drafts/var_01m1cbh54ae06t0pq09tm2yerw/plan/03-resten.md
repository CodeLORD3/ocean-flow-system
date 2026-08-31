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

Körs och redovisas efter implementationen: tidszon i juli/december (480 min båda, sökning utan träffar på fasta offsets), sex instämplingar på en minut, sex felaktiga personnummer, offline-fel i avvikelsekön, 24-timmarssession, pending-flöde, inspektörsläge med logg, avrundning, auto-clock-out, kostnadsställebyte, Min tid + åtkomstkontroll, dygnsvila, OB-delning och mertid, fyra rebuild-kanter samt konfigurations- och CORS-redovisning. Testdata städas efteråt.
