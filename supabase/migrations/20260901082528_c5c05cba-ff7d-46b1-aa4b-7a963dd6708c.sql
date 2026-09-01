REVOKE ALL ON FUNCTION public.time_entries_validate_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_close_open_time_entries() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_time_compliance_checks(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_open_time_entries() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_time_compliance_checks(date, date) TO service_role;