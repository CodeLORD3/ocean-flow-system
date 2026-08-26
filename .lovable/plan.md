# Totalt beställt — ny vy på Kundbeställningar

En ny knapp **Totalt** i samma knapprad som Hämtningar / Leveransrutt / Kökslista / Inköpsbehov / Kundregister / Statistik på /customer-orders. Den öppnar en undervy i samma route (samma "Tillbaka till beställningar"-mönster som Inköpsbehov), inte en ny sida. Inköpsbehov lämnas orörd.

Syftet: se hur mycket som totalt är beställt per vara under valda dagar/veckor, och kunna fälla ut vilka ordrar som ligger bakom varje summa.

## Vad vyn innehåller

**Kontrollrad högst upp**
- Växling Dagligen / Veckovis (samma veckonumrering som "VECKA 34"-rubrikerna i orderlistan).
- Datumintervall från–till, plus en kalender där man bockar i flera enskilda dagar (t.ex. bara tisdag och fredag). Bockade dagar styr urvalet när sådana finns; annars gäller intervallet.
- Snabbval: Idag, Denna vecka, Förra veckan.
- Ordertyp-filter: Alla / Upphämtning / Leverans (samma fält och etiketter som orderlistan använder).
- Sökfält mot produktnamn.

**Sammanfattning**
- Antal unika ordrar i urvalet och antal olika produkter, som badges i samma stil som resten av sidan.

**Resultat**
- Ett kort per dag (Dagligen) eller per vecka (Veckovis), rubrik i samma stil som veckorubrikerna i orderlistan.
- Rader per produkt och enhet: produktnamn, total mängd med enhet (kg med en decimal, st utan), antal ordrar som innehåller produkten. Kilo och styck summeras alltid var för sig som separata rader — aldrig konverterat eller sammanblandat.
- Klick på raden fäller ut ordrarna bakom summan: ordernummer, kundnamn, butik och mängd i just den ordern. Klick på ett ordernummer är läsning bara — ingen redigering här.
- Sortering alfabetiskt som standard; klick på kolumnrubriken Mängd sorterar på störst mängd.

**Export**
- Knapp "Exportera CSV" som laddar ner exakt de rader som visas (period, produkt, enhet, mängd, antal ordrar, ordernummer).

Fungerar på surfplatta/mindre skärmar: samma korttäta layout och stora tryckytor som Kökslista och Inköpsbehov.

## Teknik

- Ny komponent `src/components/orders/TotalOrderedView.tsx`, renderad från `src/pages/CustomerOrders.tsx` under ett nytt `panel`-värde `"totals"`, med knapp och rubriktext ("Totalt beställt") inlagda i befintliga knapprad respektive rubrik-switch.
- Data hämtas med befintliga `useCustomerOrders` (`ORDER_SELECT` innehåller redan `customer_order_lines` med `quantity`, `unit`, `products(name, unit)` och `free_text_name`) filtrerad på butik via `effectiveStore` och på `fromDate`/`toDate` för hela urvalets ytterkanter. Ingen ny hook, tabell eller query mot databasen.
- Aggregering sker i `useMemo` i komponenten: filtrera bort dagar som inte är bockade, gruppera per dag eller ISO-vecka, sedan per `produktnamn + enhet`. Produktnamn tas från `products.name` med `free_text_name` som fallback, enhet från radens `unit` med produktens `unit` som fallback.
- Återanvänder `isoWeek`-logiken från CustomerOrders (flyttas till en delad hjälpfunktion i `src/lib/customerOrders.ts` så båda vyerna använder samma numrering, utan att ändra beteendet).
- Byggd av befintliga shadcn-komponenter: Card, Badge, Button, ToggleGroup, Calendar, Input, Select, Table. Endast semantiska färgtokens.
- CSV genereras klientsida med en blob-nedladdning; inga nya beroenden.
