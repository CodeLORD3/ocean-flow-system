## Teknisk avgränsning

- Endast `src/pages/StaffSchedule.tsx` skrivs om i presentationslagret. Datalager (befintliga hooks för pass, stämplingar, löner, frånvaro och omsättning) och dialogerna `PlannedShiftDialog`, `StaffSalaryDialog` och `StaffAccessDialog` behålls oförändrade.
- Vyväxlaren utökas från `week | calendar` till `week | day | calendar`. Dagvyn filtrerar redan hämtade pass på valt datum — ingen ny fråga mot backend.
- Nya visuella element (arbetsytehuvud, segmenterad växlare, beslutsrad, statusmärke, butikskod) läggs som små presentationskomponenter under `src/components/schedule/`, byggda på befintliga Industry-primitiver där de räcker.
- Alla färger tas från befintliga tokens i `src/index.css` och `src/styles/industry.css`. Prototypens råa hexvärden mappas till närmaste token; inga hårdkodade färgklasser.
- Butikskoderna genereras från butiksnamn med en liten hjälpfunktion och visas med butikens fulla namn i tooltip, så inget nytt fält behövs i databasen.
- Rutorna för mono-siffror använder befintlig tabular-nums-konvention med mellanslag som tusentalsavgränsare.
- `/schedule-planner` och `/schedule` lämnas som de är i denna omgång.
