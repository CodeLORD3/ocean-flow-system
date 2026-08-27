CREATE OR REPLACE FUNCTION public.lookup_employee_by_pnr(_pnr text)
 RETURNS TABLE(employee_id uuid, first_name text, pnr_masked text, is_active boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT (public.has_role(auth.uid(), 'admin')
              OR public.is_platform_admin(auth.uid())
              OR public.is_staff_manager()) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  RETURN QUERY
  SELECT e.id, e.first_name, e.pnr_masked, e.is_active
    FROM public.employees e
   WHERE e.pnr_hash = public.pnr_hash(_pnr)
   LIMIT 1;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.lookup_employee_by_pnr(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_employee_by_pnr(text) TO authenticated, service_role;