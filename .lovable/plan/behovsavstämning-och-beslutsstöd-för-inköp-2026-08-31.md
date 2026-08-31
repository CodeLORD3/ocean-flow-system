# Behovsavstämning och beslutsstöd för inköp

## Mål
Bygga vidare på Makrill Trades befintliga inköps- och orderflöden utan att ändra nuvarande design, orderkolumner eller Totallistans befintliga logik.

## Plan

1. **Förbered datamodell och avgränsningar**
   - Använd `customer_orders.wanted_date` som enda datumgrund för kundbehov per vald vecka.
   - Återanvänd den befintliga Totalliste-logiken/datagrunden för kundbehov i stället för en ny parallell aggregering.
   - Summera grossistbeställningar från `shop_orders` och `shop_order_lines` per produkt och leveransdatum.
   - Beräkna utestående mängd i andra öppna grossistordrar som `beställt − mottaget`, där mottaget hämtas från `quantity_delivered`, och exkludera ordern som redigeras.
   - Återanvänd `products.id` som matchningskoppling eftersom båda katalogerna redan pekar på samma produktregister. `needs_product_match` och saknat `product_id` ska ge läget Kontrollera, aldrig en automatisk osäker matchning.
   - Lägga till endast den datamodell/konfiguration som behövs för en justerbar överskottsgräns och eventuell revisionsinformation kring manuell matchningsbekräftelse. Ingen lager-, prognos- eller rekommendationslogik byggs.

2. **Ny avstämningsvy**
   - Skapa en ny vy i samma flik-/menysystem som befintliga ordervyer, åtkomlig för grossist/admin enligt befintlig sidbehörighet.
   - Veckoväljare baserad på leverans-/upphämtningsdatum, med kategorifilter enligt Totallistans befintliga filtermönster.
   - Visa kategorirubriker i befintligt format med kategori, antal produkter och antal rader.
   - Visa produktrader med befintlig miniatyr, produktnamn, enhet och högerställda mängder för:
     - Kundbehov
     - Beställt
     - Behovsdifferens (`Beställt − Kundbehov`)
   - Statuspill syskon till befintlig orderstatus:
     - **Täckt** när säker matchning och beställt täcker behovet.
     - **Saknas** när beställt understiger behovet eller ingen grossistorder finns.
     - **Kontrollera** när matchningen är osäker; ingen differens räknas eller visas som ett beslut.
     - **Info** när produkten inte är markerad som grossistvara.
   - Visa alltid statusens text tillsammans med färg. Täckt-rader med konfigurerat stort överskott behåller grönt men får texten “Stort överskott – kontrollera svinnrisk”.
   - Sammanfattning överst med klickbara antal per status, plus “Visa endast avvikelser” och kategori-filter.
   - Klick på Saknas/Kontrollera öppnar relevant grossistorder/rad när koppling finns; annars visas tydligt att åtgärd eller manuell matchning krävs.
   - Tomma lägen ska använda appens befintliga `EmptyState`-mönster.

3. **Beslutsstöd i “Ny beställning”**
   - Utöka befintliga produktrader i grossistorderns orderformulär, utan att ändra befintliga orderkolumner i orderlistan.
   - Visa alltid i samma rad:
     - Kundbehov denna vecka
     - Redan beställt i andra öppna grossistordrar med status Ny/Skickad/Delvis levererad
     - Beställt-fältet
     - Live-indikator som uppdateras vid varje ändring och visar om behovet täcks
   - Visa “–” i stället för noll för redan beställt.
   - Blockera dubbletter i den nya ordern och visa “Produkten finns redan i denna order” med länk/fokus till befintlig rad.
   - Lägg senaste veckornas snitt och förra veckans beställda mängd bakom en expanderbar sekundärrad.
   - Rekommendera eller skicka aldrig en kvantitet automatiskt; användaren måste själv skriva och bekräfta beställt mängd.

4. **Manuell produktmatchning**
   - Bygg ett explicit bekräftelseflöde för kundrader med osäker matchning eller saknad produktkoppling.
   - Textlikhet får endast visa kandidater med tydlig osäkerhetsmarkering; ingen kandidat väljs automatiskt.
   - Vid manuell bekräftelse sparas den delade produktkopplingen så att kommande veckor kan återanvända den bekräftade `product_id`-kopplingen.
   - Visa en audit-/bekräftelsemarkering och möjlighet att avbryta utan att skapa differens eller orderkvantitet.

5. **Navigation, behörighet och befintliga mönster**
   - Lägg till ny vy som meny-/flikval med befintlig mörk sidebar, aktiv-state, ikonstil, flikrader, knappar, kort, filter och statuspill.
   - Låt Kundbeställningar → Totallista vara oförändrad i utseende och beteende.
   - Låt grossistorderns befintliga Beställt/Packat/Avvikelse/Status vara oförändrade; den nya kolumnen benämns alltid Behovsdifferens.
   - Behåll separata domänobjekt för kundbeställningar och grossistordrar.
   - Anpassa endast med befintliga responsiva klasser för mobil och surfplatta.

6. **Verifiering**
   - Kontrollera att vecka filtreras på wanted-/leveransdatum och inte skapelsedatum.
   - Verifiera statusfallen Täckt, Saknas, Kontrollera och Info inklusive stora överskott.
   - Verifiera att leveransavvikelse och behovsdifferens visas separat.
   - Verifiera att öppna orderstatusar, mottaget mängd och aktuell order exkluderas korrekt från “Redan beställt”.
   - Verifiera dubblettskydd, manuell matchningsbekräftelse, live-indikator och mobil layout.
   - Kontrollera befintliga Totallistan och orderlistan för att säkerställa att de inte förändrats.

## Tekniskt
- Befintliga hooks och komponenter återanvänds först, särskilt Totallistans datum-/kategori-/produktgruppering, `ProductThumb`, `Badge`, `Button`, `Select`, `Input`, `Card`, `EmptyState` och befintliga orderradsmönster.
- Nya komponenter hålls separata från `TotalOrderedView.tsx` och `WholesaleOrders.tsx` där det minskar risken för regression, men monteras via befintliga route-/tabbmönster.
- Databasändringar görs endast om konfigurerbar överskottsgräns eller matchningsrevision saknar befintligt stöd. Alla nya publika tabeller får explicita grants, RLS och policies i samma migration.
- Ingen automatisk produktmatchning, lagerberäkning, nettobehovsberäkning, prognos eller rekommenderad orderkvantitet implementeras.