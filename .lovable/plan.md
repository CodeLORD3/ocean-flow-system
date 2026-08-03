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
golvpris ex    = huvudintäkt / huvudproduktens kg
golvpris inkl  = ex × momssats, avrundat uppåt till 29/49/79/98
```

Flera primary-detaljer: huvudintäkten fördelas med `margin_weight` normaliserad så
att det kilo-viktade snittet blir exakt 1,0.

### Golv, inte förslag

Residualen är ett **golvpris**, inte ett pris som ersätter befintligt. Per
huvudprodukt visas tre tal:

- **Golvpris** — residualen som gör att partiet når marginalmålet
- **Senast fastställt pris** — `last_set_price` för detaljen
- **Föreslaget pris** — det högsta av de två

Vid billigt inköp ligger senaste priset ofta över golvet och priset sänks då inte.
Vid dyrt inköp går golvet över senaste priset och systemet larmar tydligt.

### Priskällor

- `last_set_price` sparas per art och detaljform för **alla** roller som
  referensvärde. Startvärden torsk: rygg 698, kontrarygg 398, benfri filé 249,
  slag 129.
- `byproduct_prices` innehåller **bara** biprodukterna (kontrarygg 398,
  benfri filé 249, slag 129). Ryggen är primary och får aldrig ett pris här —
  dess pris räknas fram som residual.

Biproduktpriser anges manuellt inkl moms och härleds aldrig från kostnad; de
förifylls i nästa order.

### Skyddsspärrar

- Golvpris mer än 25 % över senast fastställt pris → varning: "råvaran är dyr
  eller biprodukterna säljs för billigt, kontrollera innan du fastställer priset".
- Golvpris under det högsta biproduktpriset → varning om att rollerna troligen är
  fel klassade.
- Biprodukt utan pris → räknas som 0 kr intäkt, men dess kilo räknas ändå in i
  förädlingspåslaget, och raden markeras så att det syns att den drar upp
  huvudproduktens golvpris.

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

Riktning C — auktionskalkylen (befintligt exempel behålls): torsk 100 kg à 60 kr,
utbyte 47 %, loin_four 55/20/15/10, påslag 35, moms 6 %, priser 698/249/129/398 →
intäkt 21 853 kr, kostnad 7 645 kr, marginal ink. arbete 65,0 %, maxpris 104 kr/kg
(45 %) och 82 kr/kg (55 %).

Riktning B — biproduktsmetoden (nytt test): samma parti, Göteborg 45 %,
biprodukter satta till 249/129/398 → golvpris 379 kr för ryggen, och partiets
marginal ink. arbete blir 45 % plus avrundningseffekt.

Plus test att modellen aldrig föreslår detaljer utanför `cut_model`, samt att de
tre skyddsspärrarna (25 %-avvikelse, golv under högsta biproduktpris, biprodukt
utan pris) utlöses korrekt.


## 7. Kvarstående från tidigare

`products.species_group` finns; kalibrering mot rullande snitt av fem senaste
utfallen och täckningskontrollen mot verkliga produkter i databasen behålls som de är.

## Teknisk sammanfattning

- Migration: `species_cut_models` (ny), `cut_splits.role`, `byproduct_prices` (ny,
  endast biprodukter), `detail_prices` med `last_set_price` per art/detalj (alla
  roller), `auction_calcs` (ny), `products.requires_processing`, seed av modeller,
  splits, utbyten och torskpriser. Alla nya tabeller får GRANT + RLS.
- `src/lib/filletMath.ts`: biproduktsmetod med golvpris, normaliserad
  viktfördelning, skyddsspärrar, omvänd auktionsberäkning; gamla
  per-detalj-prissättningen tas bort.
- `src/lib/cutModels.ts` (ny): modelldefinitioner, artmappning, alias för benfri filé.
- `src/components/production/ProductionOrderForm.tsx`: modellstyrda detaljrader,
  manuella biproduktpriser, tre priskolumner (golv / senast / föreslaget),
  varningsrader, viktvarning under 3 kg, två marginaltal.

- `src/components/production/AuctionCalculator.tsx` (ny) + flik i `src/pages/Production.tsx`.
- `src/hooks/useProductionYields.ts`: hooks för modeller, biproduktpriser, kalkyler.
- `src/test/fillet.test.ts`: verifieringsexemplet ovan.
- `/mnt/documents/file-tillverkning-spec.md` uppdateras till den nya modellen.
