CREATE OR REPLACE VIEW public.v_negative_flags_review WITH (security_invoker = true) AS
SELECT f.id, f.created_at, f.product_id, f.location_id, f.movement_type, f.movement_qty, f.resulting_qty, f.driver_note,
  p.name AS product_name, p.sku, sl.name AS location_name, s.id AS store_id, s.name AS store_name,
  fix.id AS fix_movement_id, fix.created_at AS fix_at, fix.movement_type AS fix_type,
  CASE
    WHEN fix.id IS NOT NULL THEN 'inventering_rattat'
    WHEN EXISTS (SELECT 1 FROM public.stock_transformations t WHERE t.target_product_id = f.product_id) THEN 'omvandling_saknas'
    ELSE 'forsaljning_utan_registrering'
  END AS sannolik_orsak
FROM public.stock_negative_flags f
JOIN public.products p ON p.id = f.product_id
JOIN public.storage_locations sl ON sl.id = f.location_id
LEFT JOIN public.stores s ON s.id = sl.store_id
LEFT JOIN LATERAL (
  SELECT m.id, m.created_at, m.movement_type FROM public.stock_movements m
  WHERE m.product_id = f.product_id AND m.location_id = f.location_id
    AND m.movement_type IN ('inventering','justering') AND m.created_at > f.created_at
    AND m.id IS DISTINCT FROM f.movement_id
  ORDER BY m.created_at LIMIT 1) fix ON true
WHERE f.acknowledged_at IS NULL;

GRANT SELECT ON public.v_negative_flags_review TO authenticated;
GRANT SELECT ON public.v_negative_flags_review TO service_role;

-- Väntar på OK: kvitterar flaggor som rättats av senare inventering/justering. Körs inte automatiskt.
CREATE OR REPLACE FUNCTION public.ack_negative_flags_fixed_by_count(_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'Endast admin'; END IF;
  SELECT count(*) INTO _n FROM v_negative_flags_review WHERE sannolik_orsak = 'inventering_rattat';
  IF _dry_run THEN RETURN jsonb_build_object('dry_run', true, 'antal', _n); END IF;
  UPDATE stock_negative_flags f SET acknowledged_at = now(), acknowledged_by = auth.uid(), ack_note = 'rättad vid inventering'
  WHERE f.acknowledged_at IS NULL AND f.id IN (SELECT id FROM v_negative_flags_review WHERE sannolik_orsak = 'inventering_rattat');
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN jsonb_build_object('dry_run', false, 'kvitterade', _n);
END $$;
REVOKE ALL ON FUNCTION public.ack_negative_flags_fixed_by_count(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ack_negative_flags_fixed_by_count(boolean) TO authenticated;