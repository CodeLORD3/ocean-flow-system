CREATE OR REPLACE FUNCTION public.clock_pending_approve(_id uuid, _employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  p public.clock_pending_registrations;
BEGIN
  SELECT * INTO p FROM public.clock_pending_registrations WHERE id = _id;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Registreringen finns inte';
  END IF;

  IF NOT (
    public.is_platform_admin(auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (p.store_id IS NOT NULL AND public.can_see_store(p.store_id))
  ) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'Registreringen är redan hanterad (%)', p.status;
  END IF;

  -- Klockidentiteten flyttas till personen så att stämpling fungerar direkt.
  IF p.pnr_hash IS NOT NULL THEN
    UPDATE public.employees
       SET pnr_hash = p.pnr_hash,
           pnr_masked = coalesce(p.pnr_masked, pnr_masked),
           updated_at = now()
     WHERE id = _employee_id;
  ELSIF p.identifier_masked IS NOT NULL THEN
    -- kortnummer i klartext lagras aldrig i väntelistan; sätts manuellt på personen
    NULL;
  END IF;

  UPDATE public.clock_pending_registrations
     SET status = 'approved',
         employee_id = _employee_id,
         handled_by = auth.uid(),
         handled_at = now(),
         updated_at = now()
   WHERE id = _id;

  RETURN jsonb_build_object('id', _id, 'employee_id', _employee_id, 'pnr_linked', p.pnr_hash IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.clock_pending_approve(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.clock_pending_approve(uuid, uuid) TO authenticated;