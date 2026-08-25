-- Ingen anon-åtkomst till något personnummerrelaterat
REVOKE ALL ON FUNCTION public.employee_pnr_key() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_pnr(text) FROM anon;
REVOKE ALL ON FUNCTION public.pnr_hash(text) FROM anon;
REVOKE ALL ON FUNCTION public.set_employee_pnr(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_employee_pnr(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.lookup_employee_by_pnr(text) FROM anon;
REVOKE ALL ON FUNCTION public.employee_is_self(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_see_employee(uuid) FROM anon;

-- Uppslag och klartext körs bara serverside (edge functions), aldrig från klienten
REVOKE ALL ON FUNCTION public.lookup_employee_by_pnr(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_employee_pnr(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_employee_by_pnr(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_employee_pnr(uuid) TO service_role;

-- Hjälpare som bara RLS-uttrycken behöver
REVOKE ALL ON FUNCTION public.employee_is_self(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.can_see_employee(uuid) FROM authenticated;

-- Skrivning av personnummer sker via inloggad lönebehörig användare
GRANT EXECUTE ON FUNCTION public.set_employee_pnr(uuid, text) TO authenticated, service_role;
