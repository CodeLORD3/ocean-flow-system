# SumUp-integration för Zollikon — Etapp 1

Mål för denna etapp: hämta försäljning från SumUp (pull) in i en kö med idempotens, produktnamnsmappning och testläge — utan att röra lagret. Bearbetning till lagerrörelser ligger i etapp 2.

## Verifierat i systemet innan bygget

- Butiken finns: "Fiskskaldjur Zollikon" (slug `zollikon`), land CH, valuta CHF, kopplad till bolaget `fsab-ch` som i registret heter **Componia AG** (inte "Zollikon AG" — specens namn matchar inte databasen). Butiken har redan en lagerplats kopplad.
- Kassaregistret finns redan generellt: `pos_transactions` och `pos_transaction_items` har `source`, `external_id`, `test_mode`, belopp i öre, `vat_breakdown`, samt rad-fält för partikoppling, enhetsavvikelse och granskningsstatus. Vi återanvänder dem och skiljer källorna på `source = 'sumup'`.
- Nimpos-mönstret som mall: kö-tabell + idempotensnyckel + parkerade fel + granskningsvy + nattavstämning, med delad logik i `supabase/functions/_shared/`.
- Beloppen i `pos_transactions` är heltal i öre utan valutakolumn i dag — CHF måste därför märkas upp, annars blandas CHF och SEK i summeringar.

## Öppen fråga innan skarp drift

Två merchant-koder har förekommit: MKC571XH (rättad) och MCNGCU6L. Pollningen hämtar bara transaktioner för den kod den får, så om det finns två profiler med försäljning i Zollikon tappar vi hälften. Bygget använder MKC571XH och stödjer flera koder i konfigurationen, så svaret kan komma senare utan omarbetning.

## Det som byggs i etapp 1

1. **Hemligheter och konfiguration**
   - `SUMUP_API_KEY` (restricted, endast `transactions.history`, `transactions.read`, `receipts.read`) och `SUMUP_API_KEY_SANDBOX` läggs som secrets. Nyckeln som delats i chatt ska roteras/raderas i SumUp innan vi kör skarpt.
   - Merchant-koder konfigureras i databasen, inte i kod: en mappningstabell merchant-kod → butik → bolag, med fält för valuta, aktiv, testläge. Klar för flera koder.

2. **Valuta och belopp**
   - Valutakolumn på kassatransaktionen med CHF för SumUp och SEK som standard för befintlig data. Belopp konverteras från SumUps decimaltal (10.10) till rappen vid mottagning. Transaktioner med annan valuta än butikens parkeras med larm i stället för att bokföras.

3. **Kö och hämtning**
   - Kö-tabell `sumup_events`: `transaction_id` som unik idempotensnyckel, rå payload, status (koad/bearbetad/duplikat/fel), försök, felmeddelande, testläge.
   - Edge function `sumup-poll`: läser `transactions/history` per merchant med `changes_since` = senaste lyckade körning minus 5 minuter, paginerar till slutet, hämtar fullt transaktionsobjekt (`products[]`, `vat_rates[]`) och kvitto (`receipt_no`, `card_reader.code`) för varje ny transaktion, köar rått. Ompollning ska ge `duplikat`, aldrig dubbla rader.
   - Robusthet: 401 (nyckel), 429 (backoff), 5xx (retry) loggas per typ; körningarna stämplas i en körningslogg som Systemstatus kan läsa.
   - Testläge: sandbox-nyckel och sandbox-merchant markerar allt som `test_mode`, så testförsäljning aldrig blandas med skarp statistik.
   - Kortdata: `last_4_digits` sparas aldrig — skrubbas vid mottagning, samma regel som Nimpos.

4. **Produktnamnsmappning (lärande)**
   - Tabell `sumup_product_map`: SumUp-namn → produkt, med räknare för omatchade och senast sedd. Första gången ett namn dyker upp hamnar det i granskningsvyn med rankade förslag; bekräftat val matchar automatiskt därefter.
   - Namnstandard: SumUp-artikelns namn ska vara identiskt med Makrilltrades kundvänliga namn.

5. **Viktvarutestet dokumenteras**
   - `docs/sumup-integration.md` med arkitekturen, endpoints, fältmappning och ett tydligt testprotokoll för viktvaran: sälj 1,24 kg i sandbox, klistra in JSON:en, och vi låser hur kvantiteten läses (rapporterad kvantitet, härledd ur radtotal delat med dagens kilopris, eller okänd). Härledningskällan sparas per rad så inventeringsavvikelser går att förklara.
   - Kod skrivs så att alla tre vägarna finns, men bara den verifierade används som standard.

6. **Bevis (acceptans för etapp 1)**
   - Sandbox-försäljning (kort, kontant, viktvara, retur) hämtad och köad, dubblettkörning ger duplikat, omatchat namn syns i granskningsvyn, felkoder syns i körningsloggen. Inga lagerrörelser i denna etapp.

## Etapp 2–5 (för överblick, byggs efter etapp 1)

- **Etapp 2**: bearbetning till lagerrörelser (FEFO ur Zollikons försäljningslager, försäljning blockeras aldrig av saldo), transaktionsregister, returer som motrörelse, granskningsvy och live i Översikt.
- **Etapp 3**: schweizisk prislista i CHF (2,6 % livsmedel / 8,1 % övrigt) knuten till bolaget, katalogexport i SumUps CSV-format samt uppladdning och avstämning av SumUps katalogexport (prisdiff, saknas, extra, moms- och enhetsavvikelse).
- **Etapp 4**: nattlig avstämning av föregående dag och kortet "Kassa SumUp" på Systemstatus (senaste pollning, tysthetslarm, API-fel, omatchade namn, härledda vikter, returer, katalogfilens ålder).
- **Etapp 5**: skarpa nycklar och verifiering mot en hel handelsdag.

## Beroende utanför koden

Zollikons försäljningslager fylls via veckoleveransens överföringsorder från Göteborg. Inleveransen i Zollikon måste bokföras innan veckans försäljning börjar, annars går kvittona mot undersaldo. Kontrollen ligger i etapp 2 som en varning i Systemstatus.
