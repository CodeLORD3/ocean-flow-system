# Auktionsinköp i mobilen — partiet föds vid ringen

Ett nytt mobilverktyg för inköparen vid auktionsringen i Fiskhamnen: pris, kolli, foto, klart. Partiet syns direkt i systemet för kollegor i Stockholm och Schweiz, fördelas efter auktionen på Stockholm/Göteborg/Export, och verifieras mot auktionens följesedel innan något får skickas.

Omfattningen är stor, så den byggs i fem etapper. Varje etapp är körbar och testas med bevis innan nästa börjar.

## Etapp 1 — Ringflödet och dagens inköpslista

- Ny lagerplats "Fiskhamnen auktion" (grossistlager, Göteborg).
- Startkort "Auktionsinköp" för personer med inköpsroll, med "Nytt inköp" som fast knapp i full bredd.
- Första skärmen: två fält samtidigt — PRIS PER KG ("Ange pris", decimaltangentbord, både komma och punkt) och ANTAL KOLLI ("Ange antal kolli", förifyllt 1, heltalstangentbord). Fokus i prisfältet direkt, Nästa på tangentbordet hoppar till kolli, Klar går till kameran. Knappen "Nästa (fota lappen)" ligger fast ovanför tangentbordet. Siffror 32 px, fälthöjd 64 px, etiketter i versaler. Pris > 0 och kolli ≥ 1 valideras utan att tangentbordet stängs.
- Kameran: ett foto per parti, "Ta om" och "Klar". Flera lådor med samma lapp = ett parti med kollital.
- Vid "Klar" skapas partiet direkt: status preliminärt, inköpsrörelse till Fiskhamnen auktion, preliminärt kostpris = angivet pris per kg, fotot bifogat. Grön bekräftelse en sekund, sedan tillbaka till "Nytt inköp".
- Dagens inköpslista: fotominiatyr, art eller "ej tolkad", kolli, pris per kg, status, gul prick vid obekräftade förslag. Summering överst: antal partier, total nominell vikt, totalt preliminärt belopp. Redigera eller makulera (motrörelse, aldrig radering).
- Inventeringens stegare och egna knappsats lämnas orörd.

## Etapp 2 — Offline och bakgrundstolkning av lappen

- Registreringar vid ringen köas lokalt med fotot, synkas automatiskt vid täckning, kön överlever stängd app. Diskret synkstatus överst i dagens lista.
- Ny serverfunktion läser lappen med AI och förifyller art, storlekssortering, fartyg, fångstområde, fångstdatum, nominell vikt per kolli och presentationsform som förslag med källa "tolkad från foto". Tolkningen blockerar aldrig registreringen.
- Partidetalj: fotot bredvid fälten, bekräfta allt med en knapp eller rätta enskilda fält. Bekräftelse låser fälten med källa angiven.
- Nominell vikt = vikt per kolli × antal kolli; annars visas "vikt saknas".

## Etapp 3 — Avsluta inköp och fördelning

- "Avsluta inköp" längst ner i dagens lista, aktiv när minst ett parti finns.
- Fördelningsskärm på 390 px: kompakt lista med fotominiatyr, art, kolli och tre valknappar (Stockholm, Göteborg, Export), färgmarkering per destination, bockning för bulkval.
- Kan inte slutföras förrän alla partier har destination; saknade pekas ut. Bekräftelseskärm med summering per destination.
- Vid bekräftelse: Göteborg går till grossistens mottagningskö, Stockholm läggs på veckans öppna Stockholmsleverans (skapas automatiskt, markeras internhandel FSAB → DE No.1, butiksfördelning sker vid packningen), Export läggs på veckans öppna leverans till Componia.
- Inga lagerrörelser skapas av fördelningen — partierna ligger kvar på Fiskhamnen auktion med sin markering.
- Ett parti har en destination åt gången; ändring flyttar raden och loggas med person och tid, spärras om leveransen är skickad. "Avsluta inköp" kan köras flera gånger per dag och tar bara ofördelade partier.

## Etapp 4 — Mottagningskontroll, export och leveransspärrar

- "Skicka till mottagning": markera partier, välj destination (Grossist Göteborg förvald), transfer_out till transitlagret per parti med idempotensnyckel.
- Vid inleverans är mottagningen förifylld: vägd vikt och temperatur per parti, transfer_in bokförs, viktavvikelse loggas på partiet. Partiet blir disponibelt, eller karantän vid temperaturavvikelse enligt befintliga regler.
- För Stockholm och Export är packningen i Fiskhamnen mottagningskontrollen — ingen separat inleverans.
- Leveransvy (mobil och desktop) visar per rad: foto finns, fält bekräftade, vägd vikt, temperatur. Ofullständiga rader rödmarkeras med exakt brist och direktlänk.
- "Markera som skickad" är låst tills varje rad har bekräftade spårbarhetsfält (art, fartyg, fångstområde, fångstdatum, redskap, presentationsform), vägd vikt, temperatur och status verifierat. Låst knapp listar blockerande partier.
- Vid skickad: en exportrörelse per parti till leveransens transitplats med leveransnummer som referens och idempotensnyckel, följesedel med en rad per parti (partinummer, art med vetenskapligt namn, fångstområde, fångstdatum, redskap, presentationsform, vägd nettovikt, kolli), leveransvillkor Delivered Duty Paid. Fakturaunderlag till Componia skapas samtidigt och listas i egen vy.
- Mottagning i Zollikon i befintligt flöde; avvikelser loggas per rad.
- Spärrar: okontrollerade partier kan inte säljas, styckas eller överföras till butik; ett parti kan inte ligga på både butiksöverföring och exportleverans; skickad leverans kan bara tas emot, inte ändras; temperaturavvikelse vid packning lyfter partiet av leveransen med automatisk notering.
- Fältet slutligt kostpris och flaggan "preliminärt, avvaktar avräkningsnota" förbereds nu, avstämning byggs senare.

## Etapp 5 — Live-vy och följesedelsavläsning

- "Dagens auktionsinköp" i realtid för alla behöriga oavsett ort: nya köp syns inom sekunder med foto, art, kolli, pris, status, destination och summeringar per destination. Distansbehöriga kan sätta destination.
- "Läs av följesedel": fota eller ladda upp dagens följesedel (foto eller PDF, flera sidor). Serverfunktion tolkar raderna (auktionens partinummer, art, sortering, kolli, vikt, pris per kg, belopp) och visar dem i en matchningsvy.
- Automatisk matchning mot dagens preliminära partier på art, kolli och pris; resten matchas manuellt. Vid bekräftad match blir partiet verifierat, auktionens partinummer blir officiellt (ringens nummer sparas som referens) och vikt/pris korrigeras via justeringsrörelser med orsak "verifiering mot följesedel".
- Rad utan ringregistrering: "Skapa parti från rad" (verifierat, märks "saknar lådfoto"). Ringregistrering utan rad: rödflaggas, kräver makulering eller bevarande med orsak.
- Följesedeln arkiveras på dagen och länkas från varje verifierat parti. Avläsningen kan göras av kontoret.
- Statusflöde överallt med färg och ord: preliminärt → verifierat → kontrollerat → disponibelt. Preliminära partier kan inte säljas i kassan och ingen leverans kan skickas med ett preliminärt parti.

## Tekniskt

- Partier lagras i `lots` med nya fält: auktionsstatus (preliminärt/verifierat/kontrollerat/disponibelt), destination, nominell vikt per kolli, antal kolli, fotoreferens, auktionens partinummer, ringreferens, källa per tolkat fält, slutligt kostpris + prisflagga.
- Ny tabell för dagens auktionsinköp (rad per parti med pris, kolli, destination, synknyckel) plus logg för destinationsändringar; följesedelsdokument och tolkade rader i egna tabeller med RLS och GRANT.
- Alla lagerförändringar går via `stock_movements`: inköpsrörelse vid ringen, justeringsrörelse vid verifiering, transfer_out/transfer_in vid hämtning och mottagning, exportrörelse vid skickad, motrörelse vid makulering. Idempotensnyckel per rörelse (referenstyp + referens-id). Inga saldon skrivs direkt.
- Offlinekön i IndexedDB (foto som blob) med bakgrundssynk, samma mönster som räkningskön.
- Leveranser byggs på befintliga `transfer_orders` med rader per parti; exportens fakturaunderlag använder befintliga internhandelsregler utan automatisk Fortnox-bokning.
- Tolkning: två serverfunktioner (lådlapp, följesedel) via AI-bildläsning, bägge utan blockerande beroende för användaren.
- Mobilregler: inga tabeller, ingen horisontell scroll, tryckytor ≥ 56 px, primärknappar 64 px, brödtext ≥ 18 px.

## Bevis som körs

Varje etapp avslutas med skärmbilder vid 390 px och körda testfall enligt din acceptanslista: ringflödet i tre tryck, tre testköp med foto och rörelser, spärr mot försäljning och överföring, flygplansläge med efterföljande synk, fördelning av fem köp med utpekad brist, mottagning med viktavvikelse och temperaturkarantän, makulering med motrörelse och nollsaldo, följesedelsavläsning med fem rader (tre automatch, en manuell, en ny) och låst leveransknapp med utpekade brister.
