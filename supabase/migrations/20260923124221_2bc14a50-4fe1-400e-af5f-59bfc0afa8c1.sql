CREATE OR REPLACE FUNCTION public.block_shift_on_absence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_label text;
  v_from date;
  v_to date;
BEGIN
  IF NEW.employee_id IS NULL OR coalesce(NEW.status, '') = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(t.name, 'Ledighet'),
         coalesce(r.date_from, r.start_date),
         coalesce(r.date_to, r.end_date, r.date_from, r.start_date)
    INTO v_label, v_from, v_to
  FROM public.absence_requests r
  LEFT JOIN public.absence_types t ON t.id = r.absence_type_id
  WHERE r.employee_id = NEW.employee_id
    AND r.status IN ('approved', 'auto_approved')
    AND coalesce(r.extent_pct, 100) >= 100
    AND NEW.date BETWEEN coalesce(r.date_from, r.start_date)
                     AND coalesce(r.date_to, r.end_date, r.date_from, r.start_date)
  ORDER BY coalesce(r.date_from, r.start_date)
  LIMIT 1;

  IF v_label IS NOT NULL THEN
    RAISE EXCEPTION 'Personen är ledig % och kan inte schemaläggas den dagen (%).',
      to_char(NEW.date, 'YYYY-MM-DD'),
      v_label || ' ' || to_char(v_from, 'YYYY-MM-DD') ||
        CASE WHEN v_to > v_from THEN ' till ' || to_char(v_to, 'YYYY-MM-DD') ELSE '' END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_shift_on_absence ON public.shifts;
CREATE TRIGGER block_shift_on_absence
  BEFORE INSERT OR UPDATE OF employee_id, date, status ON public.shifts
  FOR EACH ROW EXECUTE FUNCTION public.block_shift_on_absence();