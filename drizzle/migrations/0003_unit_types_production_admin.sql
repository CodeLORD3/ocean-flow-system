ALTER TABLE public.stores DROP CONSTRAINT stores_unit_type_check;
ALTER TABLE public.stores ADD CONSTRAINT stores_unit_type_check CHECK (unit_type = ANY (ARRAY['butik','grossist','overhead','produktion','admin']));
CREATE OR REPLACE FUNCTION public.unit_has_sales(_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT COALESCE((SELECT unit_type NOT IN ('produktion','admin','overhead') FROM public.stores WHERE id = _store_id), true)
$$;
GRANT EXECUTE ON FUNCTION public.unit_has_sales(uuid) TO authenticated, service_role;