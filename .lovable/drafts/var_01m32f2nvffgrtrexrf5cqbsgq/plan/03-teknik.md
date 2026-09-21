# Tekniskt

Inga databasändringar. Allt läses ur befintliga tabeller.

## Datakällor per händelsetyp

| Händelse | Källa |
| --- | --- |
| Uppgift utförd | `checklist_items.completed_by_staff_id` + `done_at`, dag via `checklist_days` |
| Uppgift tilldelad | `checklist_items.assigned_staff_id` (+ `checklist_days.report_date`) |
| Bild utlagd / ändrad | `entity_images.uploaded_by_staff_id`, `last_edited_by_staff_id` |
| Bildhändelser (kategorisering, utsnitt) | `image_activity` |
| Bildkommentar | `entity_image_comments` |
| Iakttagelse | `image_observations` |
| In-/utstämpling | `staff_shifts` |
| Övriga systemändringar | `activity_logs.performed_by` (matchas på hela namnet, som idag) |
| Inloggningar (endast admin) | `user_sessions`, `page_visits` via befintliga `useStaffActivity`-hookar |

## Filer

- `src/pages/PersonPage.tsx` — ny sida, läser `:id`, bygger toppkort, sifferrad, flikar.
- `src/hooks/usePersonTimeline.ts` — en hook som hämtar ovanstående källor parallellt (limit per källa), normaliserar till `{ id, at, kind, title, meta, route? }` och sorterar fallande.
- `src/components/staff/PersonTimeline.tsx` — dagsgrupperad tidslinje (återanvänder dagsrubrikmönstret från bildflödet och `StaffFace`).
- `src/components/staff/PersonHeader.tsx` — profil, kontakt, instämplingschip (`useOpenShifts`).
- `src/lib/personEvents.ts` — ikon, etikett och målrutt per händelsetyp (uppgift → `/uppgifter?markera=`, bild → `/image-feed?bild=`, område → `/store-map?zone=`).
- Rutt `/person/:id` registreras i `src/components/KeepAliveTabs.tsx` och läggs i `src/lib/pageAccess.ts` för butik + grossist + admin. Fliken `Inloggningar` visas bara för admin och återanvänder `StaffActivityPanel`.
- Namn/profilbilder blir länkar: `src/pages/Staff.tsx`, `src/components/staff/StaffDetailDialog.tsx` (knapp "Öppna personens sida"), `src/pages/LiveStaff.tsx`, samt `StaffFace`-användningen i bildflödet.

## Prestanda

Varje källa hämtas med `limit` (100) och `order by` fallande, filtrerad på personens id — inga frågor per rad. Flikarna `Bilder`/`Uppgifter` filtrerar samma redan hämtade data.
