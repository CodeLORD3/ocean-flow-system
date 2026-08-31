# Grossistens ordervy i kundbeställningarnas standard — nytt försök

## Var vi står nu

Det förra försöket lämnade trasig JSX i `src/pages/WholesaleOrders.tsx` och filen återställdes till senast fungerande version (1634 rader, parsar utan fel). Inget av den nya strukturen finns kvar: sidan har fortfarande sina egna KPI-kort och flikarna Per order / Totalvy / Levererade / Arkiverade / Ändringar. Alltså: ingen skada, men inget byggt.

## Vad som byggs

Grossistens orderlista får samma utseende och arbetssätt som Kundbeställningar, med alla nuvarande grossistfunktioner kvar (skapa order åt butik, beslutsstöd/täckning, packsedel, följesedel, leveransnotering, arkivering, ändringslogg, totalvy).

1. **Rubrik och filterrad** som på Kundbeställningar: sökfält (order, kund/butik, produkt), butiksfilter och statusfilter i en kompakt rad.
2. **Vecko- och daggruppering** i orderlistan med samma separatorer och veckorubriker som kundbeställningarna.
3. **Radutseende och täthet** enligt kundbeställningarnas tabell: samma typografi, tonade rader per status, leveranstypsikoner, expanderbar rad med orderns rader.
4. **Markering och bulk**: kryssruta per rad plus "markera alla i dagen/veckan", med bulkutskrift av plocklistor.
5. **Mobil och surfplatta**: kortlayout under tabellbrytpunkten, precis som kundbeställningarna.
6. **Flikarna behålls** men får kundbeställningarnas fliktyp och räknare; Totalvy och Ändringar rörs inte funktionellt.

## Arbetssätt (så det inte går sönder igen)

Ändringarna görs i fyra små steg, ett per svarsomgång, och varje steg verifieras med en parse-/typkontroll innan nästa påbörjas:

1. Hjälpfunktioner och state (gruppering, filter, markering) — utan JSX-ändring.
2. Filterrad + flikhuvud.
3. Orderlistans tabell (desktop) med grupperingsrader.
4. Mobilkort + bulkutskrift.

## Tekniskt

- Endast `src/pages/WholesaleOrders.tsx` ändras; radutseende och hjälpare speglas från `src/components/orders/`-mönstret i Kundbeställningar utan att duplicera affärslogik.
- Ingen databas-, edge function- eller behörighetsändring.
- Befintliga dialoger och handlers återanvänds som de är.
