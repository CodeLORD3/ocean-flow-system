CREATE OR REPLACE FUNCTION public.my_company_access_all()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_platform_admin(auth.uid()) OR NOT public.has_company_scoping(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.my_company_ids()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT target.legal_entity_id FROM public.legal_entities target
  WHERE public.has_company_access(auth.uid(), target.legal_entity_id)
$$;

REVOKE ALL ON FUNCTION public.my_company_access_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_company_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_company_access_all() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_company_ids() TO authenticated, service_role;

ALTER POLICY "Public access" ON public.shop_orders
  USING ((SELECT public.is_staff()) AND ((SELECT public.my_company_access_all()) OR legal_entity_id IS NULL OR legal_entity_id IN (SELECT public.my_company_ids())))
  WITH CHECK ((SELECT public.is_staff()) AND ((SELECT public.my_company_access_all()) OR legal_entity_id IS NULL OR legal_entity_id IN (SELECT public.my_company_ids())));

ALTER POLICY "Public access" ON public.shop_order_lines
  USING ((SELECT public.is_staff()) AND (shop_order_id IS NULL OR EXISTS (SELECT 1 FROM public.shop_orders par WHERE par.id = shop_order_lines.shop_order_id AND ((SELECT public.my_company_access_all()) OR par.legal_entity_id IS NULL OR par.legal_entity_id IN (SELECT public.my_company_ids())))))
  WITH CHECK ((SELECT public.is_staff()) AND (shop_order_id IS NULL OR EXISTS (SELECT 1 FROM public.shop_orders par WHERE par.id = shop_order_lines.shop_order_id AND ((SELECT public.my_company_access_all()) OR par.legal_entity_id IS NULL OR par.legal_entity_id IN (SELECT public.my_company_ids())))));