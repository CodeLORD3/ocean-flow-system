CREATE OR REPLACE FUNCTION public.confirm_production_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _status text;
  _total numeric;
  _staff uuid;
  _rows int := 0;
  _flytande constant uuid := '5da57ad6-f72c-4a84-9873-87174d194e10';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Du måste vara inloggad.';
  END IF;

  SELECT status INTO _status FROM production_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produktionsrapporten finns inte.';
  END IF;

  -- Idempotent: redan bekräftad eller redan bokad ger inga nya rörelser.
  IF _status = 'Bekräftad' OR EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_type = 'production_report' AND reference_id = _report_id
  ) THEN
    UPDATE production_reports
       SET status = 'Bekräftad',
           total_quantity = COALESCE((SELECT sum(quantity) FROM production_report_lines WHERE report_id = _report_id), 0)
     WHERE id = _report_id AND status IS DISTINCT FROM 'Bekräftad';
    RETURN jsonb_build_object('status', 'redan_bekraftad', 'movements', 0);
  END IF;

  SELECT id INTO _staff FROM staff WHERE user_id = auth.uid() LIMIT 1;

  INSERT INTO stock_movements (product_id, location_id, movement_type, quantity_kg, unit_cost, reference_type, reference_id, note, created_by)
  SELECT l.product_id, _flytande, 'tillverkning_in', round(l.quantity, 3),
         NULLIF(COALESCE(p.cost_price, 0), 0), 'production_report', _report_id,
         'Bekräftad produktionsrapport', _staff
    FROM production_report_lines l
    LEFT JOIN products p ON p.id = l.product_id
   WHERE l.report_id = _report_id AND l.product_id IS NOT NULL AND round(l.quantity, 3) > 0;
  GET DIAGNOSTICS _rows = ROW_COUNT;

  SELECT COALESCE(sum(quantity), 0) INTO _total FROM production_report_lines WHERE report_id = _report_id;
  UPDATE production_reports SET status = 'Bekräftad', total_quantity = _total WHERE id = _report_id;

  RETURN jsonb_build_object('status', 'bekraftad', 'movements', _rows, 'total', _total);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_production_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_production_report(uuid) TO authenticated;