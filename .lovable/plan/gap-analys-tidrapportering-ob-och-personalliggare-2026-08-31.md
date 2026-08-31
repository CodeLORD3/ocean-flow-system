# Gap-analys: tidrapportering, OB och personalliggare

Kontrollerat mot databasen och koden. Det som redan finns: stämpelklocka på delad terminal (`clock_stations`, personlig kod, stora träffytor), append-only stämplingar (`time_entries` med `occurred_at` + `registered_at` + `corrects_entry_id`/`correction_kind`, ingen radering), rast som egna poster (`rast_start`/`rast_slut`), offlinekö i krypterad IndexedDB, okänt personnummer till godkännandekö, schema, attest (`attestations`), periodlås, frånvaro/semester, Fortnox-koppling för fakturor.

## Det som INTE är byggt

### 1. Driftställen och kostnadsställen (prompt 1)
- Ingen tabell för driftställen med kostnadsställe (4010 storkök, 4020 produktion, 2010 butik, 3010 inköp, 5010 transport, Fiskauktionen → konteras 3010). `employments.cost_center` finns, men bara som en text per anställning.
- Stämplingar bär inget kostnadsställe. Ett pass kan därför inte delas på flera kostnadsställen på tidsintervall — det är det bärande kravet i prompt 1 och saknas helt.
- Ingen kostnadsställeväljare efter instämpling i terminalen (sex knappar).

### 2. Regelmotor som data (prompt 2) — saknas i sin helhet
Ingen regeltabell finns. Ingen av dessa värden ligger i systemet: dygnsvila 11 h, veckovila 36 h, beräkningsperiod 4 veckor, fast dygnsbryt, övertid 50 h/mån + 48 h/4 v (märkt OVERIFIERAD), mertid deltid upp till heltidsmått, ingen avrundning, karens 15 min, platslås 150 m, offlinebuffert 72 h, körtidsflagga 4 h 30 min. Ingen versionering och ingen källhänvisning (ATL 13 §/14 §).

### 3. OB-beräkning (prompt 2) — saknas i sin helhet
- Inga OB-fönster: mån–fre 18.15–20.00 = 50 %, mån–fre efter 20.00 = 70 %, lör efter 12.00 = 100 %, sön/helgdag = 100 %.
- Ingen minutdelning av pass över flera fönster.
- Ingen helgdagstabell för OB. `major_holidays` finns men är butiksöppettider/beställningsstopp för bokningssidan — inte röda dagar per år.
- Inga lönearter per OB-nivå och ingen spärr som vägrar export vid saknad mappning.
- Ingen övertids-/mertidsberäkning ur stämplingar (heltid vs deltid, `employment_rate` finns men används inte för mertid).

### 4. Mobilstämpling med platslås (prompt 4)
- `time_entries` har inga koordinater, inget avstånd, ingen accuracy. Ingen geofence i `clock-punch`.
- Ingen avståndsvisning i meter i mobilvyn.
- Offlinekön sparar stämplingens egen tid, men 72-timmarsgränsen och separat logg av synktidpunkt är inte implementerad.

### 5. Personalliggare (prompt 5) — saknas i sin helhet
- Ingen liggarplikt-flagga per driftställe (inklusive läget "Utred" för butiken).
- Ingen liggarvy med namn, personnummer, in-/uttid för period bakåt.
- Inget inspektörsläge (läsbehörighet, tidsbegränsad åtkomst).
- Ingen filtrering som utesluter auktionspersonal ur liggaren men behåller dem i löneunderlaget.
- Ingen händelselogg under tabellen med orsak/tidpunkt/användare, och ingen 2-årsbevarande-regel.

### 6. Chefens avvikelsekö (prompt 6)
- Attest finns, men inte som kö med en åtgärd per post. Saknade avvikelsetyper: saknad utstämpling (auto-utstämpling finns men flaggas inte som avvikelse att åtgärda), sen ankomst, stämpling utanför platslås, bruten dygnsvila, OB-nivå utan mappad löneart.
- Ingen konsekvens i kronor eller löneart per post.
- Ingen 06:00-notis som skickas endast när nya avvikelser finns.

### 7. Fortnox löneexport (prompt 7) — saknas i sin helhet
Fortnox-integrationen omfattar bara fakturor. Det finns ingen löneexport, ingen spärr mot att attestera egen tid, ingen rollspärr som hindrar löneroll från att ändra stämpling, och ingen korrigeringspost i nästa period efter export.

## Teknisk sammanfattning av ordningen att bygga i
1. Datamodell: `work_sites` (kostnadsställe, liggarplikt: ja/nej/utred), `time_entry_allocations` (kostnadsställe på tidsintervall), geokolumner + `synced_at` på `time_entries`.
2. Regeltabeller: `work_rules` (versionerade, med lagkälla), `ob_windows`, `payroll_holidays`, `wage_codes` + mappning per OB-nivå.
3. Beräkningslager: minutbaserad OB-/övertids-/mertidsberäkning ur stämplingar vid uppslag — inga lagrade summor.
4. UI i tur och ordning: kostnadsställeväljare i terminalen, mobil med platslås, personalliggare med inspektörsläge, avvikelsekö, löneexport med spärrar.
