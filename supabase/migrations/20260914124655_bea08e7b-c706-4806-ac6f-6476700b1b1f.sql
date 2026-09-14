REVOKE EXECUTE ON FUNCTION public.attest_weekly_reminder() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.attest_weekly_reminder() TO service_role;