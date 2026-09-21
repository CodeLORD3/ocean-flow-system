# Centralt bildbibliotek i Bildflödet

Bildflödet byggs ut till MAKRILLTRADEs bildbibliotek. En bild laddas upp en gång och kan sedan höra till flera ställen: butik, område, plats, sak, produkt, uppgift eller en iakttagelse. Inget nytt bildsystem vid sidan om — samma bilder, samma lagring, samma personalprofiler och samma behörigheter som idag.

Idag finns 1 249 bilder (butiker, portaler, produkter, orderrader, områden). De behålls precis som de är och blir bibliotekets grund; deras nuvarande tillhörighet blir bildens första koppling.

## Lägga till bild

En tydlig knapp **Lägg till bild** med *Ta foto* och *Ladda upp*. På telefon är Ta foto stort och först; på dator kan man släppa in 100 bilder på en gång. Kommer du från Zollikon → Fiskdisk är butik och område redan ifyllda.

Efter bilden frågar systemet **Vad visar bilden?** med stora val: Område/plats, Sak/verktyg, Vara/produkt, Iakttagelse, Uppgift/arbete, Annat. Bara nästa fråga visas åt gången.

- **Område/plats**: butik, område (eller *Välj på kartan* som öppnar butikskartan), valfri plats och position, sedan bildroll (översikt, referensbild, dokumentation, före, efter, annat).
- **Sak/verktyg**: sök i Utrustning & material och koppla till befintlig sak; *Skapa ny sak* bara när den saknas.
- **Vara/produkt**: sök i produktregistret och koppla; ny produkt bara när den saknas.
- **Iakttagelse**: var, sedan Något är fel / Kan förbättras / Bra exempel / Före / Efter / Annat och valfri kommentar — klart på några sekunder.
- **Uppgift/arbete**: uppgiften följer med automatiskt, du väljer bara bildens roll (bevis, före, efter, instruktion, referens, dokumentation).

Man ska också kunna spara direkt som **Oplacerad** och låta någon annan sortera senare — helt normalt, ingen varning.

## Biblioteket

Bildflödet får ett visuellt rutnät som känns som ett fotoalbum, med flikarna Alla, Områden, Saker, Produkter, Uppgifter, Iakttagelser och Oplacerade, plus filter på butik, område, person, datum, bildroll, sak, produkt och uppgift, samt fritextsök på titel, beskrivning, taggar och plats.

Bildkortet visar bilden först, sedan profilbild och namn, vad/var och tid, och bildrollen som liten text. Redigerad visas diskret.

## Öppna en bild

Bilden dominerar. Bredvid: titel, beskrivning, *Upplagd av* med profilbild och tid, butik, område, plats, bildroll, kopplingar, taggar och *Senast redigerad av*. Knapparna **Redigera** och **Visa aktivitet**.

All information kan rättas i efterhand av personalen — titel, beskrivning, typ, butik, område, plats, position, roll, sak, produkt, uppgift, taggar — utan att bilden laddas upp igen. Upplagd av ändras aldrig.

## Aktivitet och historik

Varje bild får en mänsklig tidslinje med profilbilder: "Anna lade upp bilden", "Robin ändrade område Korridor → Fiskdisk", "Vilma kopplade bilden till Bygga fiskdisk". Ändras flera fält i samma sparning blir det en händelse — "Robin redigerade informationen · 3 ändringar · Visa ändringar" — med gamla och nya värden kvar. Inget rött, inget tekniskt språk. Historik kan bara läggas till, aldrig ändras.

## Massuppladdning och snabbläge

Efter uppladdning: "47 bilder uppladda" i rutnät med flervalsrutor. Markera t.ex. 12 och sätt butik, område, typ, bildroll och taggar i ett svep — varje bild får en egen historikhändelse märkt "Via massredigering".

**Snabbläge** klassificerar en bild i taget med *Spara & nästa*, där föregående val ligger kvar som förslag. På dator: Enter sparar och går vidare, vänster/höger byter bild. Gjort för hundratals bilder.

## Bilderna syns där de hör hemma

Samma bild (samma media_id, aldrig kopior) visas automatiskt på områdessidan, på sakens kort i Utrustning & material, på uppgiften, under "Så ska det se ut" när den är referensbild, och tillsammans med iakttagelsen.

## Teknisk lösning

- **Utöka `entity_images`** i stället för en ny media-tabell: nya kolumner `description`, `media_kind` (område/sak/produkt/iakttagelse/uppgift/annat), `status` (`classified`/`unclassified`), `captured_at`, `tags text[]`, `uploaded_by_staff_id`, `last_edited_by_staff_id`, `last_edited_at`. Nuvarande `entity_type`/`entity_id` behålls som bildens hemvist så allt befintligt fortsätter fungera.
- **`image_links`** (media_id → entity_images, `entity_type`: store, zone, location, resource, product, task, task_template, observation; `entity_id`, `relation_type`: overview, reference, before, after, proof, instruction, documentation, contains; `created_by_staff_id`, unik per media+entity+relation). En backfill lägger in varje befintlig bilds nuvarande tillhörighet som första länk.
- **`image_activity`** (media_id, staff_id, `action_type`: uploaded, edited, classified, reclassified, linked, unlinked, set_as_reference, `change_group_id`, `field_name`, `old_value`, `new_value`, created_at). Endast insert; ingen update/delete-policy.
- **`image_observations`** för iakttagelser (butik, område, plats, typ, kommentar, staff) kopplas via `image_links` med entity_type `observation`. Ingen Kaizen-logik byggs nu.
- GRANT + RLS enligt befintligt mönster: personal (authenticated) får läsa och skriva bilder, länkar och aktivitet; aktivitet kan inte ändras eller raderas.
- Frontend: nya hookar `useImageLibrary`, `useImageLinks`, `useImageActivity`, `useBulkClassify`; nya komponenter `AddImageFlow`, `ImageClassifySheet`, `ImageLibraryGrid`, `ImageBulkBar`, `ImageQuickClassify`, `ImageActivityTimeline`, `ImageLinksPanel` som byggs in i `src/pages/ImageFeed.tsx`, `ImageLightbox.tsx`, `ZoneAreaPage.tsx`, `ResourceRegister.tsx`, `TaskDetail.tsx` och produktbilderna. `StaffFace`/`StaffName` används för alla profilbilder, `thumbUrl` för snabba miniatyrer.
- Befintlig bucket, komprimering (`prepareUpload`), kommentarer, hjärtan, bildmarkeringar, favoriter och kartmarkörer rörs inte.

## Kontroll före leverans

Provkörs på 390 px och 1280 px: ta foto → klassificera → spara; spara som oplacerad och låt en annan person klassificera; massuppladdning med flervalsredigering; Spara & nästa med Enter; rättning av område som visas i tidslinjen med gammalt → nytt värde; samma bild syns på områdessidan, saken och uppgiften. Provdata städas bort efteråt.
