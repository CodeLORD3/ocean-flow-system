# Totallistan: lager, beställt till grossisten och vad som kan säljas

Totallistan visar idag beställd mängd, packat och kvar att packa. Den vet inget om vad butiken redan har på lager eller vad som är beställt av grossisten, så man får ingen känsla för om man klarar dagen eller inte.

## Så här blir det

Tre nya kolumner per produktrad, efter Diff:

- **Lager** — vad butiken har i sitt lager just nu på den varan (summan av butikens lagerplatser).
- **Order** — vad som redan är beställt av grossisten och ännu inte levererat, för dagar/veckor som ligger i det valda intervallet.
- **Kan säljas** — lager minus det som är kvar att packa till kundbeställningarna, alltså vad som faktiskt är fritt att sälja över disk. Blir siffran negativ visas den i varningsfärg, för då räcker inte lagret ens till redan tagna beställningar.

**Gömma kolumnerna.** En knapp "Kolumner" i kontrollraden öppnar en liten lista med av/på-reglage för Lager, Order och Kan säljas. Från början är alla tre avstängda, så vyn ser ut exakt som idag tills man själv slår på dem. Valet minns per användare i webbläsaren och gäller nästa gång man öppnar listan.

**På telefon** ryms inte fler kolumner i rad. Där visas de påslagna värdena i stället som små etiketter under produktnamnet ("Lager 12,0 kg · Order 20,0 kg · Kan säljas 4,0 kg"), i samma stil som dagens Diff-etikett.

**I rullgardinen** under en produkt läggs samma uppgifter till i sammanfattningen till höger, tillsammans med befintliga Packat/Kvar.

**Export och utskrift.** Excel/CSV-exporten får alltid med de tre nya kolumnerna. Utskriftslistan får dem bara när de är påslagna i vyn, så packlistan inte blir rörig.

Matchningen mellan totallistans rad och lager/grossistorder görs på produkt när kundorderraden pekar på en produkt, annars på normaliserat varunamn. Rader som inte kan matchas visar "–" i stället för en påhittad nolla, så man inte tror att lagret är tomt när det bara saknas koppling.

## Teknik

- Ny hook i `src/hooks/useCustomerOrders.ts` eller egen fil `src/hooks/useTotalListStock.ts`:
  - Lager: `product_stock_locations` joinat `storage_locations` filtrerat på butikens `store_id`, summerat per `product_id` (returnerar även produktnamn/enhet för namnmatchning).
  - Order: återanvänder befintliga `useShopOrderLines` från `src/hooks/usePurchaseReconciliation.ts`; räknar `quantity_ordered − quantity_delivered` för rader med `shop_orders.status` i `OPEN_SHOP_ORDER_STATUSES`, filtrerat på butik och på `effective_date` inom totallistans `bounds`.
- `src/components/orders/TotalOrderedView.tsx`: `ProductRow` utökas med `stock`, `onOrder`, `sellable` (alla `number | null`). Uppslag sker efter aggregeringen med en Map på `product_id` och en fallback-Map på `matchKey(name)` från `src/lib/purchaseReconciliation.ts`.
- Kolumnvalet ligger i `useState` initierat från `localStorage`-nyckeln `totalList.columns`, med `Popover` + `Switch` (befintliga shadcn-komponenter). Kolumnrubrikerna och cellerna renderas villkorligt; breddarna justeras så raden fortfarande ryms på surfplatta.
- Negativt "Kan säljas" använder semantiska tokens (`destructive`/`warning`) — inga hårdkodade färger.
- `exportCsv` får kolumnerna Lager, Order, Kan säljas. `printableGroups` och `TotalChecklistRow` i `src/lib/totalOrderedChecklistPdf.ts` får valfria fält `stock`, `onOrder`, `sellable` som bara ritas när de skickas med.
- Ingen ändring av databas, lagerlogik eller packningslogik — bara läsning och presentation.
