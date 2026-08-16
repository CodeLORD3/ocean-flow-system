CREATE OR REPLACE FUNCTION public.has_company_scoping(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_scopes
    WHERE user_id = _user_id
      AND scope_type IN ('platform','tenant','region','company','entity','store')
  )
$$;

CREATE OR REPLACE FUNCTION public.user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT us.scope_value::uuid
  FROM public.user_scopes us
  WHERE us.user_id = _user_id AND us.scope_type = 'tenant'
  UNION
  SELECT le.tenant_id
  FROM public.user_scopes us
  JOIN public.legal_entities le ON le.legal_entity_id = us.scope_value
  WHERE us.user_id = _user_id AND us.scope_type IN ('company','entity') AND le.tenant_id IS NOT NULL
  UNION
  SELECT le.tenant_id
  FROM public.user_scopes us
  JOIN public.stores s ON s.id::text = us.scope_value
  JOIN public.legal_entities le ON le.legal_entity_id = s.legal_entity_id
  WHERE us.user_id = _user_id AND us.scope_type = 'store' AND le.tenant_id IS NOT NULL
  UNION
  SELECT le.tenant_id
  FROM public.staff st
  JOIN public.legal_entities le ON le.legal_entity_id = st.legal_entity_id
  WHERE st.user_id = _user_id AND le.tenant_id IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _legal_entity_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR NOT public.has_company_scoping(_user_id)
    OR _legal_entity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.legal_entities target
      WHERE target.legal_entity_id = _legal_entity_id
        AND target.tenant_id IN (SELECT public.user_tenant_ids(_user_id))
        AND (
          EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id AND us.scope_type = 'tenant'
              AND us.scope_value = target.tenant_id::text
          )
          OR EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id AND us.scope_type = 'region'
              AND us.scope_value = target.country_tag
          )
          OR EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id AND us.scope_type IN ('company','entity')
              AND us.scope_value = target.legal_entity_id
          )
          OR EXISTS (
            SELECT 1
            FROM public.user_scopes us
            JOIN public.stores s ON s.id::text = us.scope_value
            WHERE us.user_id = _user_id AND us.scope_type = 'store'
              AND s.legal_entity_id = target.legal_entity_id
          )
        )
    )
$$;