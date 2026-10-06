CREATE OR REPLACE FUNCTION public.skip_nonsales_weekly_report()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.unit_has_sales(NEW.store_id) THEN RETURN NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_skip_nonsales_weekly_report ON public.weekly_store_reports;
CREATE TRIGGER trg_skip_nonsales_weekly_report BEFORE INSERT ON public.weekly_store_reports
FOR EACH ROW EXECUTE FUNCTION public.skip_nonsales_weekly_report();