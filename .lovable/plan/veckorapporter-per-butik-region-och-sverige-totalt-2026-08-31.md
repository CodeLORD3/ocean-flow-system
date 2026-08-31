# Veckorapporter per butik, region och Sverige totalt

Automatiska veckorapporter ovanpå befintliga dagsrapporter. Inget UI byggs förrän datamodellen är godkänd.

## 1. Fält på butik

Två nya fält på butiken, båda redigerbara i adminvyn (Butiker → Redigera butik):

- **Region**: Göteborg / Stockholm / Schweiz (tomt = ingår inte i veckorapporter)
- **Veckans sista öppetdag**: veckodag, default söndag

Föreslagen mappning (sparas först efter ditt godkännande):

| Butik | Ort | Region | Sista öppetdag |
|---|---|---|---|
| Fiskskaldjur Torslanda Torg | Göteborg | Göteborg | söndag |
| Fiskskaldjur Amhult | Torslanda | Göteborg | söndag |
| Fiskskaldjur Eriksberg | Göteborg | Göteborg | söndag |
| Fiskskaldjur Särö Centrum | Särö | Göteborg | söndag |
| Fiskskaldjur Marstrand | Marstrand | Göteborg | söndag |
| Fiskskaldjur Kungsholmen | Stockholm | Stockholm | söndag |
| Ålstens Fisk | Stockholm | Stockholm | söndag |
| Fiskskaldjur Zollikon | Zollikon, Zürich | Schweiz | söndag |
| Morges Market | Morges | Schweiz | söndag |
| Grossist Göteborg | Göteborg | — (exkluderas) | — |
| Administration DE No.1 | Stockholm | — (exkluderas) | — |

Sverige totalt = Göteborg + Stockholm. Schweiz ingår inte i Sverige totalt.

Rätta gärna sista öppetdag för de butiker som faktiskt stänger tidigare i veckan — jag sätter söndag överallt om inget annat anges.

## 2. Ny tabell: veckorapport per butik

En rad per butik och ISO-vecka (måndag–söndag):

- butik, region (kopieras in vid beräkning så historik inte ändras om regionen byts senare)
- ISO-år, ISO-vecka, veckans startdatum, veckans slutdatum
- antal inkomna dagsrapporter, förväntat antal öppetdagar
- status: pågående / låst / stängd denna vecka
- summa omsättning (kr), snitt omsättning per dag (kr)
- bemanning: summa arbetade timmar + summa personpass — exakt de två mått som redan visas i dagsrapportarkivet, inga nya mått
- låst tidpunkt
- avvikelseflagga efter låsning + text som beskriver skillnaden

Omsättningsmåttet är dagsrapportens bruttoomsättning (`gross_sales`), samma siffra som listas per dag idag.

## 3. Regionnivå

Regionsiffrorna räknas fram på läsning (vy) ur butiksveckorapporterna, så de aldrig kan bli osynkroniserade:

- en rad per region och vecka, plus en rad "Sverige totalt"
- samma mått summerade, samt snitt kr/dag
- status **Klar** när alla aktiva butiker i gruppen har låst vecka (butiker markerade "stängd denna vecka" räknas som klara), annars **Preliminär** med lista på saknade butiker
- jämförelse mot föregående ISO-veckas låsta siffror: diff i kr och diff i procent

## 4. Regelmotor (exakta regler)

1. När en dagsrapport sparas (= attesterad, enligt ditt val) räknas butikens veckorapport för den dagens ISO-vecka om.
2. Är dagens datum butikens "veckans sista öppetdag" eller senare i den veckan → status sätts till **låst** och låst tidpunkt sätts. Butiker som stänger på lördag får därmed veckan klar redan lördag.
3. En redan låst veckorapport räknas aldrig om och skrivs aldrig över. Redigeras en gammal dagsrapport i efterhand jämförs nya summan mot den låsta: skiljer den sig sätts flaggan **avviker efter låsning** med den beräknade skillnaden, för manuell granskning.
4. Inga dagsrapporter raderas eller ändras av veckologiken — den läser bara.
5. Förväntat antal öppetdagar per butik och vecka = antal dagar från veckans måndag till och med butikens sista öppetdag.
6. Admin kan markera en butik som **stängd denna vecka** — då blockerar den inte regionens eller Sveriges status.
7. Regionens/Sveriges status är alltid härledd, aldrig manuellt satt.

## 5. UI (efter godkännande)

Ny sektion "Veckorapporter" i Rapporter & Analys, samma expanderbara stil som Dagsrapporter (butiker):

- filter: enskild butik / region / Sverige totalt
- rad per vecka: "Vecka 35, 24–30 aug", status Preliminär/Klar, summa kr, diff kr och % mot föregående vecka, snitt kr/dag, bemanning (timmar + personpass), inkomna dagsrapporter av förväntat antal
- expanderad vy bryter ner på butiksnivå med samma kolumner samt låst tidpunkt och eventuell avvikelseflagga
- endast siffror, inga värderande ord

## Tekniska detaljer

- Nya kolumner på `stores`: `region text`, `week_last_open_dow smallint` (1=mån … 7=sön, default 7).
- Ny tabell `weekly_store_reports` med unikt index på (store_id, iso_year, iso_week), RLS via befintliga `is_staff()` + `can_see_store()`, samt GRANT till authenticated/service_role.
- Databasfunktion `recompute_weekly_store_report(store_id, date)` (security definer) som gör punkt 1–3, anropad av en trigger på `daily_reports` (insert/update).
- Vy `weekly_region_reports` som aggregerar butiksrapporter per region + rad `SE_TOTAL`, med föregående veckas jämförelse och härledd status.
- Backfill: befintliga dagsrapporter räknas om en gång så historiska veckor finns; veckor vars sista öppetdag redan passerat låses vid backfill.
