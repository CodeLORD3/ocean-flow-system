ALTER VIEW public.weekly_region_reports SET (security_invoker = on);

REVOKE ALL ON FUNCTION public.recompute_weekly_store_report(uuid, date) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.daily_report_touch_weekly() FROM anon, authenticated, public;