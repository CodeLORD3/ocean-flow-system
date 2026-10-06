# Tre utredningar (endast läsning, inget ändrat)

## Utredning 1: Prislistan "Sverige butikspris"

1. **Styr den någon kassa i dag? Nej.**
   - Makrills kassa: listan läses bara av `pos_effective_price` (Priskoll på sidan POS-priser) och visas i `/poslive` (`PosPricePanel`). Det finns inget kassagränssnitt som säljer (P3 är inte byggt). `pos_journal` har 0 försäljningar. Senaste `pos_transactions` är från 2026-08-16 (Zollikon/SumUp).
   - Nimpos: `nimpos-push` läser gamla `price_lists`/`price_list_items`, inte den här listan. Båda är tomma (0 rader).
   - SumUp-katalogexport (`useSumupCatalog.ts`): läser också `price_lists`/`price_list_items`, som är tomma.
   - **Risk 1:** prisflödet (`price-publish`) använder den här listan som "nuvarande pris" när det jämför och publicerar till Shopify och kassan. Prisflödet är AV, men om det slås på jämförs nya priser mot 1,00 kr.
   - **Risk 2:** alla 8 butiker har `pos_enabled=true` och var sitt aktivt `pos_registers`. Jobbet `pos-markdowns-hourly` körs varje timme, men inga nedsättningsregler är aktiva.
2. **Senast korrekta priser:** det finns ingen fullständig lista över butikspriser.
   - `price_lists`/`price_list_items`: 0 rader.
   - `detail_prices`: bara 5 rader (torsk, butik_goteborg, 2026-08-03).
   - `detail_price_applications`: 0 rader. `price_history`: 0 rader.
   - Det som finns: `wholesale_prices_current` (767 produkter × 2 nivåer, med `retail_suggested`), `products.day_price` och Shopify-priserna via `shopify_product_map` (248 kopplingar). Shopify är troligen den bästa källan för riktiga butikspriser.
3. **Orsak:** startpubliceringen 2026-09-23 11:59 i ETAPP P2, punkt 8. Den kopierades i en körning 36 sekunder efter att listan skapades, och `published_by` är tomt. Ingen funktion eller import i appen skrev värdena. Fördelning:
   - 685 rader är lika med `wholesale_prices_current.retail_suggested`. 635 av dessa är ≤1 kr, eftersom grossistpriset var platshållaren 1,00 kr och förslaget räknades fram ur det.
   - 66 rader har ett annat värde (19 av dem ≤1 kr).
   - 591 rader saknar grossistpris (3 av dem ≤1 kr).
   - 126 rader är lika med `products.cost_price`.
4. **Förslag om listan ska stoppas (inte utfört):**
   - a) Sätt `pos_price_lists.is_active=false` för listan, så kan prisflödet inte använda den som jämförelse.
   - b) Behåll prisflödet AV.
   - c) Ta fram nya priser från Shopify (SEK-butiken) per kopplad produkt. Publicera dem via `pos_publish_prices`, som lägger nya rader med ny `valid_from`. Inget raderas, och det blir en ny publicering ovanpå den gamla.
   - d) Publicera inte rader med pris ≤1 kr eller pris lika med inköpspris. Lista dem för manuell prissättning.

## Utredning 2: SumUp i stället för Nimpos

1. **Det som beror på Nimpos:**
   - Edge-funktioner: `nimpos-sales`, `nimpos-reconcile`, `nimpos-replay`, `nimpos-push` och `_shared/nimpos.ts`. Dessutom skriver `_shared/sumup-process.ts` avvisade köp till `nimpos_rejects`.
   - Jobb: `nimpos-nattavstamning` kl. 01:15.
   - Tabeller: `nimpos_store_map` (5 rader), `nimpos_product_map`, `nimpos_webhook_events` (0 rader), `nimpos_reconciliations`, `nimpos_rejects`.
   - Databasfunktioner och triggers: `nimpos_health`, `pos_live_summary`, `run_system_checks`, `daily_report_fill_pos`, trigger `fill_pos_after_nimpos`, `ny_butik_steg`.
   - Dagsrapport: `daily_report_fill_pos` tar Nimpos först, sedan SumUp.
   - Sidor och komponenter: `PosLive`, `PosFoundation`, `DailyReport`, `Dashboard`, `NyButik`, `LiveDailyReport`, `NimposMappingPanel`, `PosHealthCard`, `PosLineReview`, `useNimposHealth`, `usePosLive`, `usePosPrices`, `useStaffKpi`.
2. **SumUp-hämtningen:**
   - Adressfelet är rättat i `_shared/sumup.ts` (raderna 250–258 sätter tillbaka sökvägen). Felkörningen 2026-08-16 19:09 kom före rättningen, och efterföljande körningar gick ok.
   - Det som saknas: `sumup_merchants.currency` har standardvärdet `'CHF'` och måste sättas till `'SEK'` för svenska rader.
   - Den största bristen: `sumup-poll` använder en enda hemlighet, `SUMUP_API_KEY`, för alla konton.
   - Jobb som behövs: `sumup-poll` var 5:e minut (öppettid), `sumup-reconcile` nattligen till exempel 01:15 Stockholm (ersätter `nimpos-nattavstamning`) och `sumup-process` om kön inte töms av poll.
3. **För att köpen ska flöda av sig själva per svensk butik:**
   - En rad i `sumup_merchants` med `store_id`, rätt `legal_entity_id`, `currency='SEK'` och `active=true`.
   - Fungerande API-nyckel för kontot.
   - Produktmappning i `sumup_product_map` (namnmatchning lär sig, omatchade hamnar i granskning).
   - Med det på plats skriver `sumup-process` försäljningen till lager via `stock_movements` (FEFO), och dagsrapporten fylls via `daily_report_fill_pos`.
   - SEK och CHF kan inte blandas: valutan kontrolleras per köp (rad 406–408 avvisar avvikelse) och följer kontots rad.
4. **Uppgifter per butik:**
   - Merchant code (till exempel MXXXXXXX), butik, bolag (FSAB eller DE No.1), valuta SEK, och om kontot är testkonto.
   - En SumUp API-nyckel gäller ett konto. Om varje butik är ett eget konto behövs en nyckel per konto. Koden stödjer i dag bara en (`SUMUP_API_KEY`, som hör till Zollikon) och måste byggas om för fler.
   - Förslag på namn: `SUMUP_API_KEY_<MERCHANTCODE>`, till exempel `SUMUP_API_KEY_MABC1234`. Zollikons `SUMUP_API_KEY` får stå kvar.
   - Om alla svenska butiker ligger under ett konto med flera merchant codes kan en nyckel räcka. Det behöver bekräftas hos SumUp.
5. **Ordning för avstängning:**
   1. Lägg in svenska konton och nycklar.
   2. Kör SumUp parallellt med det nuvarande i minst en vecka och stäm av mot dagsrapporter och Z-rapporter.
   3. Pausa `nimpos-nattavstamning`. Webhooken tar ändå inte emot något (0 händelser).
   4. Sätt `pos_registers.is_active=false` för svenska kassor och `stores.pos_enabled=false` för svenska butiker. Låt `pos_journal` och dess hashkedja vara orörd.
   5. Ta bort Nimpos-steget ur `daily_report_fill_pos` och Ny butik.
   6. Behåll Nimpos-tabellerna som historik.

## Utredning 3: Personalkollen bort

1. **Det som beror på Personalkollen:**
   - Jobb: `personalkollen-logged-times` (var 2:a min), `personalkollen-work-periods` (var 10:e min), `personalkollen-staff-hourly` (:07), `personalkollen-workplaces-hourly` (:12), `personalkollen-costgroups-daily` (03:17).
   - Edge-funktioner: `personalkollen-sync`, `-backfill-pnr`, `-reveal-pnr`.
   - Tabeller: `pk_connections`, `pk_costgroups`, `pk_logged_times`, `pk_staff`, `pk_staff_employments`, `pk_sync_log`, `pk_sync_state`, `pk_time_imports`, `pk_work_periods`, `pk_workplaces`. Vyn `pk_logged_times_effective` och `v_pk_clocked_in_now`.
   - `staff_shifts`: 2 414 rader med källa personalkollen (227 clock, 149 manual).
   - Databasfunktioner: `pk_import_run`/`pk_time_imports_after_stmt` (importen till egen klocka), `pk_import_decide`, `pk_link_staff`, `pk_mirror_logged_time`, `pk_own_journal`, `pk_neutralize_lone_inside`, `pk_staff_link_resync`, `pk_costgroup_store_resync`, `pk_mapped_stores`, `pk_daily_labor_cost`, `pk_overhead_daily_cost`, `pk_reconcile_check`, `system_checks_pk_hook`, `run_system_checks`.
   - Rapporter som läser Personalkollen: `recompute_weekly_store_report`, `resultat_per_butik`, `likviditet_veckor`, `flag_wrong_system_punches`, `payroll_period_source`, `ny_butik_steg`.
   - Lön: `payroll-compute` tar perioder t.o.m. 2026-09-15 från Personalkollen och därefter från Makrill.
   - Sidor: `Integrations/Personalkollen`, `ClockVsPk`, `LiveStaff`, `PayrollBasisPeriod`, `PkImportCard`, `PkReviewPanel`, `ParallelRunCards`, `Dashboard`, `NyButik` och personalkostnad i KPI (`usePkLaborCost`, `useStaffKpi`).
2. **Täckning i Makrill:**
   - Finns: egen klocka (stationer och mobil, geofence, koder), schema med import, frånvaro, attest, avstämning, låsning, rättelser, OB och övertid via `berakna_arbetstid`, löneperiod via `payroll-compute` och export via `fortnox-payroll-export`.
   - Saknas:
     - Personalkostnad per butik ur egen klocka, så att `pk_daily_labor_cost` kan ersättas i vecko-, resultat- och likviditetsrapporter.
     - Live-vy "instämplade nu" utan `v_pk_clocked_in_now`.
     - Kostnadsställe per butik som inte bygger på `pk_costgroups`.
     - Personnummer för de som bara finns i PK (backfill-pnr).
     - Öppna Ålstenfel som inte kunde dekrypteras.
   - AGI, LF-fil, SIE, övertidsjournal och personalliggare byggs inte, enligt stående krav.
3. **Löneunderlag:**
   1. Stämplingar och pass attesteras.
   2. Perioden låses.
   3. `payroll-compute` räknar timmar, OB, övertid och frånvaro per lönekod.
   4. `fortnox-payroll-export` skickar lönetransaktioner till Fortnox Lön per bolag (FSAB och DE No.1) via `fortnox_wage_code_map` och `fortnox_employees`.
   5. Byrån tar det vidare i Fortnox.
4. **Ordning för avstängning efter en parallell löneperiod (16/9–15/10):**
   1. Godkänn avstämningen per anställd (Makrill mot PK) och lås perioden.
   2. Stäng `personalkollen-logged-times` och `-work-periods`. PK-importen till egen klocka stoppas då också.
   3. Stäng `personalkollen-staff-hourly` och `-workplaces-hourly`.
   4. Stäng `personalkollen-costgroups-daily` först när personalkostnad per butik räknas ur egen klocka.
   5. Ta bort `pk_klocka_avstamning` ur systemkontrollen.
   6. Behåll alla `pk_*`-tabeller som skrivskyddad historik.
