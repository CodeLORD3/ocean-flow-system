# Vit skärm när Veckorapporter öppnas (Grossist/Admin)

## Vad jag vet
- Rapportsidan i Grossist/Admin visar utfällbara kort. När kortet "Veckorapporter" fälls ut renderas `WeeklyStoreReportsSection`.
- Hela sidan blir vit, vilket betyder ett kastat fel under rendering. Appen har ingen felgräns runt rapportsektionerna, så ett fel i en sektion släcker hela sidan istället för bara det kortet.
- Jag har kontrollerat datan i vecko-vyerna (butik och region): inga tomma veckodatum, statusfält eller nyckeltal. Datan i sig ser alltså inte trasig ut.
- Jag kunde inte reproducera felet i förhandsvisningen eftersom det inloggade testkontot saknar behörighet till Rapporter i admin-menyn. Grundorsaken är därför ännu inte bekräftad.

## Plan

### 1. Fånga felet så sidan aldrig släcks
Lägg en felgräns runt varje rapportsektion (Inköp, Produktion, Dags-, Vecko-, Månadsrapporter). Kraschar en sektion visas ett tydligt felmeddelande med "Försök igen" i just det kortet — resten av sidan står kvar. Felet loggas så det syns i konsolen.

### 2. Reproducera och läsa av det exakta felet
Öppna rapportsidan med ett konto som har åtkomst till Rapporter, fälla ut Veckorapporter och läsa av felmeddelandet och stackspåret från felgränsen/konsolen.

### 3. Rätta grundorsaken
Åtgärda det fel som steg 2 pekar ut, i `WeeklyStoreReports.tsx` eller dess hjälpfunktioner (veckolistan, dag-för-dag-tabellen, väderkolumnen, export). Samma kontroll görs för Månadsrapporter eftersom den delar dag-för-dag-komponenten.

### 4. Härda de sköra ställena
Oavsett grundorsak görs sektionen tålig mot ofullständig data: säkra sorteringen av veckor mot saknade datum, säkra nummerformatering mot saknade värden och säkra butiksnamn/regionsnamn som inte hittas. Väderdata behandlas som frivillig information och får aldrig fälla rapporten.

### 5. Verifiera
Kontrollera i förhandsvisningen att kortet fälls ut, att veckor, butiksnivå och dag-för-dag-tabellen visas, att filtret per region/butik fungerar och att utskrift/Excel går igenom utan att sidan släcks.

## Tekniska noter
- Ny återanvändbar `SectionErrorBoundary` (klasskomponent med `componentDidCatch`) används i `src/pages/ReportsRouter.tsx` runt varje `CardContent`.
- Berörda filer i övrigt: `src/components/reports/WeeklyStoreReports.tsx`, `src/components/reports/StoreWeekDays.tsx`, `src/lib/weeklyReportDays.ts`, `src/components/reports/MonthlyReports.tsx`.
- Inga databasändringar behövs; vyerna `weekly_store_reports` och `weekly_region_reports` returnerar korrekt data.
