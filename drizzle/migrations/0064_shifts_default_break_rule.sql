CREATE OR REPLACE FUNCTION public.shifts_default_break()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE len int;
BEGIN
  IF NEW.break_minutes IS NULL THEN
    len := (extract(epoch from NEW.end_time::time) - extract(epoch from NEW.start_time::time))::int / 60;
    IF len <= 0 THEN len := len + 1440; END IF;
    NEW.break_minutes := CASE WHEN len >= 300 THEN 30 ELSE 0 END;
  END IF;
  RETURN NEW;
END $$;
ALTER TABLE public.shifts ALTER COLUMN break_minutes DROP DEFAULT;
DROP TRIGGER IF EXISTS shifts_default_break ON public.shifts;
CREATE TRIGGER shifts_default_break BEFORE INSERT ON public.shifts
FOR EACH ROW EXECUTE FUNCTION public.shifts_default_break();