-- 1) Vilka produkter butiken får lagerföra i nästa lagerrapport:
--    de som stod i den senaste godkända rapporten, plus de som kommit in
--    på butikens lagerplatser efter den rapporten.
CREATE OR REPLACE FUNCTION public.store_report_allowed_products(_store_id uuid)
RETURNS TABLE(product_id uuid, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_id uuid;
  _prev_ts timestamptz;
BEGIN
  SELECT s.id, COALESCE(s.closed_at, (s.sheet_date + 1)::timestamptz)
    INTO _prev_id, _prev_ts
    FROM public.daily_stock_sheets s
   WHERE s.store_id = _store_id
     AND s.location_id IS NULL
     AND s.status = 'godkand'
   ORDER BY s.sheet_date DESC, s.closed_at DESC NULLS LAST
   LIMIT 1;

  -- Ingen tidigare rapport: den första rapporten är startvärdet och allt får anges.
  IF _prev_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT l.product_id, 'rapport'::text
    FROM public.daily_stock_sheet_lines l
   WHERE l.sheet_id = _prev_id AND l.product_id IS NOT NULL
  UNION
  SELECT DISTINCT m.product_id, 'inleverans'::text
    FROM public.stock_movements m
    JOIN public.storage_locations sl ON sl.id = m.location_id
   WHERE sl.store_id = _store_id
     AND m.created_at >= _prev_ts
     AND m.quantity_kg > 0
     AND m.movement_type IN ('overforing_in', 'inleverans', 'tillverkning_in', 'kundorder_reversering');
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_report_allowed_products(uuid) TO authenticated;

-- 2) Spärr i databasen: butiken kan inte lagerföra produkter som varken fanns
--    i förra rapporten eller kommit in via en godkänd inleverans.
CREATE OR REPLACE FUNCTION public.enforce_stock_report_line_allowed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _store uuid;
  _loc uuid;
  _has_prev boolean;
  _ok boolean;
  _name text;
BEGIN
  IF NEW.product_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.store_id, s.location_id INTO _store, _loc
    FROM public.daily_stock_sheets s WHERE s.id = NEW.sheet_id;

  -- Regeln gäller butikens lagerrapport (location_id IS NULL), inte utskrivna
  -- inventeringsunderlag per lagerplats.
  IF _store IS NULL OR _loc IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.daily_stock_sheets s
     WHERE s.store_id = _store AND s.location_id IS NULL AND s.status = 'godkand'
       AND s.id <> NEW.sheet_id
  ) INTO _has_prev;

  IF NOT _has_prev THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.store_report_allowed_products(_store) a
     WHERE a.product_id = NEW.product_id
  ) INTO _ok;

  IF NOT _ok THEN
    SELECT p.name INTO _name FROM public.products p WHERE p.id = NEW.product_id;
    RAISE EXCEPTION
      '% kan inte lagerföras: varan fanns inte i förra lagerrapporten och har inte kommit in via en godkänd inleverans.',
      COALESCE(_name, 'Produkten');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_report_line_allowed ON public.daily_stock_sheet_lines;
CREATE TRIGGER trg_stock_report_line_allowed
BEFORE INSERT OR UPDATE OF product_id ON public.daily_stock_sheet_lines
FOR EACH ROW EXECUTE FUNCTION public.enforce_stock_report_line_allowed();

-- 3) Vad som försvunnit ur butikens lager under en period: startsaldo plus
--    inleveranser minus slutsaldo. Svinnrapporten definierar hur mycket som
--    slängts, resten är sålt.
CREATE OR REPLACE FUNCTION public.store_stock_disappearance(_store_id uuid, _from date, _to date)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  sku text,
  unit text,
  start_qty numeric,
  received_qty numeric,
  end_qty numeric,
  disappeared_qty numeric,
  waste_qty numeric,
  sold_qty numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start timestamptz := (_from::timestamp) AT TIME ZONE 'Europe/Stockholm';
  _end timestamptz := ((_to + 1)::timestamp) AT TIME ZONE 'Europe/Stockholm';
BEGIN
  IF NOT (public.is_staff() OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'Endast personal får läsa lagerrörelser.';
  END IF;
  IF NOT public.can_see_store(_store_id) THEN
    RAISE EXCEPTION 'Du har inte åtkomst till den butiken.';
  END IF;

  RETURN QUERY
  WITH locs AS (
    SELECT sl.id, sl.location_type
      FROM public.storage_locations sl
     WHERE sl.store_id = _store_id
  ),
  sale_loc AS (
    SELECT id FROM locs WHERE location_type = 'butik'
  ),
  agg AS (
    SELECT m.product_id,
           SUM(CASE WHEN m.created_at < _start THEN m.quantity_kg ELSE 0 END) AS start_qty,
           SUM(CASE WHEN m.created_at >= _start AND m.created_at < _end
                     AND m.movement_type IN ('overforing_in','inleverans','tillverkning_in')
                    THEN m.quantity_kg ELSE 0 END) AS received_qty,
           SUM(CASE WHEN m.created_at < _end THEN m.quantity_kg ELSE 0 END) AS end_qty
      FROM public.stock_movements m
     WHERE m.location_id IN (SELECT id FROM sale_loc)
     GROUP BY m.product_id
  ),
  waste AS (
    SELECT m.product_id, -SUM(m.quantity_kg) AS waste_qty
      FROM public.stock_movements m
     WHERE m.location_id IN (SELECT id FROM locs)
       AND m.movement_type = 'svinn'
       AND m.created_at >= _start AND m.created_at < _end
     GROUP BY m.product_id
  )
  SELECT a.product_id,
         p.name,
         p.sku,
         COALESCE(p.unit, 'kg'),
         ROUND(a.start_qty, 3),
         ROUND(a.received_qty, 3),
         ROUND(a.end_qty, 3),
         ROUND(GREATEST(a.start_qty + a.received_qty - a.end_qty, 0), 3) AS disappeared_qty,
         ROUND(COALESCE(w.waste_qty, 0), 3) AS waste_qty,
         ROUND(GREATEST(a.start_qty + a.received_qty - a.end_qty - COALESCE(w.waste_qty, 0), 0), 3) AS sold_qty
    FROM agg a
    LEFT JOIN waste w ON w.product_id = a.product_id
    JOIN public.products p ON p.id = a.product_id
   WHERE ROUND(GREATEST(a.start_qty + a.received_qty - a.end_qty, 0), 3) > 0
      OR COALESCE(w.waste_qty, 0) <> 0
   ORDER BY 8 DESC, p.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_stock_disappearance(uuid, date, date) TO authenticated;