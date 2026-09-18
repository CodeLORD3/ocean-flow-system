# Bildgrupper och bildarkiv

## Vad du får

**1. Dagsgrupper automatiskt**
Bilder samlas av sig själva per dag: Idag, Igår, sedan veckodag + datum — samma färgspråk som redan används i butiksöversikten. Varje dagsgrupp får en egen rubrik du kan skriva en beskrivning till, t.ex. "Ombyggnad av disken".

**2. Egna grupper**
Du kan markera flera bilder (bocka i) och samla dem i en egen grupp med namn och beskrivning, t.ex. "Skada i kylen" eller "Nya skyltar". En bild kan ligga i flera grupper. Grupper kan döpas om, beskrivas och tas bort utan att bilderna försvinner.

**3. Beskriv varje bild**
Bildtext går redan att skriva i bildvisaren; den blir tydligare och nåbar direkt i rutnätet, med namn och tidpunkt på den som skrev.

**4. Bildarkiv när du gör en uppgift**
När en uppgift kräver bild får du tre val i samma ruta:
- Ta foto
- Från bibliotek (flera bilder)
- Sök i bildarkivet — sök på bildtext, person, yta, grupp eller dag, och koppla en befintlig bild till uppgiften

## Teknik

**Databas (ny tabell + kopplingstabell)**
- `image_groups`: id, entity_type, entity_id (butik/portal), name, description, kind ('day' | 'manual'), day_key (för dagsgrupper), created_by/-_name, created_at. GRANT till authenticated/service_role, RLS via `is_staff()`.
- `image_group_items`: group_id, image_id (FK → entity_images, on delete cascade), sort_order, unique(group_id, image_id). Samma grants/RLS.
- Dagsgrupper skapas inte i förväg — de räknas fram från `created_at` i klienten. Raden i `image_groups` skapas först när någon skriver en beskrivning till dagen (kind='day', day_key='2026-09-17').

**Frontend**
- `src/hooks/useImageGroups.ts`: läs grupper per entitet, skapa/uppdatera/ta bort grupp, lägg till/ta bort bilder, samt dagsbeskrivning (upsert på day_key).
- `src/components/images/EntityImageGallery.tsx`: markeringsläge finns redan (`selection`) — bygg vidare med "Samla i grupp", gruppflik vid sidan av Utvalda/Favoriter/dagar, dagsrubriker med beskrivningsrad, och gruppkort med namn/antal/beskrivning.
- `src/components/images/ImageArchivePicker.tsx` (ny): dialog med sökfält, dagsgrupper, egna grupper och flerval; returnerar valda bild-id.
- `src/components/tasks/TaskDetail.tsx` och uppgiftsraden: bildknapparna blir Ta foto / Bibliotek / Sök i arkiv, där arkivvalet sätter `checklist_item_id` på befintlig bild (kopia av raden om bilden hör till annan yta, så originalet inte flyttas).
- Dagsetiketter och färger återanvänder `src/lib/imageMeta.ts` och `src/lib/dayColor.ts`.

**Ingen ny lagring** — bilderna ligger kvar där de ligger, grupper är bara kopplingar.
