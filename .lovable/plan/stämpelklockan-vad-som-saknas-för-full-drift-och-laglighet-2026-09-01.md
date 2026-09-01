# Stämpelklockan — vad som saknas för full drift och laglighet

Genomgången är gjord mot koden och databasen som den ser ut nu. Nedan skiljs lagkraven (personalliggare, arbetstidslag, GDPR) från det som krävs för ett fullt fungerande tid- och lönesystem.

## Det som redan är på plats (verifierat)

- Journalen `time_entries` är append-only; rättelser sker som nya rader med referens till originalet.
- Personalliggarläge ("Visa för Skatteverket") med låst vy, korrigeringshistorik och utskrift/PDF finns i journalvyn.
- Kontrollsessioner loggas (`inspector_sessions`) och varje uppslag av fullständigt personnummer loggas (`pnr_access_log`).
- Gallring körs nattligen och årligen: stämplingar sparas per beskattningsår i 7 år, personnummerloggen i 2 år.
- Stationer med hashad aktiveringskod, kodrotering, återkallning, vakthund var 15:e minut.
- Offlinekö med krypterad identifierare, tabell och serverfunktion för misslyckade offlineposter.
- Attest med avvikelsetyper, tolerans, periodlås samt en gemensam arbetstidsmotor i databasen som räknar OB, mertid och övertid för attest, Min tid och löneunderlag.
- Automatisk utstämpling nattligen samt jämförelsevy mot Personalkollen.

## A. Lagkrav som saknas

1. **Liggarplikten är inte fastställd per driftställe.** Driftställen visas i dag med status "Liggarplikt: Utred". Beslutet (ja/nej per driftställe och bolag) ska sättas och visas, så att kontrollvyn används rätt.
2. **Personalen kan inte se sin egen tid.** Sidan "Min tid" finns byggd men är inte inlagd i navigeringen eller som route — bara behörigheten finns. Utan den saknas arbetstagarens insyn i registrerad tid, OB och övertid.
3. **Journal över övertid, mertid och jourtid saknas.** Arbetsgivaren ska kunna visa detta för Arbetsmiljöverket. Vi behöver en utskriftsbar sammanställning per person, rullande fyra veckor och per kalenderår, med gränsvärden markerade.
4. **Vilotidskontrollen körs bara på planerat schema.** Dygnsvila 11 h och veckovila 36 h kontrolleras mot schemalagda pass, inte mot faktiskt stämplad tid. Brott mot vila i verkligheten syns därför inte.
5. **Misslyckade offlinestämplingar hanteras inte i något gränssnitt.** Tabellen fylls, men ingen vy visar dem, så en förlorad stämpling kan bli tyst. Behövs: kö med "Registrera manuellt" och "Avfärda med skäl".
6. **Anställda som inte kan stämpla.** Fyra aktiva anställda saknar klockidentitet (personnummer/kortnummer) och kan därför inte registreras i liggaren. Dessa måste kompletteras.
7. **Klockan är utrullad på 3 stationer trots 11 försäljningsställen.** Liggaren är bara komplett där det finns en aktiv station. En utrullningsplan per enhet behövs.
8. **Dataskyddsdokumentation.** Rutin för personnummerhantering (rättslig grund, information till anställda, vem som får öppna kontrolläget, hur loggen granskas) finns inte skriftligt, trots att tekniken är på plats.

## B. Funktion som saknas för fullt fungerande drift

9. **Kostnadsställebyte mitt i passet** finns som serverfunktion och klientanrop, men saknar knapp i kiosken — byte kräver i dag ut- och instämpling.
10. **Automatisk rast** är kvar som inställning på stationsprofilen utan att någon rastpost skapas. Antingen byggs den eller så tas inställningen bort så att den inte missförstås.
11. **Skarp körning är inte verifierad.** Journalen innehåller endast ett fåtal testposter, varav några med framtida datum, och personnummerloggen är tom. Testdata ska städas och en verklig vecka köras igenom: stämpling → attest → periodlås → löneunderlag.
12. **Löneflödet till Fortnox** ska verifieras skarpt en gång från låst period till lönefil, med kvitto på vad som skickas och vad som hanteras manuellt.
13. **Acceptanstester för kantfall** (dubbel in, ut utan in, pass över midnatt, rättelse efter periodlås, offlinepost utanför geofence, sommar-/vintertidsskifte) ska köras och redovisas som körbevis.

## Föreslagen ordning

1. Kritiskt för liggaren: punkt 2, 5, 6, 1.
2. Lagefterlevnad arbetstid: punkt 3, 4.
3. Drift och funktion: punkt 9, 10, 7.
4. Verifiering: punkt 11, 13, 12, samt dokumentationen i punkt 8.

## Tekniska noter

- Min tid: lägg route och navigering för `src/pages/MyTime.tsx` (behörighet finns redan i `src/lib/pageAccess.ts`).
- Avvikelsekö: ny vy mot `clock_sync_failures` med åtgärderna manuell registrering (skapar riktig rad i `time_entries`) och avfärdande med skäl, båda loggade.
- Vilotid på faktisk tid: ny beräkning som läser effektiva stämplingar per person och svenskt dygn och skriver avvikelser till attestkön; blockerar inte stämpling.
- Övertidsjournal: sammanställning ur den gemensamma arbetstidsmotorn per person och period, med utskrift och Excel.
- Kostnadsställebyte: knapp i kiosken som anropar den befintliga funktionen `clock-switch-allocation`.
- Liggarplikt: sätt `work_sites.ledger_required` per driftställe och visa status i personalliggarens sidhuvud.
