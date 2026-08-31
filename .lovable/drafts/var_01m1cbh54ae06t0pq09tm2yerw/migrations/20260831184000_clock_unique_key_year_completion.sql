-- Etapp 2b komplettering: uttrycklig UNIQUE-constraint och faktisk nyckelkoppling per beskattningsår.
-- Additiv och bakåtkompatibel.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.time_entries'::regclass
      AND conname = 'time_entries_employee_client_punch_key'
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT time_entries_employee_client_punch_key
      UNIQUE (employee_id, client_punch_id);
  END IF;
END $$;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS pnr_encryption_year integer;

UPDATE public.employees
SET pnr_encryption_year = public.beskattningsar(now())
WHERE pnr_encrypted IS NOT NULL AND pnr_encryption_year IS NULL;

CREATE INDEX IF NOT EXISTS employees_pnr_encryption_year_idx
  ON public.employees (pnr_encryption_year)
  WHERE pnr_encrypted IS NOT NULL;

COMMENT ON COLUMN public.employees.pnr_encryption_year IS
  'Beskattningsår för nyckeln som användes för pnr_encrypted. Själva nyckeln ligger aldrig i databasen.';

CREATE OR REPLACE FUNCTION public.set_employee_pnr(_employee_id uuid, _pnr text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  norm text := public.normalize_pnr(_pnr);
  key text;
  key_year integer := public.beskattningsar(now());
BEGIN
  IF NOT public.is_staff_manager() THEN
    RAISE EXCEPTION 'Behörighet saknas för att sätta personnummer';
  END IF;
  IF norm IS NULL THEN
    RAISE EXCEPTION 'Personnummer måste vara 10 eller 12 siffror';
  END IF;
  key := public.employee_pnr_key_for_year(key_year);

  UPDATE public.employees SET
    pnr_encrypted = extensions.pgp_sym_encrypt(norm, key),
    pnr_hash = public.pnr_hash(norm),
    pnr_last4 = right(norm, 4),
    pnr_masked = substr(norm, 1, 6) || '-****',
    pnr_encryption_year = key_year,
    updated_at = now()
  WHERE id = _employee_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Personen finns inte'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_employee_pnr(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_employee_pnr(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_employee_pnr(_employee_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  key text;
  val text;
  key_year integer;
BEGIN
  IF NOT public.is_staff_manager() THEN
    RAISE EXCEPTION 'Behörighet saknas för att läsa personnummer';
  END IF;
  SELECT e.pnr_encryption_year, e.pnr_encrypted INTO key_year, val
  FROM public.employees e
  WHERE e.id = _employee_id AND e.pnr_encrypted IS NOT NULL;
  IF val IS NULL THEN RETURN NULL; END IF;
  key := public.employee_pnr_key_for_year(COALESCE(key_year, public.beskattningsar(now())));
  RETURN extensions.pgp_sym_decrypt(val::bytea, key);
END;
$$;
REVOKE ALL ON FUNCTION public.get_employee_pnr(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_employee_pnr(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.clock_inspector_reveal_pnr(
  _employee_id uuid, _inspector_session_id uuid,
  _reason text DEFAULT 'Personalliggare vid kontroll'
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_key text;
  v_value text;
  v_session_id uuid;
  v_key_year integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas för inspektörsläge';
  END IF;
  SELECT s.id INTO v_session_id FROM public.inspector_sessions s
  WHERE s.id = _inspector_session_id AND s.expires_at > now() AND s.revoked_at IS NULL;
  IF v_session_id IS NULL THEN RAISE EXCEPTION 'Inspektörssessionen är inte aktiv'; END IF;

  SELECT e.pnr_encryption_year, extensions.pgp_sym_decrypt(e.pnr_encrypted, public.employee_pnr_key_for_year(COALESCE(e.pnr_encryption_year, public.beskattningsar(now()))))
    INTO v_key_year, v_value
  FROM public.employees e
  WHERE e.id = _employee_id AND e.pnr_encrypted IS NOT NULL;
  IF v_value IS NULL THEN RAISE EXCEPTION 'Personnummer saknas för personen'; END IF;

  INSERT INTO public.pnr_access_log (employee_id, accessed_by, inspector_session_id, reason)
  VALUES (_employee_id, auth.uid(), v_session_id, left(COALESCE(_reason, 'Personalliggare vid kontroll'), 300));
  RETURN v_value;
END;
$$;
REVOKE ALL ON FUNCTION public.clock_inspector_reveal_pnr(uuid, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.clock_inspector_reveal_pnr(uuid, uuid, text) TO authenticated, service_role;
