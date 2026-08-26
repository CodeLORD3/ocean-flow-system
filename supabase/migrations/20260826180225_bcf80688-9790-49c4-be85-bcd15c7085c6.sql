-- Är kontot butiksscopat (endast store-scopes, inga bredare scopes)?
CREATE OR REPLACE FUNCTION public.is_store_scoped(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.user_scopes
      WHERE user_id = _user_id AND scope_type = 'store'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_scopes
      WHERE user_id = _user_id
        AND scope_type IN ('platform','tenant','region','company','entity')
    )
$$;

CREATE OR REPLACE FUNCTION public.can_see_store(_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _store_id IS NULL THEN true
    WHEN public.is_platform_admin(auth.uid()) THEN true
    WHEN NOT public.has_company_scoping(auth.uid()) THEN true
    WHEN public.is_store_scoped(auth.uid()) THEN
      public.has_scope(auth.uid(), 'store', _store_id::text)
      AND (
        (SELECT count(*) FROM public.user_scopes
          WHERE user_id = auth.uid() AND scope_type = 'store') = 1
        OR public.has_role(auth.uid(), 'multi_store_manager')
      )
    ELSE public.has_company_access(
           auth.uid(),
           (SELECT legal_entity_id FROM public.stores WHERE id = _store_id)
         )
  END
$$;

REVOKE EXECUTE ON FUNCTION public.is_store_scoped(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_store_scoped(uuid) TO authenticated;
