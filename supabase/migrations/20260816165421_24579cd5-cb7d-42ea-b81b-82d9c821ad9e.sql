-- Har användaren en scope-rad över huvud taget? (övergångsskydd)
CREATE OR REPLACE FUNCTION public.has_company_scoping(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_scopes
    WHERE user_id = _user_id
      AND scope_type IN ('platform','tenant','region','company','store')
  )
$$;

-- Plattformsnivå: driftar plattformen, över alla tenants
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_admin'::app_role
  )
  OR EXISTS (
    SELECT 1 FROM public.user_scopes
    WHERE user_id = _user_id AND scope_type = 'platform'
  )
$$;

-- Vilka tenants hör användaren till? (tenant-scope, region/company/store-scope, personalrad)
CREATE OR REPLACE FUNCTION public.user_tenant_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT us.scope_value::uuid
  FROM public.user_scopes us
  WHERE us.user_id = _user_id AND us.scope_type = 'tenant'
  UNION
  SELECT le.tenant_id
  FROM public.user_scopes us
  JOIN public.legal_entities le ON le.legal_entity_id = us.scope_value
  WHERE us.user_id = _user_id AND us.scope_type = 'company' AND le.tenant_id IS NOT NULL
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

-- Kärnan: får användaren se det här bolaget?
CREATE OR REPLACE FUNCTION public.has_company_access(_user_id uuid, _legal_entity_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Plattformsnivå ser allt
    public.is_platform_admin(_user_id)
    -- Övergång: användare utan tilldelad nivå behåller nuvarande åtkomst
    OR NOT public.has_company_scoping(_user_id)
    -- Rader utan bolagsstämpel är globala register
    OR _legal_entity_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.legal_entities target
      WHERE target.legal_entity_id = _legal_entity_id
        -- Tenant-gränsen är absolut
        AND target.tenant_id IN (SELECT public.user_tenant_ids(_user_id))
        AND (
          -- Hela tenanten (group_admin)
          EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id
              AND us.scope_type = 'tenant'
              AND us.scope_value = target.tenant_id::text
          )
          -- Region: bolag med samma country_tag inom samma tenant
          OR EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id
              AND us.scope_type = 'region'
              AND us.scope_value = target.country_tag
          )
          -- Enskilt bolag
          OR EXISTS (
            SELECT 1 FROM public.user_scopes us
            WHERE us.user_id = _user_id
              AND us.scope_type = 'company'
              AND us.scope_value = target.legal_entity_id
          )
          -- Butik inom bolaget
          OR EXISTS (
            SELECT 1
            FROM public.user_scopes us
            JOIN public.stores s ON s.id::text = us.scope_value
            WHERE us.user_id = _user_id
              AND us.scope_type = 'store'
              AND s.legal_entity_id = target.legal_entity_id
          )
        )
    )
$$;

-- Bekvämlighet: bolagsåtkomst för inloggad användare
CREATE OR REPLACE FUNCTION public.can_see_company(_legal_entity_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_company_access(auth.uid(), _legal_entity_id)
$$;

-- Bolagsåtkomst via butik (för tabeller som bara har store_id)
CREATE OR REPLACE FUNCTION public.can_see_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _store_id IS NULL
    OR public.has_company_access(
         auth.uid(),
         (SELECT legal_entity_id FROM public.stores WHERE id = _store_id)
       )
$$;

-- Policyer för tenants
CREATE POLICY "Se egna tenants" ON public.tenants
FOR SELECT TO authenticated
USING (public.is_platform_admin(auth.uid()) OR id IN (SELECT public.user_tenant_ids(auth.uid())));

CREATE POLICY "Plattformsadmin skapar tenants" ON public.tenants
FOR INSERT TO authenticated
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Plattformsadmin ändrar tenants" ON public.tenants
FOR UPDATE TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));