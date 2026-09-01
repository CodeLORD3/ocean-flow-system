REVOKE ALL ON FUNCTION public.fortnox_match_employees(text) FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.fortnox_link_employee(text, text, uuid) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.fortnox_match_employees(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fortnox_link_employee(text, text, uuid) TO service_role;