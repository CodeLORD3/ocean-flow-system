                                                                                                                                                                                                                                                                                                                                                        # Koncept: Makrill Trade i Dynamics 365-mall

Ett designkoncept som lägger Dynamics 365 (Finance & Operations / Business Central) interaktionsmönster över systemet vi redan har. Ingen affärslogik ändras — det är skalet, listorna och detaljvyerna som får D365-strukturen. Tonade statusrader behålls, de är vår signatur och ersätts inte av neutrala rader.

## Vald riktning: "Tätt rutnät" (alternativ 2), med tydligare färger

Vi bygger på alternativ 2: command bar högst upp, klickbar vyväljare vid rubriken, kvarvarande flikrad, tätt rutnät med kolumnlinjer och kryssrutor, FactBox till höger, statusrad i botten med "4 av 128 rader markerade".

Skillnaden mot prototypen är färgstyrkan — tonerna där var för bleka. Vi kör en steg starkare skala:

- Radton höjs från ~97% till 88–91% ljushet, dvs samma mättnad som dagens rader (`--row-ok`, `--row-warn`, `--row-late`, `--row-done`) i stället för prototypens pasteller.
- Vänsterkanten blir 4 px i full mättnad, inte 2 px.
- Statuspunkten byts mot en färgad statusetikett med mörk text på ljus botten, så statusen läses även i gråskala.
- Markerad rad får tydlig teal ram plus en snäpp mörkare ton av sin egen statusfärg — inte en neutral blå markering.
- Hover mörkar raden ett steg i stället för `brightness-95`, så tonen inte blir grumlig.
- Kolumnlinjer och tabellramar hålls kvar men i en ljusare grå så färgen på raden dominerar.

Allt detta sätts som tokens i `src/index.css`, inte som klasser i komponenterna.

## Vad som kännetecknar D365 — och hur vi tar in det

**1. Command bar i stället för utspridda knappar**
En smal handlingsrad högst upp på varje sida: Ny, Redigera, Spara, Ta bort, sedan grupperade menyer (Skriv ut, Åtgärder, Relaterat). Alltid samma plats, alltid samma ordning. Idag ligger knappar olika på olika sidor.

**2. Vyväljare (saved views)**
Rubriken blir klickbar: "Kundbeställningar: Dagens packning". Fördefinierade vyer per sida — Alla, Dagens, Ej packade, Avvikelser, Mina — och personalen kan spara egen filtrering som en vy. Ersätter dagens fasta flikar.

**3. Filterpanel till höger (eller nedfällbar på mobil)**
En panel med filter per fält och antal träffar per värde, plus fritextsök som söker i alla kolumner. Fältfilter direkt i kolumnhuvudet, som i D365-grid.

**4. Listsida → detaljsida med FastTabs**
D365 skiljer på lista och post. Klick öppnar en postvy där innehållet ligger i kollapsbara sektioner (FastTabs) med sammanfattning i rubriken: "Rader (4)", "Leverans · Upphämtning 15 aug", "Allergier · 2 noterade". Vi behåller rullgardinen i listan för snabb packning, och lägger detaljvyn som fullvy för allt annat.

**5. FactBox — informationspanel till höger**
Smal panel som visar sammanhang för markerad rad utan att man lämnar listan: kundens historik, senaste ordrar, saldo på varan, partiets bäst före, senaste priser. Detta är det starkaste D365-mönstret för vårt bruk.

**6. Workspaces med brickor**
Översikten byggs om till en arbetsyta i D365-modell: rad med räknarbrickor (Att packa 7, Avvikelser 2, Ohämtade 1, Inköp idag 12), där varje bricka är en genväg till listan förfiltrerad på just det. Under brickorna listor och diagram.

**7. Navigering: modul → område → sida**
Sidomenyn grupperas som D365-moduler: Inköp, Produktion, Lager, Försäljning, Butik, Personal, Administration. Brödsmulan blir "Makrill Trade > Försäljning > Kundbeställningar" och visar valt bolag/butik.

**8. Grid-beteende**
Radhöjd 32 px, fast kolumnraster, frusen första kolumn, sorterbara kolumnhuvuden, tal högerställda i monospace med tabular-nums, radmarkering med kryssrutor för massåtgärder. Statusfärgen ligger som hel radton — vår avvikelse från D365 och den vi behåller.

**9. Tangentbord först**
Piltangenter mellan rader, Enter öppnar, Esc stänger, F5 uppdaterar, Alt+N ny post. Samma genvägar överallt.

**10. Meddelandelist**
En tunn rad under command bar för valideringar och resultat ("Order packad — 2 rader"), i stället för att allt går via toast som försvinner.

## Visuell stil

- Ljus, neutral yta. Vitt kort på ljusgrå bakgrund, tunna gråa linjer, radius 2 px — stramare än idag.
- Accentfärg: vår mackerel-teal ersätter Microsofts blå, används på command bar-ikoner, aktiv vy, markerad rad och länkar.
- Mörk sidomeny behålls — det skiljer oss från D365 och fungerar bra i butiksmiljö.
- Typografi: rubriker i nuvarande heading-font men mindre och tightare; brödtext 13 px; alla tal i monospace.
- Kompakt densitet som standard, med ett läge "Bekväm" för mobil och touch.

```text
+--------------------------------------------------------------+
| Makrill Trade > Försäljning > Kundbeställningar    [sök] [@] |
+--------+-----------------------------------------------------+
| Inköp  | Kundbeställningar: Dagens packning        v         |
| Prod.  | [Ny] [Redigera] [Packa] | Skriv ut v  Åtgärder v    |
| Lager  |--------------------------------------- +-----------+|
| Försälj| ! Order packad — 2 rader                | FactBox   ||
|  Ordrar|---------------------------------------- | Kund      ||
|  Kunder| [ ] Nr    Kund      Dag   Kolli  Summa  | Historik  ||
| Butik  | [x] 001   Joakim    lör    2     412,00 | Saldo     ||
| Personal| [ ] 002  Erik      lör    5   1 240,00 | Parti     ||
| Admin  |                                         |           ||
+--------+-----------------------------------------+-----------+|
```

## Etapper

**Etapp 1 — skalet.** Command bar-komponent, meddelandelist, brödsmula i modulform, ny gruppering av sidomenyn, kompakt densitet som standard. Piloteras på Kundbeställningar.

**Etapp 2 — listmönstret.** Grid-komponent med fast kolumnraster, kryssrutor, sorterbara huvuden, vyväljare med sparade vyer, filterpanel. Rullas ut på Kundbeställningar, Inköp, Lager, Produkter.

**Etapp 3 — FactBox och detaljvyer.** Informationspanel per lista och postvyer med FastTabs. Störst nytta på kundorder, produkt och parti.

**Etapp 4 — workspaces.** Översikt per portal byggs om till brickor med räknare som länkar till förfiltrerade listor.

## Teknisk översikt

- Nya delade komponenter: `CommandBar`, `ViewSelector`, `MessageBar`, `DataGrid`, `FactBox`, `FastTab`, `WorkspaceTiles` — under `src/components/shell/`.
- Densitet och ytor styrs med nya designtokens i `src/index.css` (radhöjd, kortyta, linjefärg, kompakt/bekväm), inga hårdkodade färger i komponenterna.
- Sparade vyer lagras per personal i backend så de följer inloggningen; filterläge i URL så en vy kan delas som länk.
- `AppLayout` får command bar-slot och FactBox-slot; sidor fyller dem i stället för att rita egna knappar.
- Tonade statusrader flyttas in i `DataGrid` som radton, oförändrad palett.

## Avgränsning

Detta är ett designkoncept och en etappindelning — ingen kod skrivs innan du valt vilken etapp vi börjar med. Ingen affärslogik, inga migrationer utöver tabellen för sparade vyer i etapp 2.
