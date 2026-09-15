## Etapper

**Etapp 1 — designspråket.** Ett nytt ljust tema för personalmodulen: vit yta, mjuka kort, pastellfärgade ikonrundlar, gröna/röda statusmärken, luftig rubriktypografi och tabellrader med tydliga radlinjer. Läggs som tokens och små byggstenar (kort, nyckeltalskort, statusmärke, radlista, segmentväxlare) så alla personalsidor kan byta språk utan att röra sin logik.

**Etapp 2 — Start.** `/personal` byggs om till startvyn med nyckeltalskort och Dagens pass, plus knappar "Gå till analys" och "Gå till schema". Nyckeltalen och passen läses från de hooks som redan finns.

**Etapp 3 — Navigering.** Flikraden går från 16 poster till fem (Start, Schema, Tider, Analys, Personal) med underflikar. Behörighetsfiltreringen som finns idag behålls exakt.

**Etapp 4 — Schema.** Veckovyn ritas om enligt referensen: ihopfällbara sammanfattningsrader per bolag/butik, markerad idag-kolumn, röd söndag, färgpunkter per grundpass, passblock i ljus stil. Dagvyn behålls som alternativ.

**Etapp 5 — Tider.** Avstämningsvyn: månadskalender med avvikelseprickar, dagslista med schema kontra arbetad tid och frånvaro, samt knappar för att lägga till arbetstid eller frånvaro.

**Etapp 6 — Analys och Personal.** Analys får korten och det kombinerade stapel/linje-diagrammet med jämförelseläge. Personal får den grupperade listan med filter, sortering och statusmärken.

## Tekniska noter

- Nytt tema i egen stilfil (t.ex. `src/styles/staff-light.css`) med tokens; inga hårdkodade färgklasser i komponenterna.
- Nya presentationskomponenter under `src/components/staff/ui/` (KpiCard, StatusPill, PersonRow, GroupHeader, SegmentSwitch, WeekGridShell). Ingen av dem läser databasen.
- `src/lib/staffModuleNav.ts` får en tvånivåstruktur (sektion → underflik). `staffGroupsForSite` och `canOpenStaffPage` behålls oförändrade i sin logik.
- `StaffSchedule.tsx`, `TimeEntriesPage.tsx`, `Staff.tsx` och `PersonalHub.tsx` ändras bara i presentationslagret; hooks, dialoger och beräkningar rörs inte.
- Analysdiagrammet byggs med Recharts som redan används i projektet.
- Inga databasändringar, inga borttagna funktioner, inga ändrade behörigheter.
