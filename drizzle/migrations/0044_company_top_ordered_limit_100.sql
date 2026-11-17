CREATE OR REPLACE FUNCTION public.company_top_ordered_products(_store_id uuid, _days int DEFAULT 56)
RETURNS TABLE(product_id uuid, order_count int, typical_qty numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _le text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT s.legal_entity_id INTO _le FROM public.stores s WHERE s.id = _store_id;
  IF _le IS NULL THEN RETURN; END IF;
  IF NOT (public.my_company_access_all()
          OR _le IN (SELECT public.my_company_ids())
          OR _store_id IN (SELECT public.my_employee_store_ids())) THEN
    RAISE EXCEPTION 'no access';
  END IF;
  RETURN QUERY
  SELECT l.product_id,
         count(DISTINCT l.shop_order_id)::int,
         round((percentile_cont(0.5) WITHIN GROUP (ORDER BY l.quantity_ordered))::numeric, 1)
  FROM public.shop_order_lines l
  JOIN public.shop_orders o ON o.id = l.shop_order_id
  JOIN public.stores s ON s.id = o.store_id
  WHERE s.legal_entity_id = _le
    AND o.created_at >= now() - make_interval(days => greatest(1, least(_days, 365)))
    AND coalesce(o.status,'') <> 'Avbruten'
    AND l.quantity_ordered > 0
    AND l.product_id IS NOT NULL
  GROUP BY l.product_id
  ORDER BY 2 DESC, 3 DESC
  LIMIT 100;
END $$;