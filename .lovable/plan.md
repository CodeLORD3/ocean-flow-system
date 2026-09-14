# Etapp: lås upp löneberäkningen och starta parallelldriften

Kontrollerat mot skarp data i dag. Två saker skiljer sig från beställningen och behöver ditt beslut — de står under "Att bekräfta" längst ned.

## 1. OB-flagga per anställning

- Tre nya fält på anställningsraden: OB 50, OB 70, OB 100 (ja/nej), plus en anteckning om varifrån värdet kom.
- Löneberäkningen läser flaggorna per anställning. Saknas flaggan räknas ingen OB — aldrig bolagsdefault.
- **Startvärde**: OB på för timavlönade, av för månadsavlönade. Det gäller båda bolagen, eftersom lönefilerna inte innehåller någon OB-inställning per person (kontrollerat: PAXml-filerna har bara lön, skattetabell, anställningsform — ingen OB-markering).
- DE No.1-listan nedan sparas först när du godkänt den. FSAB (79 personer) sätts med samma regel; laddar du upp Personalkollen-exporten med Aktiv/Inaktiv per person sätter jag FSAB exakt enligt den istället.
- Efteråt visas: antal med respektive utan OB per bolag, samt två beräkningsexempel — en timanställd som jobbar en lördagskväll (OB 70 + OB 100) och en månadsavlönad samma tid (0 kr OB).

**DE No.1 — förslag (OB på = timavlönad):**

OB PÅ (22): Morris Fagerberg 006, Erik Selin 007, Olle Fomin Malmros 008, Albin Cronmark 010, Mårten Frösslund 011, Svea Pettersson 012, Assar Leideman 013, Elias Levander 014, Filip Saverstam 015, Davies Kirumira 016, Theodor De Chateau 018, Max Frösslund 019, Oskar Ingelfeldt 020, Otto Berntsson 021, Anna Leideman 024, Melker Åkerman 026, Olle Ingelfeldt 027, Sixten Lundin 029, Adam Sandström 030, Gustav Jorius 031, Fredrik Bredin 032, Liv Panne 035, Julia Craske 036, Marlon Miettinen 037

OB AV (11): Tim Hvarfvenius 002, Baldvin Ahlander 003, Max Olsson 004, Lukas Sterba 005, Melker Cronmark 009, Allan Grenklo Hankers 022, Vilma Gunnarsson 023, Johan Holmgren 025, Fredric Lindqvist 028, Tristan Wennerlund 033, Samet Mehmeti 034

## 2. En gällande OB-policy per bolag

- 8 policyrader finns för två bolag (fyra versioner var). Behåll den senaste per bolag som gällande, sätt slutdatum på övriga så de blir historik.
- De 5 OB-fönstren utan bolag tas bort (oanvända).
- Efteråt visas den gällande tabellen per bolag: nivå, tidsintervall, veckodagar, procent.

## 3. Registerstädning

**Rader att besluta om (visas som lista med Radera / Koppla till bolag per rad):**

| Namn | Bolag | Nr | Läge |
| --- | --- | --- | --- |
| Marcus Alm | FSAB | 1010101 | Avmarkerad, saknas i lönefilen |
| Gustav Heijel | FSAB | 13 | Avmarkerad, saknas i lönefilen |
| Ewa Ahlander | FSAB | 29 | Tom dubblett av Ewa 87 |
| Fredrik Bredin | – | – | Finns även som DE No.1 032 |
| Fredric Lindqvist | – | – | Finns även som DE No.1 028 |
| Erik Holm | – | – | Ingen bolagsrad alls |
| Testperson A | – | – | Testdata |

**Testflagga:** av de 12 personerna utan personnummer är bara **9 test** (Korbevis DST 540, Korbevis O Symmetri, Körbevis DST Etapp 2b, Körbevis S Etapp 2b, Körbevis W Etapp 2b, Körbevis2b Scenario, Pilot Testperson, TESTDATA Revision 2026-09-14, Testperson A). Tre är verkliga personer som bara saknar personnummer: **Anna Hamilton** och **Leonie Giertz** (båda aktiva) samt Ewa-dubbletten. De nio flaggas som test och filtreras ur personalvyer, löneberäkning och jämförelsevyn — inget raderas. Anna och Leonie hamnar i stället på en lista "saknar personnummer, kan inte stämpla".

**Personalkollen:** 4 poster är okopplade. De listas med namn och orsak (ingen e-postträff, inget personnummer, eller person saknas i registret) och kopplas där en säker träff finns.

## 4. Stationer för utrullning

Skapar station med aktiveringskod för: Ålstens Fisk, Fiskskaldjur Torslanda Torg, Fiskskaldjur Amhult, Fiskskaldjur Särö Centrum, Fiskskaldjur Eriksberg, Fiskskaldjur Marstrand, Grossist Göteborg. Kungsholmen döps om till samma mönster (butiksnamn + "kassa"). Testraderna test1 och TEST tas bort, likaså de två redan avaktiverade testraderna. Grossist Göteborg har redan stationen "Maebel" — den döps om i stället för att dubbleras.

Efteråt: lista med enhet, stationsnamn, aktiveringskod och status, att aktivera på plats.

## 5. Parallellkörningsvyn i drift

- Daglig jämförelse klocka mot Personalkollen per butik och dag, med tolerans grön ≤5 min, gul ≤15 min, röd över det.
- Kort på adminstartsidan: per butik dagens och veckans status, plus ny mätare **sammanhängande stämmande dagar** och hur långt butiken kommit mot två månader.
- Testflaggade personer och stationer exkluderas.

## 6. Attest i drift

- Attestvyn öppnas för butikschefsrollen, begränsad till egna enheter.
- Veckans oattesterade pass per butik, en-trycks-attest per rad, och tidsjustering som alltid skriver journalrad (vem, när, från/till, orsak).
- Systemnotis varje vecka till butikschef när pass äldre än 7 dagar är oattesterade.
- Redovisas med skärmdump av flödet.

## 7. Fortnox-återkoppling

- DE No.1 står som frånkopplad. Instruktion: du (eller den som har Fortnox-administratör för DE No.1) öppnar Fortnox-sidan i systemet, väljer DE No.1 och klickar Anslut, loggar in i Fortnox och godkänner behörigheterna för lön och kunder. Ingen nyckel behöver klistras in.
- Därefter körs kopplingen av anställningar automatiskt på anställningsnummer för båda bolagen (98 saknar koppling i dag).
- Rapport: antal kopplade, samt lista på de som inte gick och varför.

**Byggs inte nu:** AGI-underlag, LF-fil, SIE, övertidsjournal, personalliggare.

## Att bekräfta innan jag sparar

1. **FSAB:s OB per person** finns inte i något underlag jag har. Godkänner du regeln "timavlönad = OB på, månadsavlönad = OB av" för FSAB också, eller laddar du upp Personalkollen-exporten med Aktiv/Inaktiv?
2. **DE No.1-listan ovan** — säg vilka undantag som ska ändras, annars sparas den som den står.
3. **De 7 raderna i punkt 3** — radera eller koppla, per rad.

## Tekniskt

- Migrering: `employments.ob_50/ob_70/ob_100 boolean not null default false` + `ob_source text`; `employees.is_test boolean not null default false`; `payroll_policies` får slutdatum på dubbletter; borttagning av bolagslösa `ob_windows`.
- `supabase/functions/payroll-compute/index.ts`: OB-fönster appliceras bara när anställningens motsvarande flagga är sann; nivåmappning 50/70/100 mot flaggorna.
- `src/hooks/useEmployees.ts`, `src/pages/Employees.tsx`, `src/components/employees/EmploymentForm.tsx`: OB-kryssrutor per anställning, testfilter.
- `src/pages/ClockVsPk.tsx` + ny startsideswidget: dagsstatus per butik, streckmätare för sammanhängande stämmande dagar, testfilter.
- `src/pages/PayrollReview.tsx` (attest): butikschefsroll, en-trycks-attest, journalförd justering; `hr-notify` får veckoregel för oattesterade pass äldre än 7 dagar.
- Stationer skapas via `clock_station_create`; testrader via `clock_station_revoke` + borttagning.
- Anställningskoppling via befintlig `fortnox-import-employees` i läge link, matchning på `employment_number`.
