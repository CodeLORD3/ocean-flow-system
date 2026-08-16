# SumUp etapp 2: lagerrörelser, retur och live för Zollikon

Etapp 1 ligger fast: 126 kvitton är köade, idempotensen bevisad, vikten läses ur artikelnamnet. Etapp 2 gör kvittot till en lagerrörelse.

## Först: artikelkopplingarna (blockerande, som du säger)

19 namn ligger i granskningsvyn. Kontrollen visar att de faller i tre grupper, och bara den första kan kopplas rakt av:

**Kopplas direkt till befintlig SKU (6 st)**
- Leksands Knäckebrot → `SV-001`
- Bregott extrasalt → `SV-010`
- Herrgårds Käse → `SV-005`
- Skagen classic small → `KK-003-2HG` respektive Skagen classic large → `KK-003-5HG` (bekräfta storlekarna)
- Signal → någon av Signalkräft-varianterna (`SK-002-K-STD` / `-JUM`) — måste bekräftas, kassans namn säger inte storlek

**Har ingen motsvarighet i registret (11 st)**
Sauce, Shrimps geschält, Matjesfilets 3 St., Krevetten gekocht, Langustine, Felix Salzgurke, Funlight, Hering, Gravlax in Scheiben, Zitronenpfeffer Warmgeräucherter Lachs, NonStop, Geräucherte Makrele, Kalle's. De här säljs i Zollikon men finns inte som produkter i Makrilltrade. Utan produkt finns inget parti och ingen rörelse.

**Fler namn tillkommer** när äldre historik hämtas — "Lachs filet" från testtransaktionen finns till exempel inte i mappningen än, eftersom pollningen bara täckt augusti.

Därför: steg 1 i bygget är en kopplingsvy där varje namn antingen pekas mot en SKU **eller** skapar en ny produkt i rätt kategori i ett klick, med namnförslag. Jag kopplar de 6 säkra och lämnar resten till dig som en lista med kryssval — jag hittar inte på produkter i registret.

## Bearbetningen

Ny funktion `sumup-process` (mönstret från `nimpos`-bearbetningen, som redan gör exakt detta för svenska butiker):

- Per köad händelse: skapa `pos_transactions` med `source = "sumup"`, CHF, kvittonummer, betalsätt, momsfördelning.
- Per rad: `pos_transaction_items` med kvantitet, enhet, `quantity_source` (`namn_vikt` / `rapporterad`), `external_quantity`, kilopris och radtotal i rappen.
- Matchad rad → `stock_movements` typ försäljning **ut ur Zollikons Försäljningslager** (41 produkter har saldo där idag), parti enligt FEFO via befintlig `pos_fefo_lots`.
- Försäljning blockeras aldrig av saldo. Räcker inte partierna bokförs resten utan parti och undersaldot syns som inventeringsavvikelse på Systemstatus.
- Omatchad rad bokförs i `pos_transaction_items` utan rörelse. När kopplingen görs bokförs raden i efterhand med kvittots tidsstämpel (efterbokning körs från kopplingsvyn).
- Testläge rör aldrig skarpt lager.

## Retur

- `REFUND` ger motrörelse **in på ursprungstransaktionens partier**, matchad via transaktionens referens, annars via belopp och tidsfönster.
- Delåterköp i enbart belopp, utan produktrader, loggas som beloppsjustering utan lagerrörelse och flaggas.
- Ingen `REFUND` finns i historiken ännu — bearbetningen byggs, men returbeviset kan först visas när butiken gjort returen.

## CHF hela vägen

`pos_transactions` för Zollikon summeras aldrig ihop med svenska butiker: valutan följer transaktionen, Översikt och Rapporter för Zollikon visar CHF, och momsfördelningen valideras mot 2,6 och 8,1 procent — avvikande sats flaggas i stället för att avrundas bort.

## Live och avstämning

- Zollikons Översikt: dagens antal, omsättning i CHF och per timme, samt lagerförändring via realtime när pollningen bokfört.
- `sumup-reconcile` nattligt: full hämtning av föregående dag, jämför antal och summa mot `pos_transactions`, hämtar saknade, utfall på Systemstatus-kortet "Kassa SumUp".

## Körordning och bevis

1. Kopplingsvyn, de 6 säkra namnen kopplade, resten listade för ditt beslut.
2. Bearbetning byggd, testad mot sandbox — kräver ny sandboxnyckel (den gamla svarar 401).
3. Skarp efterbokning av de 126 köade händelserna, med **saldo i Zollikons Försäljningslager före och efter** och kontroll att de dragna partierna är veckoleveransens.
4. Returbevis när butikens retur finns i historiken.

## Teknisk detalj

- `sumup-process` återanvänder `saleMovements`/`returnMovements`-mönstret ur `_shared/nimpos.ts`, men med SumUps radtolkning ur `_shared/sumup.ts`.
- Kvantitet i produktens enhet: kg ur namnprefixet (källa sparas per rad), styck ur `quantity`.
- Efterbokning: idempotent per `pos_transaction_items.id`, en rörelse per rad och parti, `reference_type = "pos_transaction_item"`.
- Ingen skrivning direkt mot `product_stock_locations` — rörelseloggen är enda sanning, som i resten av systemet.

## Kvar hos dig

- Verifiera i SumUp-dashboarden att `MKC571XH` inte är en andra profil med egen försäljning.
- Riktig retur i Zollikon.
- Ny sandboxnyckel.
