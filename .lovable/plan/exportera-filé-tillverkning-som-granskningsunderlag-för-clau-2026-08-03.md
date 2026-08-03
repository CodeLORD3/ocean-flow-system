# Exportera Filé/Tillverkning som granskningsunderlag för Claude

Samla logiken och specen för Filé/Tillverkning i en nedladdningsbar markdown-fil som kan bifogas till Claude för granskning. Ingen kod i appen ändras — det här är enbart ett dokument.

## Vad filen innehåller

1. **Syfte och flöde i text** — från inköpsrapport till registrerad tillverkning, steg för steg (val av råvara, kvantitet och inköpspris, förslag på styckdetaljer, prissättning per region, registrering och lagerposteringar).

2. **Databasmodellen** — komplett SQL för de tabeller modulen använder: `yields` (utbyte art/form → form), `cut_splits` (uppdelning av filé i rygg/slag/stjärtbit med marginalvikt), `production_orders`, `production_order_lines`, `yield_actuals` (verkligt utfall för kalibrering), `processing_surcharges`, `margin_targets` och `vat_rates` — inklusive åtkomstregler och grants, hämtat från migreringen `20260803090420`.

3. **Full kod för beräkningslogiken** — `src/lib/filletMath.ts` i sin helhet, med de fem stegen (råvarukostnad, förädlingspåslag, marginalmål, moms, avrundning), avrundningstabellen (9/19/29 under 29 kr; 29/49/79/98 däröver, alltid uppåt), marginalviktens formel, fördelningen av partiets råvarukostnad över detaljerna (kg × marginalvikt) samt partiets samlade marginal.

4. **Full kod för lager och dataåtkomst** — `src/lib/productionStock.ts` (uttag av råvara och inleverans av detaljer på Grossist Flytande med viktat snittkostpris) och `src/hooks/useProductionYields.ts` (läs/skriv mot tabellerna ovan, rullande snitt av de 5 senaste utfallen, kalibreringsstatus).

5. **Räkneexempel** — torsk 100 kg à 60 kr/kg genom hela kedjan: 47 % utbyte till filé, uppdelning i rygg/slag/stjärtbit, fördelad råvarukostnad, utpris per region efter avrundning och partiets marginal — så att Claude kan kontrollräkna varje steg.

6. **UI-delen i textform** — kort beskrivning av de fyra flikarna (Tillverkningsorder, Historik & utfall, Utbytesregister, Inställningar) och vilka fält och kontroller som finns, utan komponentkod enligt ditt val.

7. **Kända designval att granska** — punkter där det finns mer än ett rimligt sätt att räkna: att bara en filéväg expanderas per parti (alternativa vägar ligger avmarkerade), att råvarukostnaden fördelas i stället för att varje detalj bär hela `pris / utbyte`, och att förädlingspåslaget räknas som intäkt i marginalen.

## Leverans

Filen skapas som `/mnt/documents/file-tillverkning-spec.md` och blir direkt nedladdningsbar i chatten. Uppskattad omfattning: cirka 700–900 rader, varav merparten är kod och SQL.
