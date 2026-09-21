# Kundbeställningarna fylls i butikens beställning till grossisten

Butiken ska inte behöva skriva in kundernas beställningar en gång till. När butiken öppnar sin beställning till grossisten ligger kundernas varor redan där, med rätt mängd, och butiken lägger bara till sin egen påfyllning till kyldisken.

## Så fungerar det

1. Butiken väljer leveransdag i sin beställning.
2. Beställningen fylls direkt med varorna ur kundbeställningarna för den dagen **plus** kundbeställningar med tidigare dagar som ännu inte beställts in (så inget glöms bort).
3. Varje sådan rad visar två mängder var för sig:
   - **Kundbeställt** – låst till riktig kund, märkt "Måste med" med kundens namn i informationen.
   - **Påfyllning** – butikens egen mängd till kyldisken, som butiken skriver in själv.
   - Totalen som skickas till grossisten är summan av de två.
4. Ändrar butiken leveransdag räknas kundmängderna om, men påfyllningen butiken själv skrivit in ligger kvar.
5. Butiken kan ta bort en kundrad om varan köps in på annat sätt; då visas en liten notis om vilken kund som påverkas.
6. En vara som redan ligger i en skickad beställning för samma dag fylls inte i igen, så samma kundbeställning kan inte bli dubbelbeställd.

## Vad som visas i raden

- Grön markering "Kundbeställt 4,0 kg – Anna Berg, Café Nord".
- Fältet "Påfyllning" bredvid, tomt från start.
- Radens totala mängd tydligt längst ut, i samma stil som idag.
- På mobilen samma information men i kortform, eftersom butiken ofta beställer i telefonen.

## Teknisk plan

- **Ny hook `useCustomerDemand(storeId, deliveryDate)`** (bygger vidare på `useCustomerCommitted`): hämtar `customer_orders` för butiken med status utanför Levererad/Avbruten/Arkiverad och `wanted_date <= valt datum`, samt deras `customer_order_lines` (hoppar över `is_free_text` utan `product_id`). Returnerar per produkt: mängd, enhet, kundnamn, tidigaste önskade dag och om den är försenad (wanted_date < valt datum).
- **Täckningskontroll:** frågar `shop_orders` + `shop_order_lines` för butiken med `delivery_date`/`desired_delivery_date` i samma fönster och status ej Arkiverad, och drar bort redan beställd mängd per produkt så inget dubbelbeställs.
- **`src/pages/ShopOrders.tsx`:** `OrderLine` får `customerQty: number`, `customerNames: string[]`, `topUpQty: string` och `source: "customer" | "manual"`. Ny effekt: när `desiredDeliveryDate` eller efterfrågan ändras mergas kundrader in i `orderLines` — befintliga rader behåller `topUpQty`, nya läggs till med `priority: "must"` och `priorityQty = customerQty`. `quantity` blir en beräknad summa `customerQty + topUpQty`.
- **Sparning i `handleCreateOrder`:** `quantity_ordered` = summan, `priority = "must"` när `customerQty > 0`, `priority_qty = customerQty`, `priority_note` = kundnamnen. Inga nya kolumner behövs — `priority`, `priority_qty`, `priority_note` finns redan i `shop_order_lines`.
- **`OpenOrderEditor.tsx`:** samma kundrader visas i en öppen beställning när dagen sätts, med samma uppdelning.
- Ingen databasmigration behövs; kundmängden härleds alltid ur kundbeställningarna, inget dubbellagras.
- Radordningen följer `sortLinesByCategory` som idag, och `order_date` sätts som nu via `purchaseDateFor`, så inköpsschemat får varorna på rätt inköpsdag automatiskt.
