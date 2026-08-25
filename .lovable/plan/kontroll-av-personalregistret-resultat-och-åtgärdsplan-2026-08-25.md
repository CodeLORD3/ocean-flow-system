# Kontroll av personalregistret — resultat och åtgärdsplan

Jag har gått igenom de fem punkterna mot koden och mot skarpa databasfrågor. Tre punkter håller, två gör det inte, och två går inte att avgöra förrän testdata finns.

## Vad kontrollen visar

**1. Person som finns i Personalkollen — pk-matchning och bolag**
19 pk_staff-poster är kopplade till en person i registret, men **0 av dem matchar på identisk e-post** (pk-posterna saknar e-post eller har en annan adress), så "e-post = automatisk" stämmer inte i praktiken. Dessutom visar personkortet i dag **ingenting** om pk-kopplingen: ingen märkning "Kopplad till Personalkollen", ingen matchningskälla. Bolaget visas bara som råkod (`fsab-se`) i stället för bolagsnamn.

**2. Person med två anställningar**
Tidslinjen finns och visar datumintervall, avtalsområde, anställningsform och anställningsnummer per bolag — men **ingen person i registret har i dag mer än en anställning**, så den faktiska vyn är inte bevisad. Behöver testdata.

**3. LAS-varning för särskild visstid**
Varningen utlöses bara om fältet `conversion_date` är ifyllt manuellt. En visstidsanställning med start 11 månader bakåt ger därför **ingen varning** — konverteringsdatumet räknas aldrig ut automatiskt.

**4. Dokument på en person**
Metadatan är rätt skyddad (bara personer som får se personen ser posten). Men **själva filen är inte det**: läsregeln på filarkivet är "vilken personal som helst", vilket innebär att en butikschef för en annan enhet kan öppna filen. Punkten faller alltså. Dessutom kan en butikschef inte ladda upp alls — skrivregeln kräver admin/grossist.

**5. Personnummer maskerat**
Håller. Ingen vy visar klartext; listan och kortet visar bara maskerat värde, och klartext går bara att hämta via serverfunktion med loggning.

## Åtgärder

### A. Filarkivet ska följa samma behörighet som personen (viktigast)
Byt läsregeln på personaldokument-arkivet från "all personal" till samma bedömning som personposten: filens mapp är personens id, och åtkomst ges bara om användaren får se den personen. Skrivning/borttagning tillåts för admin/grossist samt butikschef för egen enhet. Verifieras med skarp fråga per konto, inte bara policytext.

### B. Automatiskt konverteringsdatum för visstid
Räkna ut konverteringsdatum vid sparande när formen är särskild visstid eller vikariat (start + 12 månader, ackumulerat inom femårsperiod om personen har tidigare visstidsrader hos samma bolag). Fältet blir förifyllt men går att justera manuellt. Varningsfönstret utökas från 30 till 60 dagar så en anställning som passerar 11 månader syns i god tid.

### C. Pk-matchning synlig på personkortet
Visa en rad på personkortet: kopplad till Personalkollen (namn/anställningsnummer) eller "ej kopplad", med knapp för att koppla/koppla bort. Matchningen körs på e-post först, därefter maskerat personnummer, sist namn som förslag. Bolag visas med bolagsnamn i stället för kod, både på kortet och i tidslinjen.

### D. Testdata för punkt 2 och 3
Skapa en testperson med två anställningar i olika bolag (butik + tjänsteman, olika anställningsnummer) och en visstidsanställning med start 11 månader bakåt, så tidslinjen och LAS-varningen kan verifieras skarpt. Testposterna tas bort efter kontrollen.

## Teknisk sammanfattning

- `storage.objects`: ersätt policyn `Staff read personaldokument` (`bucket_id='personaldokument' AND is_staff()`) med en som anropar `can_see_employee((storage.foldername(name))[1]::uuid)`; nya insert/update/delete-policys för `is_staff_manager() OR can_see_employee(...)`.
- `src/hooks/useEmployees.ts`: `lasWarnings` får 60-dagarsfönster; ny hjälpfunktion som räknar ut konverteringsdatum, används i `EmploymentForm.submit`.
- `src/components/employees/EmployeeDialog.tsx`: pk-status-rad, bolagsnamn via `useLegalEntities` i stället för `legal_entity_id`.
- `src/components/employees/EmploymentForm.tsx`: förifyllt `conversion_date` med hjälptext.
- Verifiering: policyuttryck utvärderas per användar-token direkt i databasen (samma metod som förra RLS-testet) och rapporteras med siffror.
