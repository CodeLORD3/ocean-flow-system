ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS day_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_price_lots integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_price_updated_at timestamptz;

COMMENT ON COLUMN public.products.day_price IS
  'Viktat snittpris för aktiva partier (kvarvarande kg). Endast för prissättning och beställningar — aldrig lagervärdering.';

-- Kvarvarande kvantitet per parti, härledd ur rörelseloggen.
CREATE OR REPLACE VIEW public.lot_remaining AS
SELECT l.id AS lot_id,
       l.product_id,
       l.unit_cost,
       COALESCE(
         (SELECT SUM(m.quantity_kg) FROM public.stock_movements m WHERE m.lot_id = l.id),
         l.quantity_kg
       ) AS remaining_kg
FROM public.lots l
WHERE COALESCE(l.status, '') <> 'avslutad';

GRANT SELECT ON public.lot_remaining TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_product_day_price(_product_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _qty numeric := 0;
  _val numeric := 0;
  _lots integer := 0;
  _price numeric := 0;
BEGIN
  IF _product_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(r.remaining_kg), 0),
         COALESCE(SUM(r.remaining_kg * COALESCE(r.unit_cost, 0)), 0),
         COUNT(*)
    INTO _qty, _val, _lots
  FROM public.lot_remaining r
  WHERE r.product_id = _product_id
    AND r.remaining_kg > 0
    AND COALESCE(r.unit_cost, 0) > 0;

  IF _qty > 0 THEN
    _price := ROUND(_val / _qty, 2);
  ELSE
    _price := 0;
    _lots := 0;
  END IF;

  UPDATE public.products
     SET day_price = _price,
         day_price_lots = _lots,
         day_price_updated_at = now()
   WHERE id = _product_id;

  RETURN _price;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_product_day_price(uuid) TO authenticated, service_role;

-- Rörelser (inleverans, tillverkning, försäljning, svinn, flytt) triggar omräkning.
CREATE OR REPLACE FUNCTION public.trg_recalc_day_price_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.product_id IS DISTINCT FROM COALESCE(NEW.product_id, OLD.product_id) THEN
    PERFORM public.recalc_product_day_price(OLD.product_id);
  END IF;
  PERFORM public.recalc_product_day_price(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_day_price_movement ON public.stock_movements;
CREATE TRIGGER trg_day_price_movement
AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_day_price_movement();

-- Ändrat partipris eller partistatus påverkar dagspriset.
CREATE OR REPLACE FUNCTION public.trg_recalc_day_price_lot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.recalc_product_day_price(OLD.product_id);
  END IF;
  PERFORM public.recalc_product_day_price(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_day_price_lot ON public.lots;
CREATE TRIGGER trg_day_price_lot
AFTER INSERT OR DELETE OR UPDATE OF unit_cost, quantity_kg, status, product_id, price_status
ON public.lots
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_day_price_lot();

-- Nattlig kontroll (svensk tid): nolla pris utan inleverans idag och utan aktivt saldo.
CREATE OR REPLACE FUNCTION public.zero_stale_day_prices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'Europe/Stockholm')::date;
  _zeroed integer := 0;
  _rec record;
BEGIN
  FOR _rec IN SELECT id FROM public.products LOOP
    PERFORM public.recalc_product_day_price(_rec.id);
  END LOOP;

  WITH stale AS (
    SELECT p.id
    FROM public.products p
    WHERE p.day_price <> 0
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements m
        WHERE m.product_id = p.id
          AND m.movement_type = 'inleverans'
          AND (m.created_at AT TIME ZONE 'Europe/Stockholm')::date = _today
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.product_stock_locations psl
        WHERE psl.product_id = p.id AND psl.quantity > 0
      )
  )
  UPDATE public.products p
     SET day_price = 0, day_price_lots = 0, day_price_updated_at = now()
  FROM stale s
  WHERE p.id = s.id;

  GET DIAGNOSTICS _zeroed = ROW_COUNT;
  RETURN _zeroed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.zero_stale_day_prices() TO service_role;

SELECT public.zero_stale_day_prices();