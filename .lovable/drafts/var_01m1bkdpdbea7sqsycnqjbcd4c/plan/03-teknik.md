## Teknisk avgränsning

- **Tokens först.** Funktionsfärgerna alert/warn/ok läggs in i tre steg (100/600/800) i `src/styles/industry.css` och exponeras i `tailwind.config.ts`. Regeln "600 bär kant och prick, 800 bär text, 100 är platta" hålls i klassnamnen. Inga hårdkodade färgklasser i komponenter.
- **Endast presentationslagret ändras.** `src/pages/StaffSchedule.tsx` skrivs om; befintliga hooks för pass, stämplingar, löner, frånvaro och omsättning samt dialogerna `PlannedShiftDialog`, `StaffSalaryDialog` och `StaffAccessDialog` behålls.
- **Nya presentationskomponenter** under `src/components/schedule/`: beslutsrad, veckogrid, dagvyns banor och bemanningsgraf, kopplingspanel, panelen "Kommer och går", monokodsmärke, statusmärke och tomläget med tre förslag.
- **Monokoder** (B01–B07, GRO, ADM) läggs som en mappning från butiks-id i en liten hjälpfil, med butikens fulla namn primärt i gränssnittet. Inget nytt databasfält.
- **Talformat** samlas i en hjälpfunktion: mono, tabular-nums, högerställt, tid som `8 h 11 min`, belopp med mellanslag som tusentalsavgränsare och "prel." på talet.
- **Tomlägets förslag** "Kopiera vecka N" och "Importera från fil" kopplas till befintlig importgranskning där den finns; om kopieringsfunktionen saknas i backend visas knappen med tydligt läge och diffvyn byggs mot befintliga pass i den föregående veckan, utan nya tabeller.
- **Tillstånd enligt avsnitt D**: skelettrader med rätt höjd, vyfel som rad överst i alert-100 med en åtgärd, sparat som kort remsa i ok-100 vid det ändrade, optimistisk uppdatering i schemat men inte i attest.
- **Responsivt** för 1280 px ner till 1024 px: sidopanelen fälls under huvudinnehållet, gridet får horisontell scroll med frusen förstakolumn. Mobil 375 px: en dag per skärm, inga tooltips, träffytor minst 48 px.
- **Tangentbord**: piltangenter i gridet, Enter öppnar cellen, Escape stänger, fokusring 2 px accent med 2 px offset. Varje dragoperation får en formulärväg.
- `/schedule-planner` och `/schedule` lämnas oförändrade i denna omgång. Övriga vyer i designleveransen (inspektörsläget, attest, min tid, löneunderlag, stämpelklockans sex ändringar) läggs som separata poster i roadmap.md och tas i egna omgångar.
