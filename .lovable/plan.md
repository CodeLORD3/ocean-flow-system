# Butiksbeställning som nätbutik på mobilen

Ja – på telefonen ska butikens beställning kännas som att handla i HM-appen: bläddra bland varor med bild, tryck "+", se kundvagnen växa, och gå till kassan för att skicka. Datorvyn ändras inte.

## Så ser det ut för butiken

```text
[ Sök vara ............ ]
Mest beställt | Fisk | Skaldjur | Kokt | Delikatess ...   (radbryts, ingen sidledsskroll)

 ┌────────┐ ┌────────┐
 │ bild   │ │ bild   │     2 kort per rad
 │ Lax    │ │ Räkor  │
 │ kg     │ │ kg     │
 │ [ + ]  │ │ [-2+]  │     stegknapp när varan ligger i vagnen
 └────────┘ └────────┘

 ─────────────────────────────────────────
  Kundvagn · 7 varor · ca 4 820 kr   [ Till kassan ]   (fast längst ner)
```

1. **Butik (startsida):**
   - Fliken "Mest beställt" visas först. Den visar butikens egna vanligaste varor de senaste 8 veckorna och vanlig mängd, till exempel "brukar: 6 kg".
   - Sedan kommer flikar per kategori och en sökruta.
   - Bara varor som butiken får beställa visas, alltså samma dolda kategorier som idag.
2. **Produktkort:** bild, namn och enhet. "+" lägger varan i vagnen med butikens vanliga mängd, annars 1. Efter det ändrar man mängden med − och +, eller trycker på siffran och skriver. Kg får en decimal.
3. **Kundvagn (nerifrån):**
   - Alla valda varor grupperas per kategori. Man kan ändra mängd, ta bort en vara och märka varor som "Måste med".
   - Kundbeställda varor ligger redan i vagnen och är låsta. Man kan bara lägga till påfyllning på dem, som idag.
4. **Kassan:**
   - Man väljer leveransdag, som måste vara vald, och skriver ett meddelande.
   - Sedan ser man en sammanfattning med antal varor och ungefärligt värde.
   - Två knappar: "Skicka beställning" och "Spara som öppen".
   - Efter att man skickat visas en bekräftelse: "Beställning skickad – leverans tisdag 24 november".
5. **Snabbval:** knappen "Samma som förra [veckodag]" och "Kopiera" i Historik fyller vagnen som idag.

## Vad som inte ändras

- Beställningen sparas exakt som idag: samma order, samma rader, samma inköpsdag, samma prioritet och samma loggning. Grossist, packning, inköpslistor, lager och Fortnox påverkas inte.
- Vagnen sparas på telefonen tills den skickas. Det fungerar redan idag.
- Datorvyn och listorna "Ordrar" och "Historik" behålls.

## Tekniska detaljer

- Ny komponent `src/components/orders/mobile/StoreShopView.tsx` med delar för `ProductCard`, `CartSheet` (bottom sheet) och `CheckoutSheet`. Den renderas i `ShopOrders.tsx` när `creatingOrder && isMobile`. Desktopformuläret behålls bakom `!isMobile`.
- State, `orderLines`, utkastet, kundbehovet och `handleCreateOrder` blir kvar i `ShopOrders.tsx` och skickas in som props. Ingen ny spar-logik och ingen ny tabell.
- "Mest beställt" byggs av en klientfråga på `shop_order_lines` för butiken de senaste 56 dagarna. Den räknar antal ordrar per vara och medianen av `quantity_ordered`, visar topp 30 och tar bara med varor som är aktiva och synliga.
- Värdet i vagnen räknas som mängd × butikens pris från den prislista som redan används. Det märks "ca" och sparas inte.
- Allt följer pekskärmsreglerna: 44 px tryckytor, 16 px fält och Sonner. Kortrutnätet har två kolumner med radbrytning och ingen horisontell scroll. Tabbarna radbryts.
- Det kontrolleras i 390 px med testbutiken Testbutik Inventering. Inga riktiga beställningar skickas.
