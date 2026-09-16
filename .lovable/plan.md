# Butikskarta — steg 2: riktig geometri, pastellzoner och bilder på exakt plats

## Vad som redan finns (steg 0, kontrollerat i kod och databas)

| Koncept | Finns som | Butikskartan gör |
| --- | --- | --- |
| Butik | `stores` + befintlig butiksväljare | Planen pekar på samma `store_id` |
| Inloggad person | `StaffAuthContext`, `staff`, `user_roles`, `user_scopes` | Bilder, uppgifter, punkter märks med samma person |
| Behörighet | `has_role`, `can_see_store`, `pageAccess` + RLS | Personal ser, admin redigerar |
| Uppgifter | `checklist_items` (+ `zone_id`, `map_object_id`) och `useToggleChecklistItem` | Samma rad som checklistsidan, live via realtid |
| Bilder | `entity_images` + befintlig uppladdning/komprimering, bucket `logos` | Samma bildsystem, `entity_type = 'map_zone'` |
| Anmärkning/avvikelse | `deviations` med `source`/`source_id` | Ingen ny avvikelsemodell |
| Historik | `activity_logs` | Zonens aktivitetsflöde |
| Karta | `floor_plans`, `floor_plan_versions`, `map_geometry`, `map_zones` (har redan `points`, `area_sqm`), `map_object_types`, `map_objects`, `map_pins` | Byggs vidare, inget nytt parallellt |

Slutsats: nästan allt finns. Det som saknas mot din designbild är geometri som följer ritningen, identitetsfärger, bilder på exakt plats i en yta, skalkalibrering och tydligare zonredigering.

## Ny data — bara två tillägg

- `entity_images`: nya nullbara `norm_x`, `norm_y` (0–1 relativt zonens ytterlåda) samt `floor_plan_id`. En bild utan koordinat är en zonbild, en bild med koordinat är en placerad bild. Samma tabell, samma uppladdning.
- `floor_plans`: nya nullbara `calibration` (två punkter + verkligt mått i cm) så skalan kan räknas ut ur ett känt mått.

Inga nya person-, butiks-, uppgifts- eller bildtabeller.

## Kartan

1. **Polygoner istället för rutor.** Zonerna ritas från `map_zones.points` som riktiga SVG-polygoner efter de rosa ytorna i planritningen; rektangelvärdena behålls som fallback och ytterlåda. Fastighetens övriga delar syns inte i personalens läge.
2. **Identitetsfärg.** Pastellpalett (isblå, turkos, mint, sand, persika, lavender, rosa) väljs av admin och ligger kvar. Status visas som liten prick, tunn kantfärg och badge — den skriver aldrig över zonens färg.
3. **Nummerbrickor och legend.** Varje zon får en numrerad bricka som i designbilden, plus en kompakt legendrad under kartan med nummer, namn och m².
4. **Hover.** Färgen förstärks lätt, mjuk skugga, tydligare kant, övriga zoner dimmas svagt, liten tooltip med namn och "2 uppgifter kvar" / "Allt klart". 180 ms, mjuk easing.
5. **Klick.** Zonen behåller markering, kartan blir kvar, laddan öppnas från höger på dator och som bottenpanel i telefon.

## Bilder på exakt plats

- I laddan: "Lägg till bild" → "Placera på ytan". Då tänds ett svagt rutnät bara inuti den valda ytan.
- Klick i ytan sparar `norm_x`/`norm_y` (0–1). Bilden ligger rätt vid omskalning, zoomning, telefon och ändrad rutnätsstorlek.
- På kartan visas små kameramarkörer, inte miniatyrer. Hover: "3 bilder här". Klick öppnar bilderna.
- Reglaget "Visa bilder" tänder och släcker markörerna.
- Finns ingen bild står det "Ingen bild uppladdad" plus "Lägg till bild". Aldrig en genererad bild.
- Laddan får en liten miniplan som visar var i ytan bilderna sitter.

## Redigeringsläge (admin)

- Skapa zon, byt namn, byt pastellfärg, flytta och dra polygonpunkter, lägg till punkt, ta bort punkt, inaktivera zon. Namnbyte ändrar aldrig zonens id, så bilder, uppgifter, historik och avvikelser följer med.
- Originalritningen som eget lager: visa, dölj, opacity, flytta, skala, lås.
- Skalkalibrering: markera en sträcka, ange "denna sträcka = 420 cm", systemet räknar ut bildpunkter per meter och alla ytor visar då korrekt m².
- Utkast och publicerad: admin arbetar i utkastet, personalen ser den publicerade versionen tills admin publicerar. Varje publicering sparar en version som i dag.

## Behörighet

Personal: se karta, öppna zon, bocka av uppgift, ladda upp bild, kommentera. Butiksansvarig: dessutom hantera uppgifter och avvikelser. Admin: redigeringsläge, kalibrering, publicering. Samma roller som i övriga systemet, spärren i RLS.

## Ordning

1. Migration: `norm_x`, `norm_y`, `floor_plan_id` på bilder, `calibration` på planen.
2. Polygonzoner, pastellfärger, nummerbrickor, legend, hover och dimning.
3. Placerade bilder: rutnät i ytan, koordinat, markörer, filter, miniplan i laddan.
4. Zonredigering med polygonpunkter, färgval, kalibrering, ritningslager, utkast/publicera.
5. Zonpolygoner för Zollikon ritade efter de rosa ytorna på planritningen.
6. Genomgång av dina tester 1–12 mot riktig data i inloggat läge.

## Tekniskt

SVG-baserad karta i befintlig `FloorPlanCanvas` (polygonstöd, zoom mot pekaren, panorering, transformerade koordinater), befintliga React Query-hookar och realtidskanal, befintliga shadcn-komponenter, Verktygstema v1 och befintliga tokens. Inga nya bibliotek.
