# Checklistor i Översikt + bilder kopplade till områden

## 1. Dagens uppgifter direkt i Översikt

En ny panel under statistikraden, ovanför kartan:

- Lista med **alla uppgifter för valt datum** i butiken (samma rader som checklistsidan — bockar man av här bockas det av där, direkt).
- Är uppgiften kopplad till ett område på kartan får raden **områdets färg** och områdets nummer/namn. Saknas koppling visas den som "Ingen plats".
- Klick på områdesmärket hoppar till området på kartan.
- Progressring med procent och rött/gult/grönt, som idag i statistikraden.

### Sortering och filter

Två rader med filterknappar:

1. **Område** — Alla, plus en knapp per yta i butiken i ytans färg (t.ex. "5. Lager").
2. **Arbetstyp** — Alla, Städning, Temperatur, Rapporter, Beställning, Underhåll, Personal, Övrigt.

Plus växlare: Kvar / Klara / Allt, och gruppering per pass (morgon/kväll) som idag.

Arbetstyp blir ett eget val på uppgiften (i mallen och på dagens rad), inte fritext. Befintliga uppgifter får en arbetstyp automatiskt utifrån dagens rubriker (t.ex. "Golv och avlopp" → Städning, "Kyl och frys" → Temperatur, "Kassa och administration" → Rapporter). Allt som inte matchar blir Övrigt och kan ändras i mallen.

## 2. Bilder kopplas till plats — och blir filtrerbara

- Varje uppgift i listan får en **kameraknapp**. Bilden sparas på uppgiftens område (och på exakt punkt om uppgiften sitter på ett objekt), med uppgiften och fotografen sparade på bilden.
- Tar man en bild på en uppgift utan område får man välja yta i en liten lista innan bilden sparas.
- I "Alla bilder": nya filter för **område** (t.ex. bara Lager) och **fotograf**, ovanpå den befintliga dagsgrupperingen (Idag / Igår / veckodag med färgbyte). Filtren räknar antal, så man ser direkt hur många bilder som finns per yta.
- Bildkortet och stora bildvyn visar område, uppgift bilden hör till, vem som tog den och när.

## 3. Områdessidan

På en ytas egen sida visas samma sak filtrerat till ytan: ytans uppgifter för dagen, ytans bilder per datum, och vem som gjorde vad.

## Tekniska detaljer

**Databas (migration):**
- `checklist_items.work_type` och `checklist_template_items.work_type` (text, nullable) + engångsuppdatering som sätter arbetstyp från befintlig `category`/`section` via nyckelord.
- `entity_images.checklist_item_id` (uuid, nullable, FK → `checklist_items`, on delete set null) + index på `(entity_type, entity_id, created_at desc)`.
- Inga nya tabeller; bilder ligger kvar i `entity_images` med `entity_type='map_zone'`, uppgifter kvar i `checklist_items`.

**Frontend:**
- Ny `src/components/storemap/OverviewTaskPanel.tsx` — lista, filter, avbockning, kameraknapp. Använder `useMapTasks`, befintlig toggle-mutation i `useChecklist`, `useMapZones`, `useUploadEntityImage`.
- `src/lib/workType.ts` — fasta arbetstyper, ikon/färg och nyckelordsmappning (enhetstestas).
- `StorePhotoStrip.tsx` — filterrad för område och fotograf, räknare, filtrerad lightbox-lista.
- `useEntityImages.ts` — `checklistItemId` i upload, fält i typen; `useStoreImages` som hämtar butikens och kartans bilder i en fråga med `uploaded_by_name`.
- `ChecklistTable.tsx` / mallredigeraren — arbetstyp som val i stället för fritext, samt val av område per uppgift.
- `ZoneAreaPage.tsx` — återanvänder samma panel filtrerad på ytan.

**Verifiering:** typecheck, vitest för arbetstypsmappning och filterlogik, samt inloggad genomgång i webbläsaren: bocka av en uppgift i Översikt och se att checklistsidan följer med, ladda upp en bild från en uppgift och filtrera fram den på område.
