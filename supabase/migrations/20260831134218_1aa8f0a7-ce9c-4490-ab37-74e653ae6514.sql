REVOKE EXECUTE ON FUNCTION public.log_daily_report_edit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_mark_week_corrected() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_weekly_corrected_flag(uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_edit_daily_report_admin() FROM anon;