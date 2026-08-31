-- Etapp 2b: inspektörsläget måste logga varje faktisk dekryptering av personnummer.
-- Funktionen är enda vägen till klartext och skriver alltid till pnr_access_log.

CREATE OR REPLACE FUNCTION public.clock_inspector_reveal_pnr(
  _employee_id uuid,
  _inspector_session_id uuid,
  _reason text DEFAULT 'Personalliggare vid kontroll'
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_key text;
  v_value text;
  v_session_id uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas för inspektörsläge';
  END IF;

  SELECT s.id INTO v_session_id
  FROM public.inspector_sessions s
  WHERE s.id = _inspector_session_id
    AND s.expires_at > now()
    AND s.revoked_at IS NULL;
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Inspektörssessionen är inte aktiv';
  END IF;

  v_key := public.employee_pnr_key();
  SELECT extensions.pgp_sym_decrypt(e.pnr_encrypted, v_key)
    INTO v_value
  FROM public.employees e
  WHERE e.id = _employee_id AND e.pnr_encrypted IS NOT NULL;
  IF v_value IS NULL THEN
    RAISE EXCEPTION 'Personnummer saknas för personen';
  END IF;

  INSERT INTO public.pnr_access_log (employee_id, accessed_by, inspector_session_id, reason)
  VALUES (_employee_id, auth.uid(), v_session_id,
          left(COALESCE(_reason, 'Personalliggare vid kontroll'), 300));

  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_inspector_reveal_pnr(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clock_inspector_reveal_pnr(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON COLUMN public.clock_rate_limits.blocked_until IS
  'Spärr i exakt 60 sekunder efter fem misslyckade uppslag i samma minut.';