# Flytta kundbeställning till annan butik (med godkännande)

## Så fungerar det
1. På en kundbeställning finns knappen **"Flytta till annan butik"**. Du väljer butik och kan skriva ett meddelande (t.ex. "kunden hämtar i Särö i stället").
2. Beställningen stannar kvar i din butik tills vidare, med en gul markering **"Väntar på Särö"**. Den kan inte packas medan den väntar.
3. Den mottagande butiken ser beställningen överst i sin lista under **"Förfrågningar från andra butiker"**, med kund, datum, varor och meddelande. Den får en notis.
4. Mottagaren trycker **Godkänn** eller **Avböj** (med orsak).
   - Godkänn: beställningen flyttas in i deras lista och försvinner från din. Kunden och alla rader följer med.
   - Avböj: beställningen ligger kvar hos dig och du får en notis med orsaken.
5. Du kan ångra förfrågan så länge den inte är besvarad.
6. Allt syns i beställningens historik: vem som skickade, vem som godkände, när.

## Regler
- Bara beställningar som inte är packade, utlämnade eller avbrutna kan flyttas.
- Reservationer mot partier i din butik släpps vid godkännande och räknas om mot mottagarens lager (samma logik som idag). Inga lagerrörelser skapas, lagret rörs inte.
- Ordernumret behålls så kunden och kvitton känner igen det; ursprunglig butik sparas.
- Bara flytt mellan butiker i samma bolag. Flytt mellan bolag (t.ex. Sverige till Zollikon) spärras.
- Beställningen följer med in i mottagarens "Fyll i kundbeställningarna" mot grossisten.

## Tekniskt
- Ny tabell `customer_order_transfers` (order_id, from_store_id, to_store_id, status väntar/godkänd/avböjd/återtagen, meddelande, orsak, requested_by/at, decided_by/at). GRANT + RLS: läsning för personal som ser någon av butikerna; ingen direkt skrivning.
- Security definer-funktioner: `request_customer_order_transfer`, `decide_customer_order_transfer` (kontrollerar att beslutande ser mottagande butik, samma bolag, status), `cancel_customer_order_transfer`. Vid godkännande uppdateras `customer_orders.store_id`, `original_store_id` sätts, reservationer nollas, händelse skrivs i `customer_order_events`, notiser skickas.
- Packspärr: trigger på orderrader/order som stoppar packning när en väntande flytt finns.
- UI: knapp och dialog i orderkortet, gul statusbricka i listan, sektion för inkommande förfrågningar i Kundbeställningar.
- Verifiering: typecheck och ett genomspelat flöde mellan två butiker i webbläsaren.
