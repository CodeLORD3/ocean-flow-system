CREATE OR REPLACE FUNCTION public.user_company_ids(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT scope_value FROM public.user_scopes
  WHERE user_id = _user_id AND scope_type IN ('company','entity')
$$;

CREATE OR REPLACE FUNCTION public.user_region_tags(_user_id uuid)
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT scope_value FROM public.user_scopes
  WHERE user_id = _user_id AND scope_type = 'region'
$$;

CREATE OR REPLACE FUNCTION public.user_primary_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT ur.role::text FROM public.user_roles ur
  WHERE ur.user_id = _user_id
  ORDER BY CASE ur.role::text
    WHEN 'platform_admin' THEN 1
    WHEN 'group_admin' THEN 2
    WHEN 'region_admin' THEN 3
    WHEN 'company_admin' THEN 4
    WHEN 'admin' THEN 5
    WHEN 'wholesale_staff' THEN 6
    WHEN 'store_manager' THEN 7
    WHEN 'store_staff' THEN 8
    ELSE 9 END
  LIMIT 1
$$;

DROP VIEW IF EXISTS public.staff_access;
CREATE VIEW public.staff_access AS
SELECT s.id,
    s.first_name,
    s.last_name,
    s.age,
    s.phone,
    s.email,
    s.workplace,
    s.profile_image_url,
    s.store_id,
    s.created_at,
    s.user_id,
    s.must_change_password,
    s.legal_entity_id,
    s.hourly_rate,
    public.user_portals(s.user_id) AS portal_access,
    public.user_store_ids(s.user_id) AS allowed_store_ids,
    ARRAY(SELECT public.user_company_ids(s.user_id)) AS allowed_company_ids,
    ARRAY(SELECT public.user_region_tags(s.user_id)) AS allowed_region_tags,
    ARRAY(SELECT public.user_tenant_ids(s.user_id))::text[] AS allowed_tenant_ids,
    public.user_primary_role(s.user_id) AS primary_role,
    public.is_platform_admin(s.user_id) AS is_platform_admin,
    st.name AS store_name
   FROM public.staff s
     LEFT JOIN public.stores st ON st.id = s.store_id;

GRANT SELECT ON public.staff_access TO authenticated;

CREATE OR REPLACE FUNCTION public.set_user_access(
  _staff_id uuid,
  _role text,
  _portals text[],
  _tenant_ids text[],
  _company_ids text[],
  _region_tags text[],
  _store_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_user uuid; v_allowed boolean;
BEGIN
  SELECT public.is_platform_admin(auth.uid())
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.user_scopes
        WHERE user_id = auth.uid() AND scope_type = 'portal'
          AND scope_value IN ('admin','wholesale')
      )
    INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Endast administratörer kan ändra behörigheter.';
  END IF;

  SELECT user_id INTO v_user FROM public.staff WHERE id = _staff_id;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Personalen saknar inloggningskonto och kan inte få behörigheter.';
  END IF;

  IF _role = 'platform_admin' AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Endast plattformsadministratörer kan tilldela plattformsrollen.';
  END IF;

  DELETE FROM public.user_scopes WHERE user_id = v_user
    AND scope_type IN ('portal','store','tenant','region','company','entity','platform');

  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'portal', p FROM unnest(COALESCE(_portals,'{}'::text[])) p
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'store', sid::text FROM unnest(COALESCE(_store_ids,'{}'::uuid[])) sid
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'tenant', t FROM unnest(COALESCE(_tenant_ids,'{}'::text[])) t
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'region', r FROM unnest(COALESCE(_region_tags,'{}'::text[])) r
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
  SELECT v_user, 'company', c FROM unnest(COALESCE(_company_ids,'{}'::text[])) c
  ON CONFLICT DO NOTHING;

  IF _role = 'platform_admin' THEN
    INSERT INTO public.user_scopes (user_id, scope_type, scope_value)
    VALUES (v_user, 'platform', 'all') ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.user_roles WHERE user_id = v_user;
  IF _role IS NOT NULL AND _role <> '' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user, _role::app_role) ON CONFLICT DO NOTHING;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.set_user_access(uuid, text, text[], text[], text[], text[], uuid[]) TO authenticated;