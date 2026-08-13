-- 1. Omräkning av hela saldotabellen från rörelseloggen
CREATE OR REPLACE FUNCTION public.rebuild_stock_from_movements()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  touched integer := 0;
  zeroed integer := 0;
BEGIN
  PERFORM set_config('app.stock_ledger', 'on', true);

  WITH agg AS (
    SELECT m.product_id,
           m.location_id,
           ROUND(SUM(m.quantity_kg)::numeric, 3) AS qty,
           CASE
             WHEN SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg ELSE 0 END) > 0
             THEN ROUND(
                    SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg * m.unit_cost ELSE 0 END)
                    / SUM(CASE WHEN m.quantity_kg > 0 AND m.unit_cost IS NOT NULL THEN m.quantity_kg ELSE 0 END), 2)
             ELSE NULL
           END AS avg_cost
      FROM public.stock_movements m
     GROUP BY m.product_id, m.location_id
  ), upserted AS (
    INSERT INTO public.product_stock_locations (product_id, location_id, quantity, avg_cost, unit_cost, stock_value, updated_at)
    SELECT a.product_id, a.location_id, a.qty, COALESCE(a.avg_cost, 0), COALESCE(a.avg_cost, 0),
           ROUND(a.qty * COALESCE(a.avg_cost, 0), 2), now()
      FROM agg a
    ON CONFLICT (product_id, location_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          avg_cost = COALESCE(NULLIF(EXCLUDED.avg_cost, 0), public.product_stock_locations.avg_cost, 0),
          unit_cost = COALESCE(NULLIF(EXCLUDED.unit_cost, 0), public.product_stock_locations.unit_cost, 0),
          stock_value = ROUND(EXCLUDED.quantity * COALESCE(NULLIF(EXCLUDED.avg_cost, 0), public.product_stock_locations.avg_cost, 0), 2),
          updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO touched FROM upserted;

  -- Saldorader utan någon rörelse i loggen kan inte bära kvantitet.
  WITH stale AS (
    UPDATE public.product_stock_locations psl
       SET quantity = 0,
           stock_value = 0,
           updated_at = now()
     WHERE psl.quantity <> 0
       AND NOT EXISTS (
         SELECT 1 FROM public.stock_movements m
          WHERE m.product_id = psl.product_id AND m.location_id = psl.location_id
       )
    RETURNING 1
  )
  SELECT count(*) INTO zeroed FROM stale;

  PERFORM set_config('app.stock_ledger', 'off', true);

  RETURN jsonb_build_object('rebuilt_rows', touched, 'zeroed_rows', zeroed, 'ran_at', now());
END;
$function$;

-- 2. Logg över avstämningskörningar
CREATE TABLE IF NOT EXISTS public.stock_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  diff_count integer NOT NULL DEFAULT 0,
  checked_rows integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'nattlig',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.stock_reconciliation_runs TO authenticated;
GRANT ALL ON public.stock_reconciliation_runs TO service_role;

ALTER TABLE public.stock_reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Personal kan läsa avstämningar"
ON public.stock_reconciliation_runs
FOR SELECT
TO authenticated
USING (public.is_staff() OR public.has_role(auth.uid(), 'admin'));

-- 3. Avstämning: saldotabellen mot rörelseloggen
CREATE OR REPLACE FUNCTION public.stock_reconciliation_check(_source text DEFAULT 'nattlig')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  diffs jsonb := '[]'::jsonb;
  n_diff integer := 0;
  n_rows integer := 0;
BEGIN
  WITH ledger AS (
    SELECT product_id, location_id, ROUND(SUM(quantity_kg)::numeric, 3) AS qty
      FROM public.stock_movements
     GROUP BY product_id, location_id
  ), joined AS (
    SELECT COALESCE(l.product_id, psl.product_id) AS product_id,
           COALESCE(l.location_id, psl.location_id) AS location_id,
           COALESCE(l.qty, 0) AS ledger_qty,
           COALESCE(psl.quantity, 0) AS balance_qty
      FROM ledger l
      FULL OUTER JOIN public.product_stock_locations psl
        ON psl.product_id = l.product_id AND psl.location_id = l.location_id
  )
  SELECT count(*),
         COALESCE(jsonb_agg(jsonb_build_object(
           'product_id', product_id,
           'location_id', location_id,
           'ledger_qty', ledger_qty,
           'balance_qty', balance_qty,
           'diff', ROUND(balance_qty - ledger_qty, 3)
         )) FILTER (WHERE ABS(balance_qty - ledger_qty) > 0.001), '[]'::jsonb),
         count(*) FILTER (WHERE ABS(balance_qty - ledger_qty) > 0.001)
    INTO n_rows, diffs, n_diff
    FROM joined;

  INSERT INTO public.stock_reconciliation_runs (diff_count, checked_rows, details, source)
  VALUES (n_diff, n_rows, diffs, COALESCE(_source, 'nattlig'));

  RETURN jsonb_build_object('diff_count', n_diff, 'checked_rows', n_rows, 'details', diffs);
END;
$function$;

REVOKE ALL ON FUNCTION public.rebuild_stock_from_movements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_stock_from_movements() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_reconciliation_check(text) TO authenticated, service_role;

-- 4. Kör omräkning och en första avstämning nu
SELECT public.rebuild_stock_from_movements();
SELECT public.stock_reconciliation_check('migration');
