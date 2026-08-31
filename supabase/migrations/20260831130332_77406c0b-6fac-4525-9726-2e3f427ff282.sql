ALTER TABLE public.weekly_store_report_closures
  DROP CONSTRAINT IF EXISTS weekly_store_report_closures_closed_by_fkey;

CREATE OR REPLACE FUNCTION public.weekly_closure_touch_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.weekly_store_report_closures;
  v_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  SELECT (to_date(v_row.iso_year::text || '-01-04', 'IYYY-MM-DD')
    - (EXTRACT(isodow FROM to_date(v_row.iso_year::text || '-01-04', 'IYYY-MM-DD'))::int - 1)
    + (v_row.iso_week - 1) * 7)
  INTO v_date;

  PERFORM public.recompute_weekly_store_report(v_row.store_id, v_date);
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.weekly_closure_touch_report() FROM anon, authenticated, public;