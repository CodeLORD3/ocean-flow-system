# Områden i områden, egna taggar — och kartan stannar i Uppgifter

## Det här ändras

**1. Objektbiblioteket tas bort som arbetssätt**
Listan med färdiga objekt (Fiskdisk, Kassadisk, Hylla, Arbetsbänk, Vask …) försvinner ur redigeringspanelen. I stället arbetar man så här:

- Du ritar in en yta på kartan och ger den ett namn.
- Du sätter dina **egna taggar** på ytan (fritext, t.ex. `fiskdisk`, `kyla`, `vakuum`) — inga fasta kategorier.
- Inuti en yta kan du rita **nya ytor**: område i område, i hur många nivåer du vill.
- Varje yta — även den innersta — har sitt eget innehåll: bilder, checklistor, uppgifter, information om verktyg och utrustning, avvikelser och historik.

Befintliga objekt på kartorna ligger kvar och fungerar som förut. Inget raderas.

**2. Så navigerar man**
Helbild av butiken → tryck på en yta → ytans egen sida med en brödsmulerad väg (`Butiken › Beredning › Vask`). På ytans sida ligger kartan över just den ytan högst upp, under den de ytor som finns inuti som tryckbara kort, och därunder allt innehåll. Ett tryck på en underyta går in ett steg djupare; vägen tillbaka syns alltid.

**3. Taggarna blir sökbara**
Taggar visas som chips på ytan och i ytlistan. Tryck på en tagg för att se alla ytor med samma tagg. Sökrutan i kartan söker på namn och tagg.

**4. Kartan stannar kvar i Uppgifter**
I dag hoppar "Gå vidare"/"Öppna området" från Uppgifter över till fliken Översikt. Det ändras: är du i Uppgifter stannar du i Uppgifter. Områdets sida, hela kartan, ytlistorna och redigeringen visas inne i uppgiftsfliken — samma funktioner som i Översikt, ingen flikbyte, och tillbakavägen leder tillbaka till dina uppgifter.

## Teknisk del

Databas (en migration):
- `map_zones.parent_zone_id uuid references map_zones(id) on delete set null` + index.
- `map_zones.tags text[] not null default '{}'` + GIN-index.
- Inga GRANT/RLS-ändringar behövs (kolumner på befintlig tabell).

Frontend:
- `useStoreMap.ts`: `MapZone` får `parent_zone_id` och `tags`; `saveZone` skriver båda; ny hjälpare för barn-ytor och taggmängd.
- `src/pages/StoreMap.tsx`: `ObjectLibrary`-kortet byts mot ett kort "Yta och taggar" (namn, taggredigerare, "Rita en yta inuti den här") och `addObject` tas ur panelen. Ny prop `openZoneId` + `onOpenZone` så en förälder kan styra vilken yta som visas; ny prop för att dölja tabbraden vid inbäddning behålls som i dag. `ObjectLibrary.tsx` raderas.
- Ny `ZoneBreadcrumb` och barnyte-kort i `ZoneAreaPage.tsx`; kartan i `mapSlot` ritar förälderns yta med barnen inuti. Kort för "Utrustning & material" på ytan (befintliga resursdata) ingår.
- `FloorPlanCanvas`: ritning av ny yta kan ta emot `parentZoneId` så barnet klipps till förälderns yta.
- `src/pages/Uppgifter.tsx`: `onOpenZone` sätter lokalt state i stället för `switchTab("/store-map?…")`; den inbäddade `StoreMap` får `openZoneId` och visas i samma flik, och `TaskZoneMap` behåller filtrering vid första tryck.

Oförändrat: `stock_movements` som enda lagerväg, FEFO, bolagsseparation, bildbibliotekets `image_links`, uppgifternas tidmätning, behörigheter.
