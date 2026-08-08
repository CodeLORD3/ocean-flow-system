-- 1. Rörelseloggen nollställer kostpriset när saldot når 0
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_qty numeric(14,3) := 0;
  old_avg numeric(12,2) := 0;
  new_qty numeric(14,3);
  new_avg numeric(12,2);
BEGIN
  PERFORM set_config('app.stock_ledger', 'on', true);

  SELECT quantity, avg_cost INTO old_qty, old_avg
  FROM public.product_stock_locations
  WHERE product_id = NEW.product_id AND location_id = NEW.location_id
  FOR UPDATE;

  IF NOT FOUND THEN
    old_qty := 0;
    old_avg := 0;
  END IF;

  new_qty := COALESCE(old_qty, 0) + NEW.quantity_kg;
  new_avg := COALESCE(old_avg, 0);

  IF NEW.quantity_kg > 0 AND NEW.unit_cost IS NOT NULL THEN
    IF new_qty > 0 THEN
      new_avg := ROUND(
        ((GREATEST(COALESCE(old_qty, 0), 0) * COALESCE(old_avg, 0)) + (NEW.quantity_kg * NEW.unit_cost))
        / (GREATEST(COALESCE(old_qty, 0), 0) + NEW.quantity_kg), 2);
    ELSE
      new_avg := NEW.unit_cost;
    END IF;
  END IF;

  -- Ett tomt saldo får inte bära kostpris vidare: annars viktas nästa
  -- inleverans mot ett pris för varor som inte finns i lagret.
  IF new_qty <= 0 THEN
    new_avg := 0;
  END IF;

  INSERT INTO public.product_stock_locations (product_id, location_id, quantity, avg_cost, stock_value, unit_cost, updated_at)
  VALUES (NEW.product_id, NEW.location_id, new_qty, new_avg, ROUND(new_qty * new_avg, 2), new_avg, now())
  ON CONFLICT (product_id, location_id) DO UPDATE
    SET quantity = new_qty,
        avg_cost = new_avg,
        stock_value = ROUND(new_qty * new_avg, 2),
        unit_cost = new_avg,
        updated_at = now();

  PERFORM set_config('app.stock_ledger', 'off', true);
  RETURN NEW;
END;
$function$;

-- 2. Rörelseloggens egen underhållsfunktion för historiska rader.
--    Skriver genom samma kanal som triggern (app.stock_ledger), aldrig som direktskrivning.
CREATE OR REPLACE FUNCTION public.ledger_zero_empty_costs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  PERFORM set_config('app.stock_ledger', 'on', true);

  UPDATE public.product_stock_locations
     SET avg_cost = 0,
         unit_cost = 0,
         stock_value = 0,
         updated_at = now()
   WHERE quantity <= 0
     AND (COALESCE(avg_cost, 0) <> 0 OR COALESCE(unit_cost, 0) <> 0);

  GET DIAGNOSTICS n = ROW_COUNT;

  PERFORM set_config('app.stock_ledger', 'off', true);
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.ledger_zero_empty_costs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ledger_zero_empty_costs() TO service_role;

-- 3. Nollställ de historiska raderna
SELECT public.ledger_zero_empty_costs();