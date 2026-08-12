ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS preliminary_unit_cost numeric,
  ADD COLUMN IF NOT EXISTS price_finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_finalized_by uuid;

CREATE OR REPLACE FUNCTION public.finalize_lot_price(
  _lot_id uuid,
  _final_unit_cost numeric,
  _invoice_number text DEFAULT NULL,
  _invoice_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _old numeric;
  _ratio numeric;
  _lot_number text;
  _ids uuid[];
  _pairs int := 0;
BEGIN
  IF _final_unit_cost IS NULL OR _final_unit_cost < 0 THEN
    RAISE EXCEPTION 'Ogiltigt fakturapris';
  END IF;
  IF NOT (public.is_staff() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Behörighet saknas';
  END IF;

  SELECT unit_cost, lot_number INTO _old, _lot_number
  FROM public.lots WHERE id = _lot_id FOR UPDATE;
  IF _lot_number IS NULL THEN
    RAISE EXCEPTION 'Partiet finns inte';
  END IF;

  UPDATE public.lots SET
    preliminary_unit_cost = COALESCE(preliminary_unit_cost, _old),
    unit_cost = _final_unit_cost,
    price_status = 'faststalld',
    invoice_number = COALESCE(_invoice_number, invoice_number),
    invoice_date = COALESCE(_invoice_date, invoice_date),
    price_finalized_at = now(),
    price_finalized_by = auth.uid(),
    updated_at = now()
  WHERE id = _lot_id;

  -- Alla partier som härstammar ur partiet (tillverkning) skalas proportionellt.
  WITH RECURSIVE d AS (
    SELECT to_lot_id AS lot_id FROM public.lot_transformations WHERE from_lot_id = _lot_id
    UNION
    SELECT t.to_lot_id FROM public.lot_transformations t JOIN d ON t.from_lot_id = d.lot_id
  )
  SELECT array_agg(lot_id) INTO _ids FROM d WHERE lot_id IS NOT NULL;

  IF _old IS NOT NULL AND _old > 0 AND _ids IS NOT NULL THEN
    _ratio := _final_unit_cost / _old;
    UPDATE public.lots l
      SET unit_cost = ROUND(l.unit_cost * _ratio, 4), updated_at = now()
    WHERE l.id = ANY(_ids)
      AND l.unit_cost IS NOT NULL
      AND COALESCE(l.price_status, 'preliminar') <> 'faststalld';
  END IF;

  _ids := COALESCE(_ids, ARRAY[]::uuid[]) || _lot_id;

  -- Rörelser bär partiets pris.
  PERFORM set_config('app.stock_ledger', 'on', true);

  UPDATE public.stock_movements m
    SET unit_cost = l.unit_cost
  FROM public.lots l
  WHERE m.lot_id = l.id AND l.id = ANY(_ids);

  -- Dagssnitt och lagervärde räknas om ur kvarvarande partisaldon per lagerplats.
  WITH pairs AS (
    SELECT DISTINCT product_id, location_id
    FROM public.stock_movements
    WHERE lot_id = ANY(_ids)
  ),
  recalc AS (
    SELECT p.product_id,
           p.location_id,
           COALESCE(SUM(GREATEST(b.qty, 0) * COALESCE(b.unit_cost, 0)), 0) AS value,
           COALESCE(SUM(GREATEST(b.qty, 0)), 0) AS qty
    FROM pairs p
    LEFT JOIN (
      SELECT m.product_id, m.location_id, m.lot_id,
             SUM(m.quantity_kg) AS qty,
             MAX(l.unit_cost) AS unit_cost
      FROM public.stock_movements m
      JOIN public.lots l ON l.id = m.lot_id
      GROUP BY m.product_id, m.location_id, m.lot_id
    ) b ON b.product_id = p.product_id AND b.location_id = p.location_id
    GROUP BY p.product_id, p.location_id
  )
  UPDATE public.product_stock_locations psl
    SET avg_cost = CASE WHEN r.qty > 0 THEN ROUND(r.value / r.qty, 2) ELSE 0 END,
        unit_cost = CASE WHEN r.qty > 0 THEN ROUND(r.value / r.qty, 2) ELSE 0 END,
        stock_value = CASE
          WHEN r.qty > 0 THEN ROUND(psl.quantity * (r.value / r.qty), 2)
          ELSE 0 END,
        updated_at = now()
  FROM recalc r
  WHERE psl.product_id = r.product_id AND psl.location_id = r.location_id;

  SELECT count(*) INTO _pairs
  FROM public.stock_movements WHERE lot_id = ANY(_ids);

  PERFORM set_config('app.stock_ledger', 'off', true);

  INSERT INTO public.activity_logs (action, entity_type, entity_id, description, user_id)
  VALUES (
    'finalize_lot_price',
    'lot',
    _lot_id::text,
    format('Fastställt fakturapris för parti %s: %s -> %s kr/kg%s',
      _lot_number,
      COALESCE(_old::text, '—'),
      _final_unit_cost::text,
      CASE WHEN _invoice_number IS NULL THEN '' ELSE ' (faktura ' || _invoice_number || ')' END),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'lot_id', _lot_id,
    'previous_unit_cost', _old,
    'final_unit_cost', _final_unit_cost,
    'derived_lots', COALESCE(array_length(_ids, 1), 0) - 1,
    'movements_updated', _pairs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_lot_price(uuid, numeric, text, date) TO authenticated;