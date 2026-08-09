# Stänga luckorna före del 6

Två saker från del 5 är inte byggda. Planen bygger dem, städar två kaskadrelationer och lägger in den efterkontroll du kräver före del 6.

## 1. Levande blötdjur: registreringsdokument och områdesklassificering

Fälten finns på partiet men inget kräver eller visar dem.

- Ny panel på partiet för levande musslor och ostron: upptagningsområde, klassificering (A, B, C), registreringsdokumentets nummer, giltighetstid och utfärdare, samt upptagningsdatum.
- Kravlogik: parti av levande blötdjur utan giltigt registreringsdokument och klassificering kan inte prissättas, överföras eller säljas — samma sorts spärr som frysbehandlingen redan har.
- Klassificering B och C kräver angivet reningscenter eller värmebehandling, annars avvikelse.
- Dokumentet laddas upp i partiets dokumentregister som typen "Registreringsdokument, blötdjur", som redan finns.
- Utgången giltighet syns som röd flagga på partiet och i Egenkontroll under "Förfaller snart".

## 2. Handelsdokument för animaliska biprodukter

- Nytt register för hämtningar: datum, mängd, kategori (2 eller 3), mottagande anläggning, transportör och dokumentnummer, med filuppladdning.
- Krav per butik och per grossistlager, med påminnelse i Egenkontroll när det saknas handelsdokument för en period.
- Grundförutsättning och kontrollpunkt läggs in i basen så den syns i "Att göra".

## 3. Kaskadstädning mot produkter

Alla orderrads- och historiktabeller är redan skyddade. Två tabeller raderas fortfarande automatiskt när en produkt tas bort:

- `product_stock_locations` (saldorader per lagerplats)
- `supplier_article_map` (leverantörens artikelkoppling)

Saldorader ska inte kunna försvinna tyst. Båda ändras till att blockera radering av produkter som fortfarande har saldo eller koppling, med tydligt felmeddelande i gränssnittet i stället för tysta borttagningar.

## 4. Efterkontroll som körs före och efter varje databasändring i del 6

- Summa kilo och lagervärde per lagerplats, före och efter.
- Antal avvikande rader i avstämningen, ska förbli noll.
- Test som bekräftar att båda saldospärrarna fortfarande ger utslag.
- Test som bekräftar att båda guard-testernas undantagslistor är tomma.

Blir någon siffra annan efter än före, backas ändringen och rapporteras — inget vidare bygge.

## Tekniska detaljer

- Migration: nytt fält för upptagningsdatum, reningscenter och dokumentets giltighet på `lots`; trigger som utvidgar den befintliga prissättnings- och rörelsespärren till levande blötdjur; ny tabell `abp_consignments` med GRANT, RLS per butik och `service_role`; ändrade främmande nycklar på `product_stock_locations` och `supplier_article_map` till RESTRICT.
- Frontend: `BivalvePanel.tsx` på partiet, `AbpPanel.tsx` under Egenkontroll, utökning av `useFoodSafety.ts` med kontrollpunkt och grundförutsättning för animaliska biprodukter.
- Alla dokument går till den privata bucketen `lot-documents` med signerade länkar.
