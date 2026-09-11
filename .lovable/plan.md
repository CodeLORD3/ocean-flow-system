# Totallistan: grönt för packat och en Diff-kolumn

Totallistan visar idag bara beställd mängd och antal ordrar. Den vet ingenting om vad som redan är packat, vilket gör att man riskerar att sortera upp samma vara två gånger. Varje orderrad i beställningarna har redan en packstatus (opackad, packad, restnoterad, struken) och en packad mängd, så uppgifterna finns — de visas bara inte här.

## Så här blir det

**Ny kolumn Diff** mellan Mängd och Ordrar. Den visar hur mycket som återstår att packa på raden: beställd mängd minus packad mängd. Är allt packat visas 0 (eller ett streck), annars den kvarvarande mängden i samma enhet som raden.

**Färg på produktraden**
- Grön rad när allt på raden är packat.
- Gul rad när en del av raden är packad, t.ex. när två beställningar har samma vara och bara den ena är packad.
- Neutral rad (som idag) när inget är packat.

Grönt och gult sitter som en tonad bakgrund plus en tydlig färgmarkering i vänsterkanten, i samma stil som orderlistans tonade rader — inte bara färgad text.

**I rullgardinen** får varje beställning under raden sin egen färg och en liten statusetikett: den packade beställningen blir grön, en delvis packad gul, en opackad neutral. Så ser man direkt vilken beställning som redan är klar.

**Sammanfattningen till höger** i utfällt läge får en rad "Packat" och en rad "Kvar", så man ser summorna per vara.

Strukna rader räknas inte som kvarvarande behov, och restnoterade rader visas som ej packade.

Excel/CSV-exporten och utskriftslistan får samma nya uppgifter: packad mängd och diff per produkt.

## Teknik

- `src/components/orders/TotalOrderedView.tsx`: aggregeringen i `useMemo` utökas så `ProductRow` och `OrderLink` även bär `packed`, `remaining` och en härledd status (`packad` | `delvis` | `opackad`). Packad mängd tas från radens `quantity_packed`, med `quantity_ordered` som fallback när `pack_status === "packad"` men mängd saknas. Rader med `pack_status === "struken"` räknas bort från både total och behov.
- Radstatus per order: alla rader packade → grön, minst en men inte alla → gul.
- Färgerna använder befintliga semantiska tokens (`success`, `warning`) som redan används i `src/lib/purchaseReconciliation.ts` för statuspiller — inga hårdkodade färger.
- Kolumnrubriken utökas med "Diff"; kolumnbredderna justeras så raden fortfarande får plats på surfplatta/mobil (Diff döljs under `md` och visas i stället som en liten etikett vid mängden).
- `exportCsv` och `printableGroups`/`PrintTotalChecklistDialog`-underlaget får kolumnerna Packat och Diff.
- Ingen ändring av databas, hooks eller packningslogik — endast presentation av redan hämtade fält.
