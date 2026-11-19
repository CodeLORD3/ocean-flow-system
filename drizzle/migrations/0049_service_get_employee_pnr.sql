CREATE OR REPLACE FUNCTION public.service_get_employee_pnr(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  key text;
  val bytea;
  key_year integer;
BEGIN
  SELECT e.pnr_encryption_year, e.pnr_encrypted INTO key_year, val
  FROM public.employees e
  WHERE e.id = _employee_id AND e.pnr_encrypted IS NOT NULL;
  IF val IS NULL THEN RETURN NULL; END IF;
  key := public.employee_pnr_key_for_year(COALESCE(key_year, public.beskattningsar(now())));
  RETURN extensions.pgp_sym_decrypt(val, key);
END;
$$;
REVOKE ALL ON FUNCTION public.service_get_employee_pnr(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_employee_pnr(uuid) TO service_role;