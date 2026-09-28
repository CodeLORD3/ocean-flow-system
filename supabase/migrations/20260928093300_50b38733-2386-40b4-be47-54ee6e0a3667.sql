REVOKE EXECUTE ON FUNCTION public.store_expected_open_days(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fx_to_sek(text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.weekly_report_fill_currency() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_weekly_reports(boolean) FROM PUBLIC, anon, authenticated;