# Butikernas anteckningar syns tydligt hos grossisten

Bara visning hos grossisten och i utskrifterna ändras. Ingen ändring av datamodell, orderdata eller butikens sida.

## 1. Ordrens anteckning överst i utfälld order
- Stor amber-ruta (status-tonen bärnsten från temat) överst i den utfällda ordern, före raderna.
- Rubrik "Anteckning från butiken", full text, radbrytningar bevarade, textstorlek 16 px (mobil 17 px), ingen avkortning.
- Syns bara när anteckning finns.

## 2. Märkning på ihopfälld orderrad
- Märket "📝 Anteckning" på orderraden i listan, både i tabellen och i mobilkorten.
- Räknar även radanteckningar: "📝 Anteckning · 2 rader" när några rader har egen anteckning.
- Arkiverat-fliken får samma märke i stället för den 10 px avkortade texten (texten visas i full längd när ordern fälls ut).

## 3. Radanteckning som egen rad
- Under produktnamnet visas radens anteckning som fulltext i amber-ton, utan avkortning och utan hover.
- Gäller alla rader, inte bara prioriterade. Prioritetsmärket behålls för prioritet men bär inte längre texten.
- Mobil: raderna visas som staplade kort under tabellbrytpunkten, så ingen sidledsscroll krävs för att läsa anteckningen.

## 4. Totalvyn / plocklistan
- Per produkt: lista under produktnamnet med "Butik: anteckning" för varje radanteckning.
- Överst i vyn: en ruta "Ordrar med anteckning" med butik, leveransdag och full ordertext.
- Samma innehåll i utskriven checklista (egen rad under produkten, plus anteckningsblock först) och en kolumn "Anteckningar" i CSV.

## 5. Utskrifter
- Packsedel, följesedel och bulk-packlistan: ordrens anteckning i en inramad ruta direkt under sidhuvudet, före tabellen. Tas bort från botten/efter signaturraderna.
- Radanteckning skrivs som en extra kursiv rad under respektive produktrad.

## Tekniskt
- Filer: `src/pages/WholesaleOrders.tsx` (detalj, accordion-rad, mobilkort, arkiv, bulk-HTML på rad ~118), `src/components/orders/linePriority.tsx` (badge utan text), `src/components/orders/WholesaleTotalOrderedView.tsx`, `src/lib/totalOrderedChecklistPdf.ts` (valfria fält `notes` per rad och `orderNotes` i payload), `src/components/PackingSlip.tsx`, `src/components/DeliveryNote.tsx`.
- En liten delad komponent `OrderNoteCallout` för rutan; färger via befintliga semantiska tokens.
- Data finns redan i hämtningen (`notes`, `shop_order_lines.priority_note`); kontrolleras att följesedelns hämtning innehåller dem, annars läggs fälten till i select (ingen schemaändring).
- Verifieras med typkontroll och skärmdump i desktop och mobilbredd på en order som har anteckning.
