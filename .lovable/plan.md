# Täckningskontroll i Admin — utökad med styckningsmodeller

Idag ligger täckningskontrollen som ett kort längst ned under Filé/Tillverkning → Inställningar och kontrollerar bara en sak: aktiva produkter vars artgrupp saknar rad i utbytesregistret. Den flyttas till Admin-portalen som en egen sida och utökas till att täcka hela kedjan artgrupp → styckningsmodell → detaljer → referenspriser → marginalmål/moms.

## Ny sida: Admin → Datakvalitet & täckning

- Route `/coverage`, tillgänglig i Admin-portalens sidebar under "Ekonomi & Rapporter" (namn: "Datakvalitet").
- En knapp "Kör alla kontroller" plus per-sektion status: grönt (full täckning), gult (varning), rött (blockerande lucka).
- Sammanfattningsrad högst upp: antal blockerande luckor, antal varningar, tidpunkt för senaste körning.
- Samlad CSV-export av alla brister (en rad per brist: kontroll, artgrupp/modell, objekt, beskrivning).
- Kortet under Filé/Tillverkning → Inställningar ersätts av en kort text med länk till Admin-sidan, så det bara finns en implementation.

## Kontroller

1. Utbytestäckning (befintlig logik, oförändrad)
   - Aktiva produkter vars artgrupp saknar rad i `yields`.
   - Aktiva produkter helt utan artgrupp.

2. Styckningsmodell per artgrupp (nytt)
   - Artgrupper i bruk (från aktiva produkter och från `yields`) som saknar rad i `species_cut_models`.
   - Modeller i `species_cut_models` vars `cut_model` inte har några rader i `cut_model_splits` — modellen är tom och kan inte användas i en tillverkningsorder.

3. Andelar i styckningsmodeller (nytt)
   - Per `cut_model`: summan av `pct_of_fillet` för icke-valfria rader. Avvikelse mot 100 % över 0,5 procentenheter flaggas, med visad summa och differens.
   - Rader med `pct_of_fillet = 0` eller negativt värde.
   - Modeller utan någon rad med `role = 'main'` (ingen huvuddetalj att bära marginalen).

4. Referenspriser per kanal (nytt)
   - För varje detalj i varje använd modell: saknas pris i `detail_prices` för `butik_goteborg` respektive `grossist`. Saknat butikspris är blockerande, saknat grossistpris är varning.
   - Priser med `price_incl_vat`/`last_set_price` = 0.

5. Marginalmål och moms (nytt)
   - Prislistorna `butik_goteborg` och `grossist` ska ha rad i `margin_targets` med `target_pct > 0`.
   - `vat_rates` ska ha en giltig sats för dagens datum per relevant kategori; utgången eller saknad sats flaggas.

## Teknik

- Ny sida `src/pages/DataCoverage.tsx`, route i `src/App.tsx`, sidebar-post i `src/components/AppSidebar.tsx`, sidtitel/breadcrumb i `src/components/AppLayout.tsx`.
- Kontrollogiken bryts ut till `src/lib/coverageChecks.ts` som rena funktioner: in går data (produkter, yields, species_cut_models, cut_model_splits, detail_prices, margin_targets, vat_rates), ut kommer en gemensam `CoverageFinding[]` med `{ check, severity, group, subject, message }`. Sidan gör en läsning per tabell via `supabase` och renderar resultatet.
- Artgruppsjämförelser går genom `speciesKey` från `src/lib/asciiFold.ts`, precis som idag, så stavning och versaler inte skapar falska luckor.
- `YieldCoverageCheck.tsx` tas bort och dess logik flyttas in i `coverageChecks.ts` (utbytesdelen), så inget parallellt spår kvarstår.
- Tester i `src/test/coverage.test.ts`: andelssumma 100 %/99 %/valfria rader exkluderade, modell utan huvuddetalj, saknat butikspris = blockerande men saknat grossistpris = varning, artgrupp utan modell, utgången momssats.
- Endast läsning — inga migrationer, inga skrivningar mot databasen.

## Noterat om nuläget

`detail_prices` har 4 rader och `cut_model_splits` 14 rader mot 52 artgrupper i `species_cut_models`, och produktregistret är nollställt. Kontrollen kommer därför att visa många öppna luckor direkt vid första körningen — det är avsikten: den ska tala om vad som återstår att fylla i.
