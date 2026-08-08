# Åtta punkter från testperson A

## Först: vad databasen visar (kontrollerat nu)

**Punkt 3 — ja, det blev tre godkännanden.** Tre överföringar inköpslager → grossistlager på samma följesedelsinnehåll:

```text
de21a010  godkand_inleverans   532,0 kg   (den riktiga)
e4eea363  delvis_levererad     530,0 kg   (dubblett)
3e0ff598  delvis_levererad     530,0 kg   (dubblett)
```

Alla tre har bokfört rörelser, så grossistlagret har fått 1 060 kg för mycket. Dessutom är själva följesedeln bokförd två gånger (rapport `b3d3eff9` och `ba271073`, 532 kg var) — det är dubbletten i punkt 2 som ingen kunde radera.

**Punkt 9 — det är inte RLS och inte lagerplatserna.** `transfer_orders` har policyn `is_staff()` för hela tabellen, så butiksanvändaren får läsa raden. Torslanda Torgs leveranslager finns och är aktivt, och överföringen pekar rätt på det. Ordern A skapade står dock kvar i status `plocklista_utskriven` respektive `skapad` — utleveransen blev alltså aldrig godkänd, och en order som inte är avskickad går inte att ta emot. Utöver det finns ingen inkommande-vy för butiken: raden ligger nedsorterad i den vanliga listan på `/stock-transfers` utan markering, och `/receiving` (dit butiken går) bygger helt på butiksordrar och känner inte till överföringar alls. Exakt varför utleveransen inte gick igenom bekräftas i första steget nedan med skarp inloggning.

## Ordning

Städning först, sedan den blockerande punkt 9, sedan resten.

### Steg 0 — backa ut dubbletterna
- Motbokför de två extra ankomstöverföringarna och sätt dem som avvisade.
- Backa ut den dubblettbokförda följesedeln med `unpostPurchaseReport` och radera rapporten.
- Avstämning före/efter per produkt, redovisas i svar.

### Steg 1 — punkt 9, butiken ser och tar emot
- Butiksvyn får en egen sektion högst upp: **Att ta emot** — överföringar där till-lagret hör till butikens enhet, oavsett vem som skapat dem. Antal visas som bricka i menyn.
- Samma inkommande lista läggs även i mottagningsvyn så butiken hittar den där de letar.
- Öppnad leverans visar produktbild, partinummer, skickad kvantitet, fält för mottagen kvantitet och godkännande. Avvikelse kräver orsak (trevägsmatchningen som redan finns).
- Godkänd order försvinner ur "Att ta emot".
- Verifieras skarpt: skapa överföring som grossist, godkänn utleverans, logga in som butiksanvändare på Torslanda Torg och ta emot den.

### Steg 2 — punkt 1, ett steg i stället för två
Godkännande av följesedel bokför partierna direkt till inköpslagret. Knappen "Bokför inleverans" tas bort. Bekräftelsedialog före: "X partier skapas och läggs i inköpslagret. Detta kan inte ångras." Ankomstregistreringen är kvar som eget steg.

### Steg 3 — punkt 2, radera dubblett
Raderaknapp med bekräftelse på obokförd rapport. Bokförd rapport kan inte raderas (backas ut i stället). Dubblettspärren skärps: dokumentnummerspärren finns redan men bara när leverantör är identifierad — den utökas så att dokumentnummer räcker, och varning visas redan vid inläsning i stället för databasfel.

### Steg 4 — punkt 3, ankomstregistreringen stänger
Vyn stängs vid godkännande, grön bekräftelse "Klart. X kilo flyttades till grossistlagret.", knappen låses vid klick, och redan godkänd rad försvinner ur listan.

### Steg 5 — punkt 4, förklara partiet
Kort text vid partiväljaren om varför partiet krävs, plus informationsikon med fartyg, fångstområde och fångstdatum.

### Steg 6 — punkt 5, mottagarväljaren
Sökbar fritext, grupperad Butiker → Produktion → Grossist, och bara mottagare som flödesreglerna tillåter från valt avsändarlager.

### Steg 7 — punkt 6, plocklista för handifyllning
A4 stående, en rad per produkt, 12 mm radhöjd, bild 20×20 mm, produktnamn 14 pt, partinummer under namnet, beställd kvantitet i egen kolumn, tom inramad ruta 25×12 mm för plockad kvantitet, bockruta 8×8 mm, ren svart på vitt, och rader för plockarens namn, datum och signatur i foten.

### Steg 8 — punkt 7, bara det som finns
Prissättningsvyn visar styckdetaljer för produkter med saldo. Övriga bakom "Visa alla produkter".

### Steg 9 — punkt 8, etiketter
Knapp "Skriv ut etiketter" på bokfört parti och i ankomstregistreringen, antal per parti (standard ett per kolli), PDF med sidstorlek exakt lika etiketten via `@page`. Storlek konfigurerbar i inställningarna, standard 62×29 mm, 62 mm kontinuerlig som alternativ. Innehåll: partinummer störst, produktnamn, kvantitet och enhet, bäst före, fångstområde i mindre text, QR-kod minst 20×20 mm.

## Tekniskt

- Städning via rörelseloggen (`recordMovements`, `unpostPurchaseReport`) — inga direktskrivningar mot saldon, spärrarna ligger kvar.
- Inkommande överföringar: nytt filter i `useTransferOrders` på till-lager per butik; ny sektion i `StockTransfers.tsx` och i `Receiving.tsx`; mottagning återanvänder `approveInbound` och `TransferFlowDialog`.
- Sammanslagningen i steg 2 sker i `PurchaseReporting.tsx` genom att bekräftelseflödet anropar `postPurchaseReport` i samma transaktionssteg.
- Dubblettspärr: partiellt unikt index på dokumentnummer utan leverantörskrav, plus förhandskontroll i inläsningen (migration).
- Plocklista och etiketter är nya utskriftsvägar i `transferPdf.ts` respektive ny `labelPdf`; etikettstorlek sparas i `system_settings`. QR via befintligt streckkodsberoende.
- Prisfiltret i `Pricing.tsx` läser saldo från `product_stock_locations`.
- Verifiering av steg 1 sker inloggad som butiksanvändare, inte genom kodgranskning.
