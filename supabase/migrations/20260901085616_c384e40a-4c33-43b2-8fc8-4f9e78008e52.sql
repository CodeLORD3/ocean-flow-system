DROP FUNCTION IF EXISTS public.fortnox_match_employees(text);
DROP FUNCTION IF EXISTS public.fortnox_link_employee(text, text, uuid);

CREATE FUNCTION public.fortnox_match_employees(p_entity text, p_actor_id uuid)
RETURNS TABLE(
  employee_number text,
  fortnox_name text,
  pnr_last4 text,
  inactive boolean,
  action text,
  match_method text,
  employee_id uuid,
  makrilltrade_name text,
  employment_id uuid,
  current_number text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_company_access(p_actor_id, p_entity) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  RETURN QUERY
  WITH fe AS (
    SELECT f.* FROM public.fortnox_employees f WHERE f.legal_entity_code = p_entity
  ), hit AS (
    SELECT fe.employee_number, fe.first_name, fe.last_name, fe.pnr_last4, fe.inactive,
      fe.matched_employee_id, fe.confirmed,
      COALESCE(
        (SELECT e.id FROM public.employees e WHERE fe.pnr_hash IS NOT NULL AND e.pnr_hash = fe.pnr_hash LIMIT 1),
        (SELECT e.id FROM public.employees e
          WHERE public.latin_norm(e.first_name) = public.latin_norm(fe.first_name)
            AND public.latin_norm(e.last_name) = public.latin_norm(fe.last_name) LIMIT 1)
      ) AS candidate,
      CASE
        WHEN EXISTS (SELECT 1 FROM public.employees e WHERE fe.pnr_hash IS NOT NULL AND e.pnr_hash = fe.pnr_hash) THEN 'pnr'
        WHEN EXISTS (SELECT 1 FROM public.employees e
          WHERE public.latin_norm(e.first_name) = public.latin_norm(fe.first_name)
            AND public.latin_norm(e.last_name) = public.latin_norm(fe.last_name)) THEN 'name'
        ELSE NULL
      END AS method
    FROM fe
  )
  SELECT h.employee_number,
    btrim(COALESCE(h.first_name, '') || ' ' || COALESCE(h.last_name, '')),
    h.pnr_last4, h.inactive,
    CASE
      WHEN em.id IS NOT NULL AND em.fortnox_employee_id = h.employee_number THEN 'already_linked'
      WHEN COALESCE(h.matched_employee_id, h.candidate) IS NULL THEN 'no_match'
      WHEN em.id IS NULL THEN 'no_employment'
      ELSE 'link'
    END,
    COALESCE(CASE WHEN h.matched_employee_id IS NOT NULL THEN 'manual' END, h.method),
    COALESCE(h.matched_employee_id, h.candidate),
    btrim(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')),
    em.id, em.fortnox_employee_id
  FROM hit h
  LEFT JOIN public.employees e ON e.id = COALESCE(h.matched_employee_id, h.candidate)
  LEFT JOIN LATERAL (
    SELECT x.id, x.fortnox_employee_id FROM public.employments x
    WHERE x.employee_id = COALESCE(h.matched_employee_id, h.candidate)
      AND x.legal_entity_id = p_entity
    ORDER BY x.is_active DESC, x.start_date DESC NULLS LAST LIMIT 1
  ) em ON true
  ORDER BY 1;
END;
$$;

CREATE FUNCTION public.fortnox_link_employee(
  p_entity text,
  p_employee_number text,
  p_employee_id uuid,
  p_actor_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_employment uuid;
BEGIN
  IF NOT public.has_company_access(p_actor_id, p_entity)
     OR NOT (
       public.has_role(p_actor_id, 'admin'::public.app_role)
       OR EXISTS (
         SELECT 1 FROM public.user_scopes us
         WHERE us.user_id = p_actor_id AND us.scope_type = 'portal'
           AND us.scope_value IN ('admin', 'wholesale', 'production')
       )
     ) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  SELECT x.id INTO v_employment FROM public.employments x
  WHERE x.employee_id = p_employee_id AND x.legal_entity_id = p_entity
  ORDER BY x.is_active DESC, x.start_date DESC NULLS LAST LIMIT 1;
  IF v_employment IS NULL THEN
    RAISE EXCEPTION 'Ingen anställning i % för medarbetaren', p_entity;
  END IF;

  UPDATE public.employments
  SET fortnox_employee_id = p_employee_number,
      employment_number = COALESCE(employment_number, p_employee_number),
      updated_at = now()
  WHERE id = v_employment;

  UPDATE public.fortnox_employees
  SET matched_employee_id = p_employee_id, confirmed = true, updated_at = now()
  WHERE legal_entity_code = p_entity AND employee_number = p_employee_number;
  RETURN v_employment;
END;
$$;

REVOKE ALL ON FUNCTION public.fortnox_match_employees(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fortnox_link_employee(text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fortnox_match_employees(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fortnox_link_employee(text, text, uuid, uuid) TO service_role;