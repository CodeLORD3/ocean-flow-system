-- ============ 6B-1: NUMMERSERIER ============
ALTER TABLE public.legal_entities ADD COLUMN IF NOT EXISTS series_code text;
UPDATE public.legal_entities SET series_code = CASE legal_entity_id
  WHEN 'fsab-se' THEN 'FSAB' WHEN 'de-no1' THEN 'DE1' WHEN 'fsab-ch' THEN 'ZOLL'
  ELSE upper(regexp_replace(legal_entity_id, '[^a-zA-Z0-9]', '', 'g')) END
WHERE series_code IS NULL;

CREATE TABLE IF NOT EXISTS public.number_series (
  series_key text NOT NULL,
  entity_key text NOT NULL DEFAULT '-',
  year integer NOT NULL,
  prefix text NOT NULL,
  padding integer NOT NULL DEFAULT 4,
  last_value bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (series_key, entity_key, year)
);
GRANT SELECT ON public.number_series TO authenticated;
GRANT ALL ON public.number_series TO service_role;
ALTER TABLE public.number_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view number series" ON public.number_series
  FOR SELECT TO authenticated USING (public.is_staff());
CREATE POLICY "Admins manage number series" ON public.number_series
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Atomär nummerutdelning. Raden låses av ON CONFLICT DO UPDATE, så samtidiga
-- anrop får aldrig samma nummer.
CREATE OR REPLACE FUNCTION public.next_series_number(
  _series_key text, _prefix text DEFAULT NULL, _entity text DEFAULT NULL, _year integer DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year int; v_entity text; v_val bigint; v_prefix text; v_pad int;
BEGIN
  v_year := COALESCE(_year, EXTRACT(YEAR FROM now())::int);
  v_entity := COALESCE(NULLIF(_entity, ''), '-');
  INSERT INTO public.number_series (series_key, entity_key, year, prefix, last_value)
  VALUES (_series_key, v_entity, v_year, COALESCE(NULLIF(_prefix, ''), upper(_series_key)), 1)
  ON CONFLICT (series_key, entity_key, year)
  DO UPDATE SET last_value = number_series.last_value + 1, updated_at = now()
  RETURNING last_value, prefix, padding INTO v_val, v_prefix, v_pad;
  RETURN v_prefix
    || CASE WHEN v_entity = '-' THEN '' ELSE '-' || v_entity END
    || '-' || v_year::text || '-' || lpad(v_val::text, v_pad, '0');
END $$;

CREATE OR REPLACE FUNCTION public.entity_series_code(_legal_entity_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT series_code FROM public.legal_entities WHERE legal_entity_id = _legal_entity_id),
                  (SELECT series_code FROM public.legal_entities WHERE legal_entity_id = 'fsab-se'),
                  'FSAB')
$$;

DROP FUNCTION IF EXISTS public.next_internal_lot_number();
CREATE OR REPLACE FUNCTION public.next_internal_lot_number(_legal_entity_id text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.next_series_number('lot', 'IL', public.entity_series_code(COALESCE(_legal_entity_id, 'fsab-se')));
END $$;

CREATE OR REPLACE FUNCTION public.next_delivery_number(_legal_entity_id text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.next_series_number('delivery', 'INL', public.entity_series_code(COALESCE(_legal_entity_id, 'fsab-se')));
END $$;

-- Serien fortsätter efter högsta befintliga IL-nummer; gamla nummer står kvar.
INSERT INTO public.number_series (series_key, entity_key, year, prefix, padding, last_value)
SELECT 'lot', public.entity_series_code('fsab-se'), EXTRACT(YEAR FROM now())::int, 'IL', 4,
       COALESCE(MAX(NULLIF(regexp_replace(lot_number, '^IL-(\d{4})-', ''), lot_number))::bigint, 0)
FROM public.lots WHERE lot_number ~ '^IL-\d{4}-\d+$'
ON CONFLICT DO NOTHING;

INSERT INTO public.number_series (series_key, entity_key, year, prefix, padding, last_value)
SELECT 'delivery', public.entity_series_code('fsab-se'), EXTRACT(YEAR FROM now())::int, 'INL', 4,
       COALESCE(count(*), 0)
FROM public.incoming_deliveries
ON CONFLICT DO NOTHING;

-- Skyddsnät: parti utan nummer får ett från databasen i stället för att krascha.
ALTER TABLE public.lots ALTER COLUMN lot_number SET DEFAULT public.next_internal_lot_number();

-- ============ 6B-2: USER_SCOPES ============
CREATE TABLE IF NOT EXISTS public.user_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('portal', 'store', 'entity')),
  scope_value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scope_type, scope_value)
);
GRANT SELECT ON public.user_scopes TO authenticated;
GRANT ALL ON public.user_scopes TO service_role;
ALTER TABLE public.user_scopes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own scopes" ON public.user_scopes
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage scopes" ON public.user_scopes
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Överflyttning av befintlig behörighet
INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'portal', p FROM public.staff s, unnest(COALESCE(s.portal_access, '{}')) p
WHERE s.user_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'store', sid::text FROM public.staff s, unnest(COALESCE(s.allowed_store_ids, '{}'::uuid[])) sid
WHERE s.user_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'store', s.allowed_store_id::text FROM public.staff s
WHERE s.user_id IS NOT NULL AND s.allowed_store_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
SELECT s.user_id, 'entity', s.legal_entity_id FROM public.staff s
WHERE s.user_id IS NOT NULL AND s.legal_entity_id IS NOT NULL ON CONFLICT DO NOTHING;

-- Hjälpfunktioner: user_scopes är enda källan
CREATE OR REPLACE FUNCTION public.has_scope(_user_id uuid, _type text, _value text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_scopes
                 WHERE user_id = _user_id AND scope_type = _type AND scope_value = _value)
$$;

CREATE OR REPLACE FUNCTION public.user_portals(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(scope_value ORDER BY scope_value), '{}'::text[])
  FROM public.user_scopes WHERE user_id = _user_id AND scope_type = 'portal'
$$;

CREATE OR REPLACE FUNCTION public.user_store_ids(_user_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(scope_value::uuid), '{}'::uuid[])
  FROM public.user_scopes WHERE user_id = _user_id AND scope_type = 'store'
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  OR (
    _role = 'admin'::app_role AND EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = _user_id AND us.scope_type = 'portal'
        AND us.scope_value IN ('admin', 'wholesale')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.user_scopes us
      WHERE us.user_id = auth.uid() AND us.scope_type = 'portal'
        AND us.scope_value IN ('admin', 'wholesale', 'production')
    )
$$;

CREATE OR REPLACE FUNCTION public.staff_has_store(_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_staff_manager()
    OR public.has_scope(auth.uid(), 'store', _store::text)
    OR EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid() AND s.store_id = _store)
    OR (
      EXISTS (SELECT 1 FROM public.staff s WHERE s.user_id = auth.uid())
      AND NOT EXISTS (SELECT 1 FROM public.user_scopes us
                      WHERE us.user_id = auth.uid() AND us.scope_type = 'store')
    )
$$;

-- Gamla vägen bort: portal_access och tillåtna butiker på staff
ALTER TABLE public.staff DROP COLUMN IF EXISTS portal_access;
ALTER TABLE public.staff DROP COLUMN IF EXISTS allowed_store_ids;
ALTER TABLE public.staff DROP COLUMN IF EXISTS allowed_store_id;

CREATE OR REPLACE VIEW public.staff_access WITH (security_invoker = on) AS
SELECT s.*,
       public.user_portals(s.user_id) AS portal_access,
       public.user_store_ids(s.user_id) AS allowed_store_ids,
       st.name AS store_name
FROM public.staff s
LEFT JOIN public.stores st ON st.id = s.store_id;
GRANT SELECT ON public.staff_access TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_scopes(_staff_id uuid, _portals text[], _store_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Endast administratörer kan ändra behörigheter.';
  END IF;
  SELECT user_id INTO v_user FROM public.staff WHERE id = _staff_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Personalen saknar inloggningskonto och kan inte få behörigheter.';
  END IF;
  DELETE FROM public.user_scopes WHERE user_id = v_user AND scope_type IN ('portal', 'store');
  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'portal', p FROM unnest(COALESCE(_portals, '{}'::text[])) p
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'store', sid::text FROM unnest(COALESCE(_store_ids, '{}'::uuid[])) sid
  ON CONFLICT DO NOTHING;
END $$;
GRANT EXECUTE ON FUNCTION public.set_user_scopes(uuid, text[], uuid[]) TO authenticated;