-- Rörelseloggen markerar sig själv som avsändare under sitt eget anrop.
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

-- Spärr: saldofälten får bara skrivas när rörelseloggen är avsändare.
CREATE OR REPLACE FUNCTION public.guard_stock_balance_writes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  from_ledger boolean := COALESCE(current_setting('app.stock_ledger', true), 'off') = 'on';
BEGIN
  IF from_ledger THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Nya rader får bara skapas som tomma platshållare (t.ex. miniminivå).
    IF COALESCE(NEW.quantity, 0) <> 0
       OR COALESCE(NEW.avg_cost, 0) <> 0
       OR COALESCE(NEW.unit_cost, 0) <> 0 THEN
      RAISE EXCEPTION 'Lagersaldo kan bara skapas via rörelseloggen (stock_movements).';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.quantity, 0) <> 0 THEN
      RAISE EXCEPTION 'Lagersaldo med kvantitet kan inte raderas — bokför en rörelse i stock_movements.';
    END IF;
    RETURN OLD;
  END IF;

  IF COALESCE(NEW.quantity, 0) IS DISTINCT FROM COALESCE(OLD.quantity, 0)
     OR COALESCE(NEW.avg_cost, 0) IS DISTINCT FROM COALESCE(OLD.avg_cost, 0)
     OR COALESCE(NEW.unit_cost, 0) IS DISTINCT FROM COALESCE(OLD.unit_cost, 0) THEN
    RAISE EXCEPTION 'Lagersaldo kan bara ändras via rörelseloggen (stock_movements).';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_stock_balance_writes_trg ON public.product_stock_locations;
CREATE TRIGGER guard_stock_balance_writes_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.product_stock_locations
FOR EACH ROW EXECUTE FUNCTION public.guard_stock_balance_writes();

-- products.stock är härlett och får bara skrivas av synk-triggern.
CREATE OR REPLACE FUNCTION public.sync_product_stock_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected uuid;
BEGIN
  affected := COALESCE(NEW.product_id, OLD.product_id);
  IF affected IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  PERFORM set_config('app.stock_sync', 'on', true);

  UPDATE public.products p
     SET stock = COALESCE((
           SELECT SUM(psl.quantity)
             FROM public.product_stock_locations psl
            WHERE psl.product_id = affected
         ), 0),
         updated_at = now()
   WHERE p.id = affected;

  PERFORM set_config('app.stock_sync', 'off', true);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_product_stock_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.stock_sync', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.stock, 0) IS DISTINCT FROM COALESCE(OLD.stock, 0) THEN
    RAISE EXCEPTION 'products.stock är härlett från lagerplatserna och kan inte skrivas direkt.';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_product_stock_total_trg ON public.products;
CREATE TRIGGER guard_product_stock_total_trg
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.guard_product_stock_total();