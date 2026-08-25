CREATE OR REPLACE FUNCTION public.get_employee_pnr(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  key text;
  val text;
  who text;
BEGIN
  IF NOT public.is_staff_manager() THEN
    RAISE EXCEPTION 'Behörighet saknas för att läsa personnummer';
  END IF;
  key := public.employee_pnr_key();
  SELECT extensions.pgp_sym_decrypt(e.pnr_encrypted, key)
    INTO val
    FROM public.employees e
   WHERE e.id = _employee_id AND e.pnr_encrypted IS NOT NULL;

  IF val IS NOT NULL THEN
    SELECT coalesce(s.first_name || ' ' || s.last_name, auth.uid()::text)
      INTO who FROM public.staff s WHERE s.user_id = auth.uid() LIMIT 1;

    INSERT INTO public.activity_logs (action_type, description, entity_type, entity_id, performed_by, details)
    VALUES ('read', 'Personnummer uthämtat i klartext', 'employee', _employee_id::text,
            coalesce(who, auth.uid()::text), jsonb_build_object('user_id', auth.uid()));
  END IF;
  RETURN val;
END;
$$;

REVOKE ALL ON FUNCTION public.get_employee_pnr(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employee_pnr(uuid) TO service_role;
