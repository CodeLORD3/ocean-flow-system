# Större profilbilder överallt

Idag är de flesta profilbilderna 16–20 px — man ser en färgfläck, inte ansiktet. De ska upp i storlek, men fortfarande ligga snyggt i listor och rader utan att flytta texten.

## Ny storleksskala

| Var | Idag | Nytt |
| --- | --- | --- |
| Bild vid namn i listor, bildtexter, bildflödet | 16–20 px | 28 px |
| Bild i bildrader och ljusbox | 16–24 px | 28–36 px |
| Personal som arbetar nu (staplade små ansikten) | 20 px | 28 px |
| Väljare av personal, huvudmenyns eget ansikte, uppgifter | 24–32 px | 36 px |
| Rader i personallistan | 48 px | 56 px |
| Personkortets bild i dialoger | 64 px | 80 px |
| Egen profilsida | 80 px | 112 px |

Initialerna som visas när bild saknas växer med, så de fortfarande är läsbara.

## Berörda vyer

Butikens bildrad och områdesvyer, bildflödet, stor bild (ljusbox), kundbeställningar ("Inlagd av"/"Packad av"), personalväljaren, personallistan och personkortet, egen profilsida, arbetar-nu-raden och schemat, uppgifter och viktiga papper.

## Teknisk lösning

- `src/components/staff/StaffNameAvatar.tsx`: `StaffFace` grundstorlek `h-5 w-5 text-[8px]` → `h-7 w-7 text-[11px]`. Anropare som skickar egen storlek uppdateras i samma steg: `StorePhotoStrip.tsx` (`h-4 w-4` → `h-7 w-7`), `ImageLightbox.tsx` (`h-4 w-4` → `h-7 w-7`, `h-6 w-6` → `h-9 w-9`), `EntityImageGallery.tsx` (matchande höjning).
- `src/components/orders/OrdererName.tsx`: `xs` `h-4 w-4` → `h-7 w-7`, `sm` `h-5 w-5` → `h-8 w-8`, fallback-text `text-[8px]` → `text-[10px]`.
- `src/components/staff/StaffAvatar.tsx`: grund `h-8 w-8` → `h-9 w-9`; anropare med `h-7 w-7`/`h-8 w-8` (`ImportantPapers.tsx`, `TaskDetail.tsx`, `Uppgifter.tsx`, `TaskRow.tsx`, `DailyReportsArchive.tsx`, `ChatPanel.tsx`) höjs ett steg.
- `src/components/livestaff/OnDutyAvatars.tsx`: `h-5 w-5` → `h-7 w-7`, initialer `text-[8px]` → `text-[10px]`; överlappet (`-ml-*`) justeras så staplingen fortfarande ser hel ut.
- `src/components/staff/OnDutyStaff.tsx`: chipbilden `h-3.5 w-3.5` → `h-5 w-5`, chippet får lite mer höjd.
- `src/components/orders/StaffPicker.tsx` och `src/components/AppLayout.tsx`: `h-6 w-6` → `h-9 w-9`.
- `src/components/staff/StoreStaffDialog.tsx`: `h-7 w-7` → `h-9 w-9`.
- `src/pages/Staff.tsx`: listrad `h-12 w-12` → `h-14 w-14`, kort `h-16 w-16` → `h-20 w-20`; `src/components/staff/StaffDetailDialog.tsx` `h-16 w-16` → `h-20 w-20`.
- `src/pages/StaffProfile.tsx`: `h-20 w-20` → `h-28 w-28`, kameraknappen behåller sin position i nedre hörnet.
- Radhöjder och `truncate` behålls, inga nya färger eller hårdkodade värden; kontroll med typecheck och skärmbild i 390 px så mobilraderna inte blir högre än nödvändigt.
