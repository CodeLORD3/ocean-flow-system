# Makrill Trade mot etablerade affärssystem

Internt underlag för sälj, introduktion av ny personal och prioritering av vidareutveckling. Jämförelsen gäller generella affärssystem (Pyramid, Vitec, Monitor) och fiskspecifika system (Wisefish, inecta, Loop ERP).

## Sammanfattning

1. Vi är ett branschsystem för fisk och skaldjur, inte ett generellt affärssystem.
2. Systemet är byggt kring det fysiska varuflödet — parti, vikt, hållbarhet, styckning — medan generella affärssystem är byggda kring redovisningen.
3. Vi täcker hela kedjan i samma bas: grossist, produktion, butiksportaler, kassa.
4. Vi gör inte redovisning, reskontra eller lön själva. Det sker via integration.
5. Vi är driftsnära och mobila: systemet ska gå att använda bakom disken med kund framför sig.

## Utgångspunkten

Ett generellt affärssystem sätter huvudboken i mitten. Lager och order finns där för att bokföringen ska stämma, och branschbehov löses med tilläggsmoduler eller konsultanpassning. Implementationen är lång och konfigurationen djup.

Vårt system sätter varan i mitten. Ett parti kommer in, vägs, styckas, flyttas mellan fem lagernivåer, prissätts per kanal och säljs över disk eller till butik. Ekonomin är ett resultat av flödet, inte utgångspunkten.

```text
Inköpslager -> Grossist / Produktion -> Transportlager -> Butikslager -> Kassa
```

## Funktionsjämförelse

| Område | Makrill Trade | Generella (Pyramid/Vitec) | Fiskspecifika (Wisefish/inecta/Loop) |
| --- | --- | --- | --- |
| Partispårbarhet (lot) | Kärnfunktion, rörelsejournal per parti | Tillägg eller anpassning | Kärnfunktion |
| Bäst före och hållbarhet | Per parti, varnar i inköp och kundorder | Begränsat | Ja |
| Ursprungsland och art | Normaliserad artnyckel, ursprung på etikett | Fritextfält | Ja |
| Styckning och utbyte | Filé/tillverkning med utbyte och biprodukter | Nej | Ja |
| Prissättning | NRV, referenspris, skalfaktor, pris per kanal | Prislistor, statiska | Delvis |
| Lagerstruktur | Fem nivåer med lagerträd och godkännande | Lagerplatser, platt | Lager per anläggning |
| Butiksdrift | Checklistor, instämpling, dagsrapport, chatt, önskemål | Nej | Nej |
| Kassa (POS) | Inbyggd, vägning och spårbarhet på kvitto | Separat produkt | Separat produkt |
| Kundbeställningar | Vägd packning, verkligt pris mot uppskattat, allergier | Order utan vägning | Delvis |
| Investerarportal | Ja, i samma bas | Nej | Nej |
| Redovisning och bokslut | Nej — integration | Kärnfunktion | Via ERP-plattform |
| Kund- och leverantörsfaktura | Nej — integration | Kärnfunktion | Ja |
| Lön och tidrapport | Instämpling finns, lön via integration | Modul | Via ERP-plattform |

## Medvetna avgränsningar

Vi bygger inte egen redovisning, reskontra eller lönekörning. Det är mättade, revisionsstyrda områden där befintliga system är bättre och billigare. I stället levererar vi underlag i deras format och integrerar: bokföringsunderlag mot ekonomisystem och tid mot personalsystem.

Konsekvens: en kund behöver fortsatt ett ekonomisystem. Vi ersätter deras lager-, produktions-, pris- och butiksdel — inte deras huvudbok.

## Design och interaktion

Från ERP-traditionen tar vi:

- Informationstäthet — många rader synliga samtidigt, inga onödiga marginaler.
- Fast kolumnraster så siffror står i lodräta linjer.
- Monospace med tabular-nums och mellanslag som tusenavskiljare i alla belopp och vikter.
- Tangentbordsflöde: Enter går vidare, Esc stänger, inga tvingade musmoment.

Eget för oss:

- Helt tonad radbakgrund per status. Personalen läser status på en sekund, färg plus ikon, aldrig färg enbart.
- Mobilt butiksläge — samma data, layout anpassad för en hand och kund framför sig.
- En primärhandling per rad, resten i meny.

## Öppna gap

Listat som gap, inte som löst:

- Kund- och leverantörsfakturering saknas i systemet; integrationsvägen är påbörjad men inte färdig.
- Lönekörning saknas; kopplingen mot personalsystem är i fas två.
- Momsrapport och bokslutsflöden finns inte och planeras inte.
- Tangentbordsnavigering mellan rader är inte genomförd i alla listor.
- Kolumnrastret är inte konsekvent mellan tabellhuvud och rader i alla vyer.
