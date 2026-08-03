# AP-0 komplettering, AP-8 prislistor per kanal, AP-7 NRV-prissättning

## AP-0 — nästan klar, två luckor kvar

Kontrollerat i koden nu: `SPECIES_CUT_MODEL` i `cutModels.ts` har redan ASCII-nycklar
(`langa`, `halleflundra`, `rodspatta`, `regnbage`, `svardfisk`) och slår upp via
`speciesKey()`. Produktimporten normaliserar via `normalizeSpeciesGroup`, och
uppslag i utbyten och tillverkningsordern går genom `speciesKey`. Testfallet
`species_group = halleflundra` ger alltså redan `flatfish`, inte fallback.

Två saker saknas och byggs:

1. Täckningskontrollen kontrollerar bara `yields`. Den utökas till att också lista
   aktiva produkter vars artgrupp saknar rad i `species_cut_models`, med tydlig
   markering av vilket register som saknar raden.
2. Kontrollen ligger idag under Filé/Tillverkning → Inställningar. Den läggs även
   under Admin, samma komponent, så den nås utan att gå in i tillverkningen.

Bildbulkuppladdningen matchar på SKU och namn, inte på artgrupp, och behöver
ingen artnyckel — den lämnas som den är.

## AP-8 — prislistor per kanal

Två prislistor ersätter dagens regionmodell:

- **butik_goteborg**: Torslanda Torg, Amhult, Särö, Eriksberg. Marginal 45 %,
  moms 6 % inkluderad, avrundning uppåt till 29/49/79/98 (under 29 kr: 9/19/29).
- **grossist**: DE No.1 AB Stockholm (Bromma, Kungsholmen) och Componia AG
  Schweiz. Marginal 22 %, priser exklusive moms, ingen avrundning, två decimaler.

Raden "Stockholm 55 %" ersätts av grossistraden. `price_history` rörs inte.
`vat_rates` har redan `valid_from` och `valid_to`; seedvärdena sätts (6 %
livsmedel 2026-04-01–2027-12-31, 25 % Emballage & Förbrukning, 12 % servering på
plats) och en varning visas när en sats närmar sig sitt slutdatum.

Prissättningsvyn får en kanalväljare och visar i klartext om priset är inklusive
eller exklusive moms. Alla marginaler och momssatser läses ur databasen — ingen
kvar i koden.

## AP-7 — NRV-prissättning ersätter biproduktsmetoden

Kostnaden fördelas på intäktsandel i stället för jämnt per kilo, och
huvudproduktens residuala golvpris försvinner helt.

- Priserna sätts manuellt per prislista och detalj. En detalj utan pris blockerar
  prissättningen och visar "pris saknas" — aldrig ett beräknat fallbackvärde.
- Råvarukostnaden hämtas ur lagrets viktade snittkostpris, aldrig ur ett manuellt
  inmatat inköpspris.
- Startpriser torsk butik inklusive moms: rygg 798, kontrarygg 398,
  benfri filé 249, slag 198.
- Fasta påslaget gör att billigaste detaljen alltid får lägst marginal. Det visas,
  det döljs inte.

Tillverkningsordern visar per detalj: kg, pris, intäktsandel, fördelad kostnad per
kg och marginal, med lägsta detaljmarginal markerad och partiets samlade marginal
under tabellen. Auktionskalkylen visar båda maxpriserna sida vid sida, "Partiet
håller" och "Alla detaljer håller", och varnar när partiet ligger under målet.

Priser skrivs aldrig över automatiskt: knapp "Använd föreslaget pris" per detalj
och prislista, plus massfunktion med förhandsgranskning. Varning när partiets
marginal understiger målet, när en detalj saknar pris, och när ett pris avviker mer
än 25 % från senast satta.

## Design och språk

En uppgift per skärm, produktbild före text, färg alltid med ikon och ord,
klarspråk, knappar minst 48x48 px, högst fem kolumner på mobil, synlig bekräftelse
efter varje sparande. Projektet har ingen översättningsfil idag; en läggs upp
(svenska, engelska, arabiska) och de nya vyerna hämtar alla ledtexter därifrån.
Befintliga vyer byggs inte om i den här omgången.

## Teknisk sammanfattning

Databas:
- `margin_targets`: nya kolumner `price_list` (text) och `applies_to`
  (`butik`/`grossist`); Stockholm 55 %-raden ersätts av grossistraden 22 %.
- `vat_rates`: seed av giltighetsperioder (kolumnerna finns redan).
- `detail_prices`: nya kolumner `price_list`, `cut_form`, `price_incl_vat`
  numeric(12,2), `valid_from` date. `byproduct_prices` migreras in med
  `price_list = 'butik_goteborg'` och tabellen tas bort.
- `cut_splits.role` behålls enbart som sorteringsinformation i gränssnittet.

Kod:
- `filletMath.ts`: `priceByByproductMethod`, `floorExVat`/`floorInclVat` och
  `allocateRawCost` ersätts av NRV-funktioner (intäktsandel, fördelad kostnad,
  marginal per detalj, partiets marginal, båda maxpriserna). Avrundningen görs
  enbart för butiksprislistan.
- `ProductionOrderForm.tsx` och `AuctionCalculator.tsx` byggs om mot prislista i
  stället för region, och råvarukostnaden läses ur `product_stock_locations.avg_cost`.
- `useProductionYields.ts` får prislistfilter, `byproduct_prices`-hookarna tas bort.
- Nytt test i `src/test/fillet.test.ts` som räknar mot verifieringssiffrorna:
  29,000 kg torsk à 146,00 kr/kg, utbyte 55 %, delning 55/20/15/10, påslag
  35 kr/kg, moms 6 % — andelar 78,6/7,1/8,9/5,3 %, kostnader
  379,49/189,27/118,41/94,16, marginaler 44,9/40,3/34,7/30,9 %, intäkt 8 399,33 kr,
  kostnad 4 792,25 kr, partiets marginal 42,9 %, V = 526,60 kr/kg, maxpris 140,05
  respektive 105,03 kr/kg.
