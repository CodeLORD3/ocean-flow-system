# Filé/Tillverkning: styckningsmodeller, biproduktsmetod och auktionskalkyl

Denna plan ersätter tidigare prissättningslogik (marginalmål per detalj) med
biproduktsmetoden, låser detaljvalen till artens styckningsmodell och lägger till
en mobilanpassad auktionskalkyl.

## Nuläge (kontrollerat i databasen)

- `cut_splits` har idag rader för endast fem grupper: torsk, sej, rundfisk,
  laxfisk, plattfisk — och saknar fältet `role`.
- Det finns ingen styckningsmodell per art någonstans; formuläret gissar mall via
  `note`-texten på utbytesraden och kan därför föreslå detaljer som inte finns i arten.
- `products` har `species_group` men inte `requires_processing`.
- Prissättningen i `src/lib/filletMath.ts` sätter varje detaljs pris via eget
  marginalmål (`weightedTarget`) — det är den modell som nu byts ut.
- `margin_targets`, `processing_surcharges` och `vat_rates` finns redan och är
  redigerbara, så avsnitt 3 kräver bara att värdena verifieras/kompletteras.

## 1. Styckningsmodell per art

Ny tabell `species_cut_models`: artgrupp, `cut_model`
(`loin_four` | `loin_whole` | `salmon_side` | `flatfish` | `tail_only` | `single`),
`min_piece_weight_kg` (3 för `loin_four`), noteringsfält. Seedas med hela artlistan
i specen.

`cut_splits` får `role` (`primary` | `byproduct`) och seedas per modell:

- loin_four: rygg 55 (primary), benfri filé 20, slag 15, kontrarygg 10
- loin_whole: loin 70 (primary), buk 20, avskär 10
- salmon_side: rygg 60 (primary), buk 40
- flatfish: hel filé 100 (primary) + valfria alternativ kotlett/tronçon och fletch
  (ej procentuell uppdelning)
- tail_only / single: hel filé 100 (primary)

Formuläret föreslår **endast** detaljer ur artens modell. Vid `loin_four` och
styckvikt under 3 kg visas en varning med förslag att växla till `single`.
Namnet "Benfri filé" används i UI, prislistor och skyltar; "benfri file" och
"stjärtbit" behålls som alias vid matchning mot befintliga former/produkter.

## 2. Biproduktsmetoden

Ny beräkning i `filletMath.ts` (`priceByByproductMethod`):

```text
kostnad        = råvarukg × inköpspris + påslag × färdiga kg
biprodukt      = Σ (kg × pris ex moms), manuellt satta priser
krävd intäkt   = kostnad / (1 − marginalmål)
huvudintäkt    = krävd intäkt − biproduktintäkt
huvudpris ex   = huvudintäkt / huvudproduktens kg
pris inkl moms = ex × momssats, avrundat uppåt till 29/49/79/98
```

Flera primary-detaljer: huvudintäkten fördelas med `margin_weight` normaliserad så
att det kilo-viktade snittet blir exakt 1,0.

Biproduktpriser anges manuellt inkl moms, aldrig härledda från kostnad. Ny tabell
`byproduct_prices` (artgrupp + detaljform + pris inkl moms) sparar senast använt
värde och förifylls i nästa order. Startvärden för torsk: rygg 698,
kontrarygg 398, benfri filé 249, slag 129.

`weightedTarget` slutar styra priset och används bara för viktfördelningen.

## 3. Marginal, moms, avrundning

Behåller nuvarande avrundning (alltid uppåt, 29/49/79/98 samt 9/19/29 under 29 kr).
Verifierar och kompletterar seedvärden: marginalmål Stockholm 55 % / Göteborg 45 %
med rätt butiker, påslag 35 kr/kg endast för förädlat, moms 6 % livsmedel
(2026-04-01–2027-12-31), 25 % Emballage & Förbrukning, 12 % servering.
Båda marginaltalen visas per detalj och för partiet; färgmarkering utgår från
marginal inklusive arbete.

## 4. Auktionskalkyl

Ny mobilanpassad vy (flik i Filé/Tillverkning): ange art, råvarukg och utpriser →
räknar högsta försvarbara inköpspris per kg för **båda** regionerna sida vid sida,
plus vilken marginal ett angivet budpris ger. Sparas i ny tabell `auction_calcs`
(datum, art, kg, priser, maxpris per region, budpris, faktiskt klubbslag) för
uppföljning.

## 5. Flödet och auto-godkännande

`products.requires_processing` (boolean) läggs till och sätts true för
grundprodukter i Färsk Fisk samt levande/råa skaldjur. I flödet
inköpsrapportering → prissättning/tillverkning → lager auto-godkänns en rad bara
när den inte kräver hantering, föreslaget pris ger marginal över målet och
utbytet inte är `is_estimate = true`. Övriga hamnar i manuell granskning.

## 6. Verifieringstest

`src/test/fillet.test.ts` utökas med torskexemplet: 100 kg à 60 kr, utbyte 47 %,
loin_four 55/20/15/10, påslag 35, moms 6 %, priser 698/249/129/398 →
intäkt 21 853 kr, kostnad 7 645 kr, marginal ink. arbete 65,0 %, maxpris 104 kr/kg
(45 %) och 82 kr/kg (55 %). Plus test att modellen aldrig föreslår detaljer utanför
`cut_model`.

## 7. Kvarstående från tidigare

`products.species_group` finns; kalibrering mot rullande snitt av fem senaste
utfallen och täckningskontrollen mot verkliga produkter i databasen behålls som de är.

## Teknisk sammanfattning

- Migration: `species_cut_models` (ny), `cut_splits.role`, `byproduct_prices` (ny),
  `auction_calcs` (ny), `products.requires_processing`, seed av modeller, splits,
  utbyten och torskpriser. Alla nya tabeller får GRANT + RLS.
- `src/lib/filletMath.ts`: biproduktsmetod, normaliserad viktfördelning,
  omvänd auktionsberäkning; gamla per-detalj-prissättningen tas bort.
- `src/lib/cutModels.ts` (ny): modelldefinitioner, artmappning, alias för benfri filé.
- `src/components/production/ProductionOrderForm.tsx`: modellstyrda detaljrader,
  manuella biproduktpriser, viktvarning under 3 kg, två marginaltal.
- `src/components/production/AuctionCalculator.tsx` (ny) + flik i `src/pages/Production.tsx`.
- `src/hooks/useProductionYields.ts`: hooks för modeller, biproduktpriser, kalkyler.
- `src/test/fillet.test.ts`: verifieringsexemplet ovan.
- `/mnt/documents/file-tillverkning-spec.md` uppdateras till den nya modellen.
