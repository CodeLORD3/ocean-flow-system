# Hälsokontroll av hela systemet + lista över byggt men inte aktiverat

Målet är en genomgång utan kodändringar. Resultatet blir en rapport i chatten och som fil (`docs/halsokontroll-2026-09-24.md`) med två delar: vad som inte fungerar eller inte är igång, och vad som finns byggt men inte är aktiverat.

## Del 1: Fungerar allt?

1. **Backend**: driftstatus, databashälsa, långsamma frågor, säkerhetslintern (inkl. de 122 kända varningarna, sammanfattade per typ).
2. **Nattkörningar och schemalagda jobb**: lista alla schemalagda jobb, senaste körning, om de lyckades eller felade (t.ex. vilotidskontroll, nattutstämpling, nedsättningar, SumUp-kö, påminnelser om dagens avslut).
3. **Funktioner på servern** (ca 50 st): senaste loggarna per funktion, felfrekvens, vilka som aldrig anropats.
4. **Integrationer**: Fortnox, Shopify, Nimpos, SumUp, Personalkollen, SMS. För varje: finns kopplingen, när kom senaste data in, köer som fastnat, fel i senaste körningen.
5. **Datakvalitet**: lagersaldon mot rörelseloggen, partier utan spårbarhet, pass på lediga dagar, uppgifter utan regel, bilder utan koppling.
6. **Appen**: öppna varje sida i menyn (Admin, butik, grossist, produktion) inloggad och notera sidor som kraschar, laddar evigt eller ger fel i konsolen. Kör alla automatiska tester och kodkontrollen.

## Del 2: Byggt men inte aktiverat

Samlas från kod, databas och tidigare planer:
- Avstängda schemalagda jobb och regler (t.ex. nedsättningsregler som satts till inaktiva).
- Sidor som finns men inte ligger i menyn eller saknar behörighet för någon.
- Tabeller utan gränssnitt (checklistor, stängda dagar, POS-journal m.m.).
- Funktioner på servern som inget anropar.
- Integrationer som är byggda men utan koppling eller data (t.ex. agentintegrationen som väntar på publicering, Schweiz prislista som är tom).
- Öppna punkter i roadmap och arkiverade planer som aldrig slutfördes.

## Rapportens form

För varje punkt: vad det är, status (Fungerar / Varning / Fel / Inte aktiverat), bevis (siffra eller tidpunkt), och förslag på nästa steg. Inget åtgärdas i detta steg; du väljer sedan vad som ska tas först.

## Tekniskt

- Läsande verktyg: cloud_status, db_health, slow_queries, linter, read_query mot cron.job / cron.job_run_details, edge_function_logs, analytics_query.
- Playwright inloggad som admin mot varje route i pageAccess, samlar konsolfel och skärmdumpar under /tmp/browser/halsokontroll/.
- Vitest och tsgo körs för kodstatus.
- Inga migrationer, inga skrivningar i databasen.
