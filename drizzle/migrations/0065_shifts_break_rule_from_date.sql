CREATE OR REPLACE FUNCTION public.shifts_default_break()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE len int;
BEGIN
  IF NEW.break_minutes IS NULL THEN
    IF NEW.date < DATE '2026-11-26' THEN
      NEW.break_minutes := 0;
    ELSE
      len := (extract(epoch from NEW.end_time::time) - extract(epoch from NEW.start_time::time))::int / 60;
      IF len <= 0 THEN len := len + 1440; END IF;
      NEW.break_minutes := CASE WHEN len >= 300 THEN 30 ELSE 0 END;
    END IF;
  END IF;
  RETURN NEW;
END $$;