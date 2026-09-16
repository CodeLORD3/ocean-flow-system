# Uppgifter – ny huvudvy med rulldown

Bygger vidare på befintliga checklistor (samma tabeller, samma bilder, samma personal, samma butikskarta). Inget parallellt uppgiftssystem.

## Vad som finns redan (återanvänds)

- Uppgifter = `checklist_items` (dagens rader) som skapas från `checklist_template_items` (standarduppgifter) per butik och datum.
- Områden = butikskartans `map_zones` med färg + `map_objects`. Uppgiftsraderna har redan koppling till område/objekt.
- Arbetstyp finns redan (Städning, Kontroll, Rapporter …), bilder finns i bildsystemet med koppling till uppgift, område och fotograf.
- Personal, behörigheter, historik och avvikelser finns och används som de är.

## Vad som saknas och läggs till

Nya fält på uppgiften och standarduppgiften:

- Tilldelad person, och separat vem som faktiskt bockade av (bevaras isär).
- Tid: exakt tid, tidsfönster, dagsdel eller ingen tid — plus beräknad tid i minuter (frivilligt).
- Instruktion (steg för steg), viktig anmärkning, "bild krävs".
- Kategori som administrerbar lista med namn och färg (ersätter fritext, befintliga värden flyttas över automatiskt).

## Sidan Uppgifter

Flikar: **Dagens uppgifter** (standard), **Standarduppgifter**, **Schemaläggning**.

Dagens uppgifter:

- Rubrik med butik och datumväljare.
- Filter: kategori, område, person, status.
- Progress: "11 av 16 uppgifter klara · 69%" med stapel, samt per kategori.
- Grupper: Morgon, Mitt på dagen, Kväll, Utan tid. Kronologiskt inom gruppen. Saknas tid visas ingen tid alls.
- Rad: kryssruta, områdesbricka i områdets färg från kartan, uppgiftsnamn, person (bild eller initialer), tid om den finns, chevron.
- Klick på raden fäller ut en rulldown: kort instruktion, viktig anmärkning, beräknad tid, bildkrav, referensbild, "Lägg till bild" och "Mer info →". Bara det som finns visas.
- "Lägg till tillfällig uppgift" — gäller bara idag, blir inte standarduppgift.
- Kräver uppgiften bild går den inte att bocka av utan bild; en dialog erbjuder Ta bild / Ladda upp.
- Byta tilldelad person direkt i listan för behöriga.

Personfilter visar personens antal, klara, kvar och återstående beräknad tid när tider finns.

## Uppgiftens detaljsida

Ny sida på `/uppgift/:id` med flikarna Översikt, Instruktion, Bilder, Historik och Inställningar (bara behöriga).

- Översikt: status, område (klickbart → kartan markerar området), kategori, tilldelad, schema, tid, beräknad tid, bildkrav, senast utförd.
- Instruktion: full arbetsinstruktion med steg och referensbilder (endast riktiga uppladdade bilder).
- Historik: varje tidigare tillfälle med datum, tid, person och bild — bildhistorik i rad med Idag / Igår / datum. Klick öppnar stor bild med datum, person och kommentar.

## Standarduppgifter

Lista över återkommande uppgifter med schema (varje dag, vardagar, valda dagar, varje vecka, varje månad, flera gånger per dag), tid, beräknad tid, kategori, område, person och bildkrav. Redigeras av behöriga.

## Butikskartan

Områdesstatus räknas från dagens verkliga uppgifter (t.ex. Fiskdisk 5/6, 83 %) med liten stapel/ring. Områdets färg ändras inte av status. Klick på område → Uppgifter filtrerat på området, och därifrån vidare på kategori.

## Mobil

Rader med stora tryckytor, rulldown vid tap, stora knappar för Markera klar, Ta bild och Mer info.

## Tekniska detaljer

- Migration: nya kolumner på `checklist_items` och `checklist_template_items` (`assigned_staff_id`, `completed_by_staff_id`, `specific_time`, `time_from`, `time_to`, `daypart`, `estimated_minutes`, `instructions jsonb`, `important_note`, `requires_photo`, `category_id`), ny tabell `task_categories` (namn, färg, ikon, butik/global) med grants och RLS enligt befintligt mönster, samt engångsmigrering av befintlig fritextkategori.
- Referensbilder och slutförandebilder ligger i `entity_images` med `image_kind` (`reference` / `completion`) och koppling till uppgift, mall, område och fotograf.
- Frontend: ny `src/pages/Tasks*`-vy (`TaskListPage`, `TaskRow` med accordion, `TaskDetailPage`), delade hooks i `useChecklist.ts` utökade med tilldelning, tidsmodell och foto-krav. `useStoreMap`/`mapStatus` återanvänds för områdesprogress.
- Etapper: 1) migration + tidsmodell/kategorier, 2) ny Dagens uppgifter med rulldown, 3) detaljsida med historik och bilder, 4) standarduppgifter/schemaläggning, 5) kartkopplingar båda vägar.
- Verifiering: typecheck, vitest för tidsgruppering och fotokrav, samt inloggad genomgång i webbläsaren av avbockning, fotokrav och kartfilter.
