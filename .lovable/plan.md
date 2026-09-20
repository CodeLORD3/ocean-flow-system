# Dela upp en låda vid fördelningen (tillägg till etapp 3 och 4)

Ett auktionsparti behöver inte gå odelat till en destination. Har du köpt en låda med 20 kg hel slätvar och Schweiz ska ha 5,6 kg av den lådan, ska du kunna dela partiet vid fördelningen och vid packningen.

## Så blir det i mobilen

- På fördelningsskärmen får varje parti knappen **Dela partiet**.
- Du skriver in hur många kilo som ska till en destination, t.ex. 5,6 kg till Export, och väljer destination för resten (eller delar en gång till).
- Summan av delarna måste stämma med partiets vikt — appen visar hela tiden "kvar att fördela: 14,4 kg" och släpper inte igenom förrän allt är fördelat eller uttryckligen lämnat kvar på auktionslagret.
- Kilo skrivs med högst en decimal. Delning under 0,1 kg är inte möjlig.
- Vid packningen i Fiskhamnen kan en delmängd delas igen om Schweiz ska ha mindre än planerat; resten går tillbaka till auktionslagret som fri vikt.

## Spårbarheten

- Varje del blir ett eget delparti med eget partinummer i formen `moderpartinummer-1`, `-2` och ärver alla fångstuppgifter från moderpartiet: art, latinskt namn, fartyg, fångstområde, fångstdatum, redskap, presentationsform, leverantör.
- Delningen bokförs som lagerrörelser: uttag från moderpartiet och inleverans på delpartiet på samma lagerplats, med orsak "delning av parti". Inga saldon skrivs över och ingen rad raderas.
- Kostpriset per kilo följer moderpartiet; det förblir markerat "preliminärt, avvaktar avräkningsnota" tills avräkningsnotan finns.
- Moderpartiet behåller sin historik och visar sina delpartier; varje delparti visar sitt moderparti och vem som delade och när.

## Regler och spärrar

- Ett preliminärt parti kan delas — verifieringen mot följesedeln slår igenom på moderpartiet och rättar delpartierna proportionellt.
- Ett parti som redan ligger på en skickad leverans kan inte delas.
- Ett delparti kan inte överstiga moderpartiets kvarvarande vikt.
- Har partiet ingen känd vikt ännu ("vikt saknas") går det inte att dela — vikten måste in först, från lappen eller följesedeln.

## Tekniskt

- Ny funktion `splitAuctionLot(lotId, parts)` i `src/lib/auctionLotSplit.ts`, byggd på samma arvsmönster som `src/lib/lotTransformation.ts` (`INHERITED_FIELDS`) och `recordMovement` i `src/lib/stockLedger.ts`.
- Kopplingen mor → del sparas i `lot_transformations` (typ `delning`), så befintlig spårbarhetsvy och `get_lineage` fungerar oförändrat.
- `lots` får `parent_lot_id` och `split_index`; delpartier ärver `auction_status` och destination sätts per delparti i `auction_purchases`-fördelningen (rad per delparti med referens till ursprungsköpet).
- Rörelserna får referenstypen `lot_split` med idempotensnyckel per delparti, så en dubbeltryckning aldrig dubblar vikten.
- Mobilvyn: eget steg i fördelningen, sifferfält med `inputMode="decimal"`, knappar 64 px, "kvar att fördela" som stor siffra.
