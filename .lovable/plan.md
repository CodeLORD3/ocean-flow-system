# Steg 0: gräns mellan uppgifter och checklistor, samt gemensamt schema

Grundläggande steg. Ingenting ändras i det användaren ser idag: uppgiftssidan, den befintliga fliken Checklistor, timer, bilder, kartan och resurser fungerar precis som nu.

## Det här läggs till

**1. Begreppen skrivs ner**
Ny text `docs/uppgifter-och-checklistor.md` med definitionerna: uppgift (ett arbete som ska göras, ger gjort, tid, bild, kommentar), checklista (flera punkter som bekräftas var för sig och signeras som helhet, en signerad lista är låst), kontrollpunkt på en uppgift hör till uppgiften och är inte en checklista, och att båda delar schema, tilldelning, område, bilder och historik.

**2. Rätt namn på uppgifternas data**
Två vyer som bara läser befintliga tabeller: standarduppgifter och dagens förekomster. Ny kod kan använda begreppen utan att något byter namn eller tas bort.

**3. Ett gemensamt schema**
Ny tabell för scheman som både uppgifter och checklistor kan använda: ägare, regel, startdatum, slutdatum, klockslag, hoppa över stängda dagar, butik och aktiv. Befintliga veckodagar flyttas in dit som regler i veckodagsform där måndag är 1 och söndag 7. Gamla kolumner ligger kvar men läses inte av ny kod. Dessutom en tabell för butikens stängda dagar.

**4. Plats för den kommande checklistfunktionen**
Tabeller för checklistmallar, punkter (ok/avvikelse, värde med min och max, bild), körningar och resultat, med låsning: när en körning är signerad går resultaten inte att ändra eller ta bort. Standarduppgifter får ett valfritt fält för att kräva en viss checklista.

## Vad datan ser ut som nu

- 5 checklistmallar, varav 2 har veckodagar (torsdag till lördag, respektive tisdag till lördag).
- 32 standarduppgifter, ingen av dem har egna veckodagar idag.
- Inga av de nya tabellerna finns sedan tidigare.

Söndag förekommer inte i dagens data, men omräkningen skrivs ändå så att söndag hamnar rätt, och testas.

## Teknisk del

Migration (idempotent, `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`):
- Vyer `task_definitions` (över `checklist_template_items`) och `task_occurrences` (över `checklist_items`), skapade `WITH (security_invoker = true)` så att underliggande RLS gäller, `GRANT SELECT` till `authenticated` och `service_role`.
- `schedules`: `id`, `owner_type text check in ('task','checklist')`, `owner_id uuid`, `rule jsonb`, `start_date`, `end_date`, `times jsonb`, `skip_closed_days boolean default true`, `store_id uuid`, `active boolean default true`, `created_at`, `updated_at` + unikt index `(owner_type, owner_id, store_id)` (nullbutik hanteras via `coalesce`-uttryck i indexet). GRANT + RLS enligt befintligt mönster (`is_staff`/`can_see_store` för läsning), `update_updated_at_column`-trigger.
- Backfill: en rad per **varje aktiv** `checklist_template_item` och en rad per `checklist_templates`. Regel i ordning: radens egna `weekdays` → mallens `weekdays` (`0 -> 7`) → `{"type":"daily"}`. Veckodagsregel som `jsonb_build_object('type','weekdays','days', <ISO-array>)`. `ON CONFLICT DO NOTHING`. Redovisas: alla 32 standarduppgifter har en regel.
- Företräde: en uppgifts egen `schedules`-rad gäller före mallens. Dokumenteras i `docs/uppgifter-och-checklistor.md`.
- `store_closed_days` (`store_id`, `date`, `reason`, pk `(store_id, date)`), GRANT + RLS: läsning för personal, skrivning endast för admin (`has_role(auth.uid(),'admin')`).
- `checklist_defs`, `checklist_def_points`, `checklist_runs`, `checklist_run_results` enligt specen, med GRANT + RLS. Läsning för personal. **Inga** insert/update/delete-policies för `authenticated` på `checklist_runs` och `checklist_run_results` — skrivning sker via security definer-funktioner (byggs i steg 3) eller service role.
- Trigger `checklist_run_results_locked_guard` (BEFORE UPDATE OR DELETE) som kastar fel när körningen är låst.
- Trigger på `checklist_runs` som stoppar att `locked` ändras från true till false och stoppar borttagning av en låst körning.
- `checklist_template_items.requires_checklist_def_id uuid references checklist_defs(id)`.

Kod:
- Kommentar överst i `src/hooks/useChecklist.ts`: "Dessa tabeller används av Uppgifter. Nya checklistor byggs i egna tabeller."
- Inga andra kodändringar.

Verifiering:
- `bunx tsgo --noEmit`.
- Vitest: veckodagsomräkningen (inklusive söndag 0 -> 7) som ren funktion i `src/lib/`.
- SQL-kontroll av all låsning: ändring och borttagning av resultat i en låst körning, samt låst körning som låses upp respektive tas bort.
- Supabase-lintern: kontroll att inga security definer-vyer finns.
- Redovisning före/efter: antal standarduppgifter, antal regler i `schedules` och tre stickprov gamla `weekdays` mot ny regel.
