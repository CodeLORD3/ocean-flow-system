revoke all on function public.sync_absence_request_period_fields() from public, anon, authenticated;
grant execute on function public.sync_absence_request_period_fields() to service_role;

revoke all on function public.hr_daily_checks() from public, anon, authenticated;
grant execute on function public.hr_daily_checks() to service_role;