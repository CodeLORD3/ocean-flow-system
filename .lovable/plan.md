# Slutkontroll före 16 september: stämpelklockan från vägg till lön

Målet är att den 16:e ska nio enheter kunna lita på klockan utan Personalkollen bakom. Arbetet görs i fem block, i ordning, med körbevis per punkt och en driftguide som slutleverans.

## A. Stationen på väggen

- Provkör aktivering på en ren enhet: kod in, station bunden till rätt butik. Kontrollera att koden är engångs (andra enheten avvisas, kräver ny kod), att fel kod ger ett begripligt meddelande, och att stationen överlever omladdning, omstart och utloggad webbläsare.
- Kioskläge: fullskärm eller tydlig uppmaning om det, ingen väg ut ur klockan, och sessionen lever kvar efter 30 minuters vila.
- Ny sidfot i klockvyn: "Den här stationen tillhör: [butik]" så en felaktig aktivering syns direkt.
- Ny adminfunktion: flytta en station till annan butik eller stänga av den, utan att historik försvinner.

## B. Personens flöde

- Instämpling: nummer på knappsatsen, namn och maskerat personnummer, bekräfta, kvittens med tid och butik. Testas med rätt nummer, okänt nummer (avvisas och hamnar i avvikelsekön), ofullständigt nummer, redan instämplad (erbjuds utstämpling) och person med anställning i båda bolagen (stämplingen ska hamna på stationens bolag).
- Utstämpling: ett tryck, kvittens med arbetad tid. Testas även när utstämplingen sker på en annan station än instämplingen.
- Rast: rekommendation är att stänga av rastknappen och låta chefen hantera rastavdrag i attesten. Skälet är att rasttryck i praktiken glöms bort halva gångerna, och en halvfärdig rast ger fel lön medan ett avdrag i attesten alltid går att se och rätta. Beslutet dokumenteras i guiden.
- Personer som inte får stämpla: testpersoner, avslutade anställningar och externa avvisas med tydligt meddelande.

## C. Kedjan fram till lön

- Tre teststämplingar följs hela vägen: tryck, tidrad med journalanteckning, driftbevakningskortet, attestvyn hos rätt butikschef, attest, löneunderlag för period 2026-10.
- Räknekontroller: kvällspass 17–21 ska ge OB 50 mellan 18:15 och 20:00 och OB 70 efter 20:00; ett lördagspass över tolvslaget; ett pass 22–02 med rätt dag, rätt OB och rätt total.
- Testdatan makuleras efteråt med journalförd anteckning.
- Offline: stämpla utan nät, köindikator syns, nät tillbaka, ingen dubblett och tryckets tidpunkt behålls. Även omstart av enheten med osynkad kö.
- Glömd stämpling: schemalagt pass utan stämplingar flaggas nästa morgon, och chefen kan lägga in tiden i attestvyn med anteckning.

## D. Bevakning de första veckorna

- Simulerad Personalkollen-stämpling efter den 16:e ska flaggas per person och dag.
- Daglig attestpåminnelse och attestgrad kontrolleras med testdata.

## E. Slutleverans

Tre dokument nåbara från adminsidan:

1. Aktivera klockstation, en sida, för dig och butikscheferna.
2. Stämpelklockan så funkar den, en sida, enkelt språk för personalen.
3. Första veckan: det här kollar butikschefen varje morgon.

Avslutas med en go-lista per butik: grönt, gult med lösning, rött som blockerar.

## Tekniskt

- Klockvyn och stationslogiken: sidfotsetikett med butiksnamn, kioskkontroller, avstängd rastknapp bakom en stationsinställning.
- Adminvy för stationer: flytta butik, avaktivera, rotera kod; alla ändringar loggas.
- Behörighetskontroll vid stämpling: avslutad anställning, testflagga och saknad anställning i stationens bolag ger avvisning.
- Verifiering körs skarpt mot databasen och i webbläsaren med skärmbilder som körbevis; testrader raderas inte utan makuleras journalfört.
- Guiderna läggs som sidor under adminsidan, med skärmbilder från provkörningen.
