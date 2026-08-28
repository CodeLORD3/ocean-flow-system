REVOKE ALL ON FUNCTION public.log_absence_request_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_comp_txn() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.absence_requests_touch() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hr_touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_absence_request_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_comp_txn() TO service_role;
