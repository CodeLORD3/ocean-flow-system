CREATE OR REPLACE FUNCTION public.order_line_batches(_reference_type text, _reference_id uuid)
RETURNS TABLE (product_id uuid, batches text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sm.product_id,
         string_agg(DISTINCT l.lot_number, ', ' ORDER BY l.lot_number)
  FROM public.stock_movements sm
  JOIN public.lots l ON l.id = sm.lot_id
  WHERE sm.reference_type = _reference_type
    AND sm.reference_id = _reference_id
    AND sm.lot_id IS NOT NULL
  GROUP BY sm.product_id;
$$;
REVOKE ALL ON FUNCTION public.order_line_batches(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_line_batches(text, uuid) TO authenticated, service_role;