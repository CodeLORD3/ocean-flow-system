-- 1. Nya fält
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS pnr_encrypted bytea;
ALTER TABLE public.employments ADD COLUMN IF NOT EXISTS country_code text NOT NULL DEFAULT 'SE';

COMMENT ON COLUMN public.employees.pnr_encrypted IS 'Personnummer krypterat med pgp_sym_encrypt och nyckel ur supabase_vault. Läses endast via public.get_employee_pnr().';
COMMENT ON COLUMN public.employees.pnr_hash IS 'SHA-256 av normaliserat pnr, uppslagsnyckel för stämpelklockan.';
COMMENT ON COLUMN public.employments.country_code IS 'Landskod för anställningen: SE (Fas 1) eller CH (Fas 2, vilande).';

-- 2. Krypteringsnyckel ur valvet
CREATE OR REPLACE FUNCTION public.employee_pnr_key()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'employee_pnr_key' LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.employee_pnr_key() FROM PUBLIC, anon, authenticated;

-- 3. Normalisering och hash
CREATE OR REPLACE FUNCTION public.normalize_pnr(_pnr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _pnr IS NULL THEN NULL
    WHEN length(regexp_replace(_pnr, '\D', '', 'g')) = 12
      THEN substr(regexp_replace(_pnr, '\D', '', 'g'), 3, 10)
    WHEN length(regexp_replace(_pnr, '\D', '', 'g')) = 10
      THEN regexp_replace(_pnr, '\D', '', 'g')
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.pnr_hash(_pnr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT CASE
    WHEN public.normalize_pnr(_pnr) IS NULL THEN NULL
    ELSE encode(extensions.digest('SE:' || public.normalize_pnr(_pnr), 'sha256'), 'hex')
  END
$$;

-- 4. Skriv personnummer (kryptera + hash + maskering i ett)
CREATE OR REPLACE FUNCTION public.set_employee_pnr(_employee_id uuid, _pnr text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  norm text := public.normalize_pnr(_pnr);
  key text;
BEGIN
  IF NOT public.is_staff_manager() THEN
    RAISE EXCEPTION 'Behörighet saknas för att sätta personnummer';
  END IF;
  IF norm IS NULL THEN
    RAISE EXCEPTION 'Personnummer måste vara 10 eller 12 siffror';
  END IF;
  key := public.employee_pnr_key();
  IF key IS NULL THEN
    RAISE EXCEPTION 'Krypteringsnyckel saknas i valvet (employee_pnr_key)';
  END IF;

  UPDATE public.employees SET
    pnr_encrypted = extensions.pgp_sym_encrypt(norm, key),
    pnr_hash      = public.pnr_hash(norm),
    pnr_last4     = right(norm, 4),
    pnr_masked    = substr(norm, 1, 6) || '-****',
    updated_at    = now()
  WHERE id = _employee_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Personen finns inte';
  END IF;
END;
$$;

-- 5. Läs personnummer i klartext (lönebehörighet + logg)
CREATE OR REPLACE FUNCTION public.get_employee_pnr(_employee_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  key text;
  val text;
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
    INSERT INTO public.activity_logs (action_type, description, entity_type, entity_id, user_id)
    VALUES ('read', 'Personnummer uthämtat i klartext', 'employee', _employee_id::text, auth.uid());
  END IF;
  RETURN val;
END;
$$;

-- 6. Stämpelklockans uppslag: aldrig klartext ut
CREATE OR REPLACE FUNCTION public.lookup_employee_by_pnr(_pnr text)
RETURNS TABLE(employee_id uuid, first_name text, pnr_masked text, is_active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.first_name, e.pnr_masked, e.is_active
    FROM public.employees e
   WHERE e.pnr_hash = public.pnr_hash(_pnr)
   LIMIT 1
$$;

-- 7. Behörighetshjälpare
CREATE OR REPLACE FUNCTION public.employee_is_self(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
      JOIN public.staff s ON s.id = e.staff_id
     WHERE e.id = _employee_id AND s.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_see_employee(_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- egen data
    public.employee_is_self(_employee_id)
    -- grossist/admin: bolag man har åtkomst till (eller person utan anställning ännu)
    OR (public.is_staff_manager() AND (
          NOT EXISTS (SELECT 1 FROM public.employments em WHERE em.employee_id = _employee_id)
          OR EXISTS (
            SELECT 1 FROM public.employments em
             WHERE em.employee_id = _employee_id
               AND (em.legal_entity_id IS NULL OR public.can_see_company(em.legal_entity_id))
          )))
    -- butikschef: endast egen enhet
    OR (public.has_role(auth.uid(), 'store_manager') AND EXISTS (
          SELECT 1 FROM public.employments em
           WHERE em.employee_id = _employee_id
             AND em.store_id IS NOT NULL
             AND public.has_scope(auth.uid(), 'store', em.store_id::text)
        ))
$$;

-- 8. Skärpt RLS
DROP POLICY IF EXISTS "Employees readable by staff" ON public.employees;
CREATE POLICY "Employees readable by self, unit and company"
  ON public.employees FOR SELECT TO authenticated
  USING (public.can_see_employee(id));

DROP POLICY IF EXISTS "Managers read employments" ON public.employments;
CREATE POLICY "Employments readable by self, unit and company"
  ON public.employments FOR SELECT TO authenticated
  USING (public.can_see_employee(employee_id));

DROP POLICY IF EXISTS "Docs readable by staff" ON public.employee_documents;
CREATE POLICY "Docs readable by self, unit and company"
  ON public.employee_documents FOR SELECT TO authenticated
  USING (public.can_see_employee(employee_id));
