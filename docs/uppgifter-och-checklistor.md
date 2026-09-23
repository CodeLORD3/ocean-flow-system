# Uppgifter och checklistor

Systemet har två skilda begrepp som delar ett gemensamt schema.

## Uppgift

Ett arbete som ska göras. Resultatet är: gjort, tid, bild och kommentar. En uppgift kan vara tillfällig eller återkommande.

Uppgifter ligger i `checklist_templates`, `checklist_template_items`, `checklist_days` och `checklist_items`. Vyerna `task_definitions` (standarduppgifter) och `task_occurrences` (dagens förekomster) ger ny kod rätt begrepp utan att något byter namn.

## Checklista

En kontroll med flera punkter som bekräftas var för sig och signeras som helhet. En signerad lista är låst: resultaten kan varken ändras eller tas bort, låsningen kan inte tas bort och körningen kan inte tas bort.

Checklistor ligger i `checklist_defs`, `checklist_def_points`, `checklist_runs` och `checklist_run_results`. Skrivning i körningar och resultat sker endast via systemets egna funktioner, aldrig direkt från gränssnittet.

## Kontrollpunkt på en uppgift

En kontrollpunkt som hör till en uppgift är en del av uppgiften, inte en checklista. En uppgift kan däremot kräva att en checklista görs, via fältet `requires_checklist_def_id` på standarduppgiften.

## Gemensamt

Båda delar: schema, tilldelning, område, bilder och historik.

## Schemat

Scheman ligger i `schedules` med ägartyp (`task` eller `checklist`), ägare, regel, startdatum, slutdatum, klockslag, om stängda dagar ska hoppas över, butik och om regeln är aktiv. Butikens stängda dagar ligger i `store_closed_days`.

Veckodagar anges i ISO: måndag är 1 och söndag är 7. De gamla kolumnerna `weekdays` på `checklist_templates` och `checklist_template_items` ligger kvar men läses inte av ny kod. Observera att `checklist_templates.weekdays` använde 0 för söndag; vid flytten räknades 0 om till 7.

## Företräde

En uppgifts egen rad i `schedules` gäller före mallens rad. Saknar uppgiften egen regel gäller mallens. Saknar även mallen regel gäller dagligen.
