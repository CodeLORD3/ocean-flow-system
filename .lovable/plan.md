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

Uppladdningen kräver ingen klassificering: bilderna skapas direkt som oplacerade med rätt uppladdare och syns omedelbart i massvyn. På dator markerar du med Skift+klick för intervall, Ctrl/Cmd+klick för enstaka, Ctrl/Cmd+A för alla synliga och Esc för att avmarkera. Längst ned visas "37 markerade" med Placera, Koppla, Taggar, Bildroll och Mer — små val, inga stora formulär.

**Snabbläge** klassificerar en bild i taget med *Spara & nästa*, där föregående val ligger kvar som förslag, och styrs nästan helt från tangentbordet: vänster/höger byter bild, Enter sparar och går vidare, Esc stänger, 1–6 väljer vad bilden visar. Kortkommandona visas diskret. Gjort för hundratals bilder.

## Bilderna syns där de hör hemma

Samma bild (samma media_id, aldrig kopior) visas automatiskt på områdessidan, på sakens kort i Utrustning & material, på uppgiften, under "Så ska det se ut" när den är referensbild, och tillsammans med iakttagelsen.

## Ta bort koppling är inte att radera bilden

Tas Lax bort från en bild som också hör till Fiskdisk och Bygga fiskdisk försvinner bara den kopplingen — bilden och övriga kopplingar ligger kvar. Att radera själva bilden är en egen handling med bekräftelse, för chef och administration.

Profilbilderna hålls tillräckligt stora för att man direkt ser vem som gjort vad, både på korten och i aktiviteten.

## Oplacerad, delvis klar, klar

Varje bild visar diskret hur långt sorteringen kommit, och systemet räknar ut det själv — ingen väljer status för hand. Det är arbetsstatus, aldrig ett betyg, och visas neutralt utan röd markering.

- **Oplacerad**: bilden finns, inget mer behövs för att spara. Anna kan ta 15 bilder och trycka Spara.
- **Delvis klar**: klassificeringen är påbörjad men något krävs ännu — t.ex. butik valt men inte område, eller Sak/verktyg valt utan vald sak. Helt okej att lämna och fortsätta senare.
- **Klar**: minimikravet för vald typ finns — butik + område, vald sak, vald produkt, vald uppgift, eller en iakttagelse med sin plats. Titel, beskrivning, taggar och exakt position krävs aldrig.

Biblioteket visar "23 oplacerade — Sortera" och "8 delvis klara — Fortsätt", som startar snabbläget direkt i just de bilderna. Status räknas om automatiskt när en koppling läggs till, ändras eller tas bort, och massklassificering gör samma sak: 37 oplacerade bilder som får Zollikon → Fiskdisk → Område/plats blir klara i ett svep. I aktiviteten står den mänskliga händelsen — "Robin klassificerade bilden · Fiskdisk · Zollikon" — inte den tekniska statusändringen.

## Teknisk lösning

- **Utöka `entity_images`** i stället för en ny media-tabell: nya kolumner `description`, `media_kind` (område/sak/produkt/iakttagelse/uppgift/annat), `status` (`unclassified`/`partial`/`classified`), `captured_at`, `tags text[]`, `uploaded_by_staff_id`, `last_edited_by_staff_id`, `last_edited_at`. Nuvarande `entity_type`/`entity_id` behålls som bildens hemvist så allt befintligt fortsätter fungera.
- **En gemensam statusfunktion** (`deriveImageStatus(image, links, observation)`) används överallt — ingen komponent definierar själv vad "Klar" betyder. Den körs vid uppladdning, klassificering, massredigering, snabbläge och när en länk läggs till eller tas bort, och skriver `status` på bilden. Statusfältet lagras för snabb filtrering men är alltid härlett, aldrig manuellt satt. Ren statusändring loggas inte som egen händelse utan ingår i den mänskliga klassificeringshändelsen.
- **`image_links`** (media_id → entity_images, `entity_type`: store, zone, location, resource, product, task, task_template, observation; `entity_id`, `relation_type`: overview, reference, before, after, proof, instruction, documentation, contains; `created_by_staff_id`, unik per media+entity+relation) är den primära sanningen om vad en bild hör till. `entity_type`/`entity_id` på bilden är hemvist för bakåtkompatibilitet och skrivs aldrig om automatiskt när en ny länk skapas. Frontend läser i första hand länkarna; befintliga vyer fortsätter läsa hemvisten under övergången.
- Ingen dubbellagring: område sparas som `zone_id`, sak som `resource_id`, produkt som `product_id`, person som `staff_id`. Namn och profilbilder hämtas alltid från källan, så ett namnbyte på Fiskdisk syns direkt på bilderna.
- Att ändra område rör bara områdeskopplingen — produkt-, uppgifts- och sakkopplingar ligger kvar. `uploaded_by_staff_id` är permanent; bara `last_edited_by_staff_id`/`last_edited_at` uppdateras.
- **`image_activity`** (media_id, staff_id, `action_type`: uploaded, edited, classified, reclassified, linked, unlinked, set_as_reference, `change_group_id`, `field_name`, `old_value`, `new_value`, created_at). Endast insert; ingen update/delete-policy.
- **`image_observations`** för iakttagelser (butik, område, plats, typ, kommentar, staff) kopplas via `image_links` med entity_type `observation`. Ingen Kaizen-logik byggs nu.
- GRANT + RLS enligt befintligt mönster: personal (authenticated) får läsa och skriva bilder, länkar och aktivitet; aktivitet kan inte ändras eller raderas.
- Frontend: nya hookar `useImageLibrary`, `useImageLinks`, `useImageActivity`, `useBulkClassify`; nya komponenter `AddImageFlow`, `ImageClassifySheet`, `ImageLibraryGrid`, `ImageBulkBar`, `ImageQuickClassify`, `ImageActivityTimeline`, `ImageLinksPanel` som byggs in i `src/pages/ImageFeed.tsx`, `ImageLightbox.tsx`, `ZoneAreaPage.tsx`, `ResourceRegister.tsx`, `TaskDetail.tsx` och produktbilderna. `StaffFace`/`StaffName` används för alla profilbilder, `thumbUrl` för snabba miniatyrer.
- Befintlig bucket, komprimering (`prepareUpload`), kommentarer, hjärtan, bildmarkeringar, favoriter och kartmarkörer rörs inte.
- **Säker migration av de 1 249 befintliga bilderna**: backfillen skapar bara den nya strukturen — fil, bucket-path, hemvist, kommentarer, hjärtan, favoriter, markeringar, kartkopplingar och tidsstämplar lämnas orörda. Varje bild får sin första `image_link` från nuvarande hemvist. Uppladdaren kopplas till `staff_id` bara när matchningen är säker; annars visas neutralt "äldre bild" utan gissning.
- Status för befintliga bilder härleds med samma funktion från det som faktiskt finns: en bild med giltig identifierbar hemvist (butiksbild, produktbild, områdesbild) blir klar, en med ofullständig information blir delvis klar eller oplacerad. Ingen befintlig bild markeras oplacerad bara för att modellen är ny, och inga relationer gissas fram.
- **Prestanda**: rutnätet använder `thumbUrl`, lazy-load och sidvis inläsning (infinite scroll), filtrering och sök körs i databasen, kopplingar hämtas för synliga bilder och aktivitet först när en bild öppnas. Originalbilden laddas bara i stor visning. Ska kännas snabbt vid 10 000+ bilder.
- Strukturen lämnar plats för framtida förslag (föreslaget område, produkt, taggar, jämförelse mot referensbild) i ett eget förslagsfält — ingen automatisk klassificering byggs nu, människan bekräftar informationen.

## Kontroll före leverans

Först kontrolleras att befintliga bilder fungerar precis som förut efter migrationen: en gammal butiksbild, portalbild, produktbild, orderradsbild och områdesbild — och att en gammal bild kan få en ny koppling utan att dess gamla användning slutar fungera.

Därefter provkörs på 390 px och 1280 px: ta foto → klassificera → spara; spara som oplacerad och låt en annan person klassificera; massuppladdning med flervalsredigering; Spara & nästa med Enter; rättning av område som visas i tidslinjen med gammalt → nytt värde; samma bild syns på områdessidan, saken och uppgiften. Provdata städas bort efteråt.
