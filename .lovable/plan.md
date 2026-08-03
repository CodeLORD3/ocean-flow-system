# Underlag till Claude: kravgranskning av inleverans, lager, pris och tillverkning

Målet är en fil du kan klistra in hos Claude, som i sin tur returnerar ett komplett och exekverbart prompt tillbaka till mig. Filen ska både beskriva vad systemet gör idag och ställa de frågor som får Claude att hitta luckorna.

## Vad som skapas

En fil, `/mnt/documents/claude-kravgranskning-prompt.md`, med följande delar:

1. **Roll och uppgift till Claude** — agera som lösningsarkitekt för fisk- och skaldjursgrossist med butikskedja, och returnera ett färdigt byggprompt till Lovable, inte en diskussion.
2. **Nulägesbeskrivning** — kort men exakt: produktregister med föräldrar och varianter, kategorier och SKU-mönster, inleverans från leverantör, butiksmottagning av följesedel, lagerplatser med sublager per kategori, inventering via lagerlapp, prissättning med marginal per butik och region, Filé/Tillverkning med utbyten, styckningsmodeller, biproduktsmetod och golvpris, auktionskalkyl, kassa, portalstruktur.
3. **Kända luckor som redan är kartlagda** — två parallella lagerspår (leverantörsinleverans skriver bara ett globalt saldo medan butiksmottagning skriver på lagerplats), ingen transaktionslogg för lager, inventering utan sparad differens, prissättning som räknar på manuellt kostpris i stället för lagrets snittkostpris, tillverkningsorder som inte låser vilket parti som konsumeras.
4. **Referenssystem att jämföra mot** — Pyramid och Vitec Unikum för handel och grossist på den svenska sidan, samt Wisefish, inecta, Loop ERP och SeafSoft på fiskspecifik sida. Funktionslistorna att stämma av mot: batch- och partihantering, serienummer, flytande inventering, lagerplatser, behovsanalys och beställningsförslag, inköpsanmodan vid orderläggning, prisavtal och prislistor och kampanjer per kund, flervaluta, leveransbevakning och avisering, reklamationshantering, EDI och fakturamatchning, statistik och lönsamhetsuppföljning, samt catch weight, FEFO, kylkedja och spårbarhet från fångst till kund.
5. **Frågorna Claude ska besvara** — vilka funktioner i referenssystemen som saknas hos oss och verkligen behövs för en fiskgrossist med egna butiker, vilka som är överkurs, vilken ordning de bör byggas i, och vilka datamodellsändringar varje del kräver.
6. **Format på svaret** — Claude ska returnera ett prompt med numrerade arbetspaket, där varje paket har syfte, datamodell, beräkningsregler med formler, gränssnitt, acceptanskriterier och testfall. Svenska rubriker, svensk terminologi, inga påhittade tabellnamn utöver de som anges.
7. **Hårda regler** — inga mockdata, kvantiteter i kilo med tre decimaler, priser med två, momssatser och regionmarginaler tas från databasen, lagerförändringar ska alltid gå via en bokförd rörelse, allt användarsynligt på svenska.

## Bilaga i filen

En kompakt tabellöversikt över befintliga tabeller som berör flödena (produkter, lagerplatser, saldon per plats, inleveranser med rader, följesedlar, inköps- och produktionsrapporter, utbyten, styckningsmodeller, detalj- och biproduktpriser, auktionskalkyler, prislistor) så att Claude inte hittar på egna namn.

## Efter att du kört filen genom Claude

Du klistrar in Claudes svar här, och jag går igenom det mot koden innan något byggs — dels för att verifiera att arbetspaketen stämmer med verkligt schema, dels för att sortera bort det som redan finns.
