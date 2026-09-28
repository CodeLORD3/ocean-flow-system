# Säkerhetsgranskning 2026-09-28

Linter före: 131 varningar. Efter: 100.

| Grupp | Före | Efter | Kommentar |
|---|---|---|---|
| Vyer som kringgår RLS och kunde läsas av ej inloggade | 8 (dolda i lintern) | 0 | anon-läsning borttagen; alla 8 vyer kör nu som anroparen (security_invoker) |
| Policies med `true` för alla inloggade (inkl. investerare) | 35 policies på 22 tabeller | 0 | ersatta med `is_staff()` |
| Funktion utan fast search_path | 1 | 0 | `set_uppdaterad` |
| SECURITY DEFINER körbar av inloggade | 123 | 93 | 30 interna stängda (se nedan) |
| RLS på men utan policy | 7 | 7 | avsiktligt: bara service role (OAuth-states/tokens, booking_otp, rate limits, store_configs, price_overrides) |
| Publika inställningstabeller (landing, portal, om oss, kontakt, valuta, karta) | 6 | 6 | avsiktligt: behövs för publika sidor, inget känsligt |

## Stängda funktioner (EXECUTE borttaget för anon/authenticated)
Triggers: block_locked_stock_count, block_self_attestation, enforce_stock_report_line_allowed, log_shift_change, time_entries_sync_staff_shift.
Cron: check_station_heartbeats.
Interna hjälpare som bara anropas av andra SECURITY DEFINER-funktioner: stock_write_allowed, absence_generate_days, absence_policy_for, comp_adjust, company_of_location, company_of_store, compute_vacation_balance, cost_read_allowed, entity_series_code, get_employee_pnr, has_company_scoping, has_scope, is_store_scoped, pos_vat_rate_for, preliminar_manadskostnad, preliminar_passkostnad, pricing_calc, pricing_pick_rule, refresh_weekly_corrected_flag, sick_karens_count_12m, staff_shifts_rebuild_from_clock, staff_shifts_rebuild_range, vacation_adjust, wholesale_price_for.

## Kvar avsiktligt (93)
- Används i RLS-policies eller vyer och måste vara körbara av inloggade: has_role, is_staff, is_staff_manager, is_platform_admin, can_see_*, employee_is_self, pk_can_read*, staff_has_store, user_*-funktioner m.fl.
- Anropas från appen och kontrollerar själva behörighet: run_system_checks_now, likviditet_veckor, resultat_per_butik, resultat_bokfort, ny_butik_steg, pos_*, clock_station_*, decide_*, traceability_*, m.fl.
- Anropas av triggers som körs som anroparen: lot_parasite_block_reason, period_is_locked. Standardvärde på lots: next_internal_lot_number.
- Anon kan inte köra någon SECURITY DEFINER-funktion (kontrollerat: 0).
