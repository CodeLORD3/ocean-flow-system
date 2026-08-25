REVOKE ALL ON FUNCTION public.pk_mirror_logged_time() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pk_mirror_logged_time() TO service_role;

REVOKE ALL ON FUNCTION public.service_set_employee_pnr(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_set_employee_pnr(uuid, text) TO service_role;