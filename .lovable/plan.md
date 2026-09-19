# Webbshopen räknas in i butikens omsättning

Webbordrarna från fiskskaldjur.se och fiskskaldjur.ch är förbetalda och syns aldrig i kassans Z-rapport. De ska därför läggas **in** i butikens total, med en egen underrad som visar hur mycket av totalen som kommer från webben.

Gäller historiskt för alla butiker som har webbordrar: Ålstens Fisk, Fiskskaldjur Kungsholmen och Fiskskaldjur Zollikon (Morges har en enstaka order som också kommer med).

## Så här visas det

- Butikens omsättning = kassans nettoomsättning + webbens netto, på varje dag där butiken lämnat dagsrapport.
- Under totalen står en rad: "varav webbshop 107 375 kr" (CHF för Zollikon och Morges).
- Webbsumman räknas om till netto: 6 % moms bort i Sverige, 2,6 % i Schweiz, så den är jämförbar med kassan.
- Webbordrar bokas på leveransdagen och på den butik kunden hämtar i.
- Webbordrar som ligger på dagar utan dagsrapport räknas också in i periodens total, men visas som egen rad "webbshop utan dagsrapport" så att inget belopp försvinner.

## Var det syns

1. Nyckeltalsbandet högst upp (Nettoomsättning, per kvitto, per timme) och listan "Butiker i perioden".
2. Veckorapporterna: butikens veckorad och dag-för-dag-tabellen inne i butiken.
3. Månadsrapporterna: butikens månadsrad.
4. Region- och Sverige-totalerna, som summan av butikernas webbdelar.
5. Utskrift och Excel följer samma siffror som skärmen.

## Nuläget i siffror (kontrollerat i databasen)

| Butik | Webbordrar | Belopp med moms | Varav på dagar med dagsrapport |
| --- | --- | --- | --- |
| Kungsholmen | 75 | 126 227 kr | 109 798 kr |
| Ålstens Fisk | 40 | 82 992 kr | 81 400 kr |
| Zollikon | 93 | 34 257 CHF | 26 877 CHF |
| Morges | 1 | 79 CHF | 0 CHF |

## Teknisk lösning

- Dagsrapporterna (`daily_reports`) rörs inte. Z-rapporten är fortsatt kassans sanning, och låsning/driftkontroll av veckorapporter påverkas inte.
- `src/hooks/useWebSales.ts` byggs ut: nettobelopp per butik och dag med momssats från butikens land (SE 6 %, CH 2,6 %), plus antal ordrar och flagga för om dagen har dagsrapport.
- Inräkningen sker i presentationslagret, som ett tillägg ovanpå `weekly_store_reports`, `weekly_region_reports`, månadsmotsvarigheterna och `daily_reports`:
  - `ReportsStatsBand.tsx`: webbnetto in i nettoomsättning, per kvitto, per timme och i butikslistans total; underrad "varav webbshop".
  - `StoreWeekDays.tsx`: webbkolumnen blir "varav webbshop" och dagens total inkluderar webben.
  - `WeeklyStoreReports.tsx` och `MonthlyReports.tsx`: butiksrad och regionrad får webbtillägg i `total_sales_sek` och snitt/dag, med underrad.
  - `weeklyReportExport.ts`: samma totaler och underrad i PDF och Excel.
- Valutaomräkning för Sverige-totalen fortsätter gå via `fx_daily_rates` och dagens kurs.
